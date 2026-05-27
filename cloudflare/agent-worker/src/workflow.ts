/**
 * AgentWorkflow —— 一次独立查询的 Durable Object Workflow。
 *
 * 步骤：
 *   1. create-sandbox-and-restore: 起独占 agent-{taskId} sandbox + restoreWorkspace(backup)
 *   2. agent-loop:                 ReAct 循环（OpenAI function calling），双层超时保护
 *   3. cleanup-sandbox:            safeDestroy（即使 agent-loop 抛错也跑：用 try/finally）
 *
 * 每个 task 独占一个全新 sandbox；任务结束即销毁，不复用。
 * abort 走 instance.terminate()，整个 isolate 终止；container 由 sleepAfter 自动回收。
 *
 * 超时策略：
 *   - 内层：Promise.race + setTimeout(AGENT_LOOP_TIMEOUT_MS)，超时抛 NonRetryableError 给前端
 *   - 外层：step.do timeout = STEP_TIMEOUT（比内层长 1 分钟）作为 CF 兜底
 *   - 内层必须严格小于外层，否则 CF 可能先触发 timeout 抛出不可控错误文本
 *   - retries.limit=1 防止 CF 默认 5 次重试浪费配额
 */
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { runAgentLoop } from "./agent-loop";
import { restoreWorkspace } from "./backup";
import {
  agentSandboxId,
  getAgentSandbox,
  prepareWorkspaceDir,
  safeDestroy,
} from "./sandbox-manager";
import type { AgentStartRequest } from "./types";

/** 业务超时：5 分钟内未完成就以 NonRetryableError 形式抛出友好文案 */
const AGENT_LOOP_TIMEOUT_MS = 5 * 60 * 1000;
/** CF 步骤超时（兜底）：比业务超时长 1 分钟，确保业务 timer 一定先触发 */
const STEP_TIMEOUT = "6 minutes";

export class AgentWorkflow extends WorkflowEntrypoint<Env, AgentStartRequest> {
  override async run(
    event: WorkflowEvent<AgentStartRequest>,
    step: WorkflowStep,
  ): Promise<{ finalText: string }> {
    const { taskId, prompt, systemPrompt, backup } = event.payload;
    const sandboxId = agentSandboxId(taskId);
    const sandbox = getAgentSandbox(this.env, taskId);

    try {
      await step.do("create-sandbox-and-restore", async () => {
        console.log(
          `[agent ${taskId}] sandbox=${sandboxId} restore backup id=${backup.id} dir=${backup.dir}`,
        );
        await prepareWorkspaceDir(sandbox);
        await restoreWorkspace(this.env, sandbox, backup);
      });

      const finalText = await step.do(
        "agent-loop",
        {
          timeout: STEP_TIMEOUT,
          // agent 任务超时重跑没有意义，限制为 1 次；NonRetryableError 也会阻止重试
          retries: { limit: 1, delay: "1 second", backoff: "constant" },
        },
        async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            return await Promise.race([
              runAgentLoop({
                env: this.env,
                systemPrompt,
                userPrompt: prompt,
                getSandbox: async () => sandbox,
              }),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  reject(
                    new NonRetryableError(
                      "agent 任务超时（5 分钟内未完成），请简化提问或拆分任务后重试",
                    ),
                  );
                }, AGENT_LOOP_TIMEOUT_MS);
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        },
      );

      return { finalText };
    } finally {
      // 即使 agent-loop 抛错也跑销毁。abort/terminate 会直接杀掉 isolate，
      // 这里不一定能执行到 —— container 仍由 sleepAfter 兜底回收。
      try {
        await step.do("cleanup-sandbox", async () => {
          console.log(`[agent ${taskId}] destroy sandbox ${sandboxId}`);
          await safeDestroy(sandbox);
        });
      } catch (err) {
        // step.do 在 workflow 已经 errored 后再调有可能失败；忽略
        console.warn(`[agent ${taskId}] cleanup-sandbox step failed:`, err);
      }
    }
  }
}
