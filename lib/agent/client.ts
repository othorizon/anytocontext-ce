/**
 * 主应用 → agent worker 的 HTTP 调用封装。
 *
 * 所有调用都带 INTERNAL_API_SECRET。
 * 出错统一抛 Error。
 */
import type {
  AgentStartPayload,
  BuildStartPayload,
  NormalizedWorkflowStatus,
} from "./types";

function getConfig(): { baseUrl: string; secret: string } {
  const baseUrl = process.env.SANDBOX_WORKER_URL;
  const secret = process.env.INTERNAL_API_SECRET;
  if (!baseUrl) throw new Error("SANDBOX_WORKER_URL is not set");
  if (!secret) throw new Error("INTERNAL_API_SECRET is not set");
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret };
}

async function workerFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const { baseUrl, secret } = getConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "x-internal-api-secret": secret,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`worker ${path} ${res.status}: ${text}`);
  }
  return res;
}

export const agentClient = {
  async startBuild(payload: BuildStartPayload): Promise<{ buildId: string }> {
    const res = await workerFetch("/build/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return (await res.json()) as { buildId: string };
  },

  async waitBuild(
    buildId: string,
    maxMs: number,
  ): Promise<NormalizedWorkflowStatus> {
    const res = await workerFetch(
      `/build/wait/${encodeURIComponent(buildId)}?ms=${maxMs}`,
      { method: "GET" },
    );
    return (await res.json()) as NormalizedWorkflowStatus;
  },

  async startAgent(payload: AgentStartPayload): Promise<{ taskId: string }> {
    const res = await workerFetch("/agent/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return (await res.json()) as { taskId: string };
  },

  async waitAgent(
    taskId: string,
    maxMs: number,
  ): Promise<NormalizedWorkflowStatus> {
    const res = await workerFetch(
      `/agent/wait/${encodeURIComponent(taskId)}?ms=${maxMs}`,
      { method: "GET" },
    );
    return (await res.json()) as NormalizedWorkflowStatus;
  },

  async abortAgent(taskId: string): Promise<void> {
    await workerFetch(`/agent/abort/${encodeURIComponent(taskId)}`, {
      method: "POST",
    });
  },

  async abortBuild(buildId: string): Promise<void> {
    await workerFetch(`/build/abort/${encodeURIComponent(buildId)}`, {
      method: "POST",
    });
  },

  /**
   * 删除一份 SDK backup（两个 R2 对象）。delete project 流程调用；
   * worker 内部 best-effort，404/500 都不抛业务错（旧 backup 由 R2 lifecycle 兜底）。
   */
  async deleteBackup(backupId: string): Promise<void> {
    await workerFetch("/backups/delete", {
      method: "POST",
      body: JSON.stringify({ backupId }),
    });
  },
};
