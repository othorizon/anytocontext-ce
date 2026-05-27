/**
 * BuildWorkflow —— 一次构建任务的 Durable Object Workflow。
 *
 * 步骤：
 *   1. init-sandbox        起一次性 sandbox build-{buildId} + mkdir BUILD_DIR/WORKSPACE_DIR
 *   2. run-source-nodes    在 sandbox 内拓扑执行 git/text/script 节点 → /build/<name>
 *   3. assemble-workspace  按构建节点 outputDirs 把 /build/<name> 复制到 /workspace/<outputDir>
 *   4. backup-source       sandbox.createBackup(WORKSPACE_DIR) → DirectoryBackup
 *   5. delete-old-backup   若 previousBackupId 非空，删旧 backup 两个 R2 对象（best-effort）
 *   6. cleanup             safeDestroy(sandbox) + flush log
 *   7. notify-main-app     主动 POST 主应用 /api/internal/builds/finalize 回写终态
 *
 * 用户日志中不暴露 "backup" 字面：assemble 阶段用「制作构建产物」、备份阶段用「打包构建产物」。
 *
 * 末步 return { logKey, backup } 仍保留供 wait 接口读取作 fallback；
 * 但正常路径下主应用通过 step 7 回调直接落 DB，UI 列表 3s 内即可看到 SUCCESS。
 * 失败路径在 catch 里也走 finalize 回调（status=FAILED + error）。
 */
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { assembleWorkspace } from "./assemble";
import {
  backupWorkspace,
  deleteBackupRecord,
  WORKSPACE_DIR,
} from "./backup";
import { runSourceNodes } from "./build-runner";
import { R2LogWriter } from "./log-writer";
import {
  buildSandboxId,
  getBuildSandbox,
  prepareBuildDirs,
  safeDestroy,
} from "./sandbox-manager";
import type {
  BuildResultPayload,
  BuildStartRequest,
  DecryptedSshKey,
} from "./types";

export class BuildWorkflow extends WorkflowEntrypoint<Env, BuildStartRequest> {
  override async run(
    event: WorkflowEvent<BuildStartRequest>,
    step: WorkflowStep,
  ): Promise<BuildResultPayload> {
    const { buildId, userId, projectId, graph, sshKeys, previousBackupId } =
      event.payload;
    // 顶层前缀 _buildlogs/ —— R2 lifecycle 规则 expire-buildlogs 按此前缀过期
    const logKey = `_buildlogs/${userId}/${projectId}/${buildId}.log`;

    const sandboxId = buildSandboxId(buildId);
    const sandbox = getBuildSandbox(this.env, buildId);
    const log = new R2LogWriter(this.env.FILES, logKey);
    const sshMap = toSshMap(sshKeys);

    try {
      await step.do("init-sandbox", async () => {
        await log.appendLine(
          `[build ${buildId}] 初始化沙箱 ${sandboxId}；工作区 = ${WORKSPACE_DIR}`,
        );
        await prepareBuildDirs(sandbox);
      });

      await step.do("run-source-nodes", async () => {
        await runSourceNodes({ sandbox, graph, sshKeys: sshMap, log });
      });

      await step.do("assemble-workspace", async () => {
        await log.appendLine(`[build] 装配构建产物到 ${WORKSPACE_DIR}`);
        await assembleWorkspace({ sandbox, graph, log });
      });

      const backup = await step.do("backup-source", async () => {
        const name = `acx-${userId}-${projectId}-${buildId}`;
        await log.appendLine(`[build] 打包构建产物 (${WORKSPACE_DIR})`);
        const b = await backupWorkspace(this.env, sandbox, name);
        await log.appendLine(`[build] 构建产物已保存 id=${b.id}`);
        return { id: b.id, dir: b.dir, localBucket: b.localBucket };
      });

      await step.do("delete-old-backup", async () => {
        if (!previousBackupId) {
          await log.appendLine(`[build] 没有旧产物需要清理`);
          return;
        }
        await log.appendLine(`[build] 清理上一份构建产物 ${previousBackupId}`);
        // deleteBackupRecord 内部已 try/catch + console.error
        // 不让删旧失败影响构建结果（旧 backup 由 R2 lifecycle 兜底）
        await deleteBackupRecord(this.env, previousBackupId);
      });

      await step.do("cleanup", async () => {
        await log.appendLine(`[build] 销毁沙箱 ${sandboxId}`);
        await safeDestroy(sandbox);
        await log.appendLine(`[build] DONE`);
        await log.flush();
      });

      // 主应用回写：内部 endpoint 走 INTERNAL_API_SECRET 互信
      // 用 retries 兜底主应用临时不可达；用尽重试只 console.error 不让 workflow errored
      // —— wait 接口仍可作 fallback
      try {
        await step.do(
          "notify-main-app",
          {
            timeout: "2 minutes",
            retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
          },
          async () => {
            await postFinalize(this.env, {
              buildId,
              status: "SUCCESS",
              logKey,
              backup,
            });
          },
        );
      } catch (notifyErr) {
        console.error(
          "[build] notify-main-app exhausted retries (will rely on wait fallback):",
          notifyErr,
        );
      }

      return { logKey, backup };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log.appendLine(`[build] FAILED: ${msg}`);
      try {
        await log.flush();
      } catch (e) {
        console.error("[build] final log flush failed", e);
      }
      // 失败时也尽量销毁 sandbox（任务级独占，泄漏没意义）
      await safeDestroy(sandbox);
      // 同步通知主应用失败终态（best-effort，单次尝试；用 step.do 而非裸 fetch 保证 retry）
      try {
        await step.do(
          "notify-main-app-failed",
          {
            timeout: "2 minutes",
            retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
          },
          async () => {
            await postFinalize(this.env, {
              buildId,
              status: "FAILED",
              logKey,
              error: msg,
            });
          },
        );
      } catch (notifyErr) {
        console.error(
          "[build] notify-main-app-failed exhausted retries:",
          notifyErr,
        );
      }
      throw err;
    }
  }
}

interface FinalizePayload {
  buildId: string;
  status: "SUCCESS" | "FAILED";
  logKey: string;
  backup?: { id: string; dir: string; localBucket?: boolean };
  error?: string;
}

async function postFinalize(env: Env, payload: FinalizePayload): Promise<void> {
  const baseUrl = env.MAIN_APP_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("MAIN_APP_BASE_URL not configured on worker");
  }
  const res = await fetch(`${baseUrl}/api/internal/builds/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-secret": env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`finalize ${res.status}: ${text}`);
  }
}

function toSshMap(list: DecryptedSshKey[]): Map<string, DecryptedSshKey> {
  const m = new Map<string, DecryptedSshKey>();
  for (const k of list) m.set(k.credentialId, k);
  return m;
}
