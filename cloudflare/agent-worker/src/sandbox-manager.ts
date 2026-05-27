/**
 * Sandbox 生命周期辅助（v2 精简版）：
 * - 每个 build / agent task 都独占一个 sandbox，结束即 destroy
 * - 不再共享、不再有 SandboxLifecycle DO、不再 mount R2
 */
import { getSandbox, type Sandbox } from "@cloudflare/sandbox";
import { BUILD_DIR, WORKSPACE_DIR } from "./backup";

/** 一次性 sandbox（build / agent 用）—— 任务跑完 destroy，sleepAfter 仅作为兜底回收 */
const TASK_SANDBOX_SLEEP_AFTER = "5m";

export function buildSandboxId(buildId: string): string {
  return `build-${buildId}`;
}

export function agentSandboxId(taskId: string): string {
  return `agent-${taskId}`;
}

export function getBuildSandbox(env: Env, buildId: string): Sandbox {
  return getSandbox(env.Sandbox, buildSandboxId(buildId), {
    sleepAfter: TASK_SANDBOX_SLEEP_AFTER,
  });
}

export function getAgentSandbox(env: Env, taskId: string): Sandbox {
  return getSandbox(env.Sandbox, agentSandboxId(taskId), {
    sleepAfter: TASK_SANDBOX_SLEEP_AFTER,
  });
}

/** 创建 BUILD_DIR + WORKSPACE_DIR；build 启动时调；幂等 */
export async function prepareBuildDirs(sandbox: Sandbox): Promise<void> {
  await sandbox.mkdir(BUILD_DIR, { recursive: true });
  await sandbox.mkdir(WORKSPACE_DIR, { recursive: true });
}

/** Agent 启动时只需 WORKSPACE_DIR；restoreBackup 会重新挂载 overlay */
export async function prepareWorkspaceDir(sandbox: Sandbox): Promise<void> {
  await sandbox.mkdir(WORKSPACE_DIR, { recursive: true });
}

/** Destroy 包一层 try/catch，吞 "not found" 类错误，使 cleanup 幂等 */
export async function safeDestroy(sandbox: Sandbox): Promise<void> {
  try {
    await sandbox.destroy();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/not found|no such|does not exist/i.test(msg)) {
      console.warn("[sandbox] safeDestroy warning:", msg);
    }
  }
}
