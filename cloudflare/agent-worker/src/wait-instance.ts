/**
 * Worker 端长轮询 Cloudflare Workflow instance 状态。
 *
 * IO wait 不消耗 CPU 时间，所以可以等 60s+；
 * 主应用调 /agent/wait/:id?ms=60000 / /build/wait/:id?ms=60000 触发它。
 */

export interface NormalizedStatus {
  status:
    | "queued"
    | "running"
    | "paused"
    | "complete"
    | "errored"
    | "terminated"
    /** Workflow instance 已被 GC / 从未创建 / id 错误（workflow.get 抛 not found） */
    | "not_found"
    /** 其它 RPC 临时错误，主应用应保持原状下次再试 */
    | "unknown";
  output?: unknown;
  error?: string;
}

function isTerminal(s: NormalizedStatus["status"]): boolean {
  return (
    s === "complete" ||
    s === "errored" ||
    s === "terminated" ||
    s === "not_found"
  );
}

/**
 * Cloudflare Workflows `binding.get(id)` 在 instance 不存在 / id 无效时会抛错。
 * 通过错误消息识别这类情况（CF 官方文档建议 try/catch；目前 SDK 没暴露专门的错误类）。
 */
function isInstanceNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not\s*found|does\s*not\s*exist|no\s*such\s*instance|404/i.test(msg);
}

// Workflow.get() / instance.status() 在不同环境下返回的字段名略有差异；
// 这里只取我们关心的字段，避免对全 schema 做严格类型。
interface WorkflowNamespace {
  get(id: string): Promise<{
    status(): Promise<{
      status: string;
      output?: unknown;
      error?: { message?: string } | string;
    }>;
  }>;
}

function normalize(raw: {
  status: string;
  output?: unknown;
  error?: { message?: string } | string;
}): NormalizedStatus {
  let status: NormalizedStatus["status"] = "unknown";
  switch (raw.status) {
    case "queued":
    case "running":
    case "paused":
    case "complete":
    case "errored":
    case "terminated":
      status = raw.status;
      break;
    default:
      status = "unknown";
  }
  let error: string | undefined;
  if (typeof raw.error === "string") error = raw.error;
  else if (raw.error && typeof raw.error === "object")
    error = raw.error.message;
  return { status, output: raw.output, error };
}

export async function waitInstance(
  workflow: WorkflowNamespace,
  id: string,
  maxMs: number,
): Promise<NormalizedStatus> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    let s: NormalizedStatus;
    try {
      const inst = await workflow.get(id);
      s = normalize(await inst.status());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isInstanceNotFoundError(err)) {
        return { status: "not_found", error: msg };
      }
      // 其它临时错（RPC 偶尔失败、网络抖动）→ unknown，主应用保持原状下次再试
      return { status: "unknown", error: msg };
    }
    if (isTerminal(s.status)) return s;
    const slept = Math.min(1000, deadline - Date.now());
    if (slept > 0) await sleep(slept);
  }
  // 超时再读一次最新状态返回
  try {
    const inst = await workflow.get(id);
    return normalize(await inst.status());
  } catch (err) {
    if (isInstanceNotFoundError(err)) {
      return {
        status: "not_found",
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return { status: "unknown" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
