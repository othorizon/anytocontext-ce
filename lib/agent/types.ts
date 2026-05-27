/**
 * 主应用 ↔ agent worker 共享的入参 / 状态类型。
 * worker 侧也有一份（cloudflare/agent-worker/src/types.ts），手工同步。
 */
import type { BackupHandle } from "@/lib/db/projects";
import type { WorkflowGraph } from "@/lib/dto/workflow";

export interface DecryptedSshKey {
  credentialId: string;
  privateKey: string;
  knownHosts?: string;
}

export interface BuildStartPayload {
  buildId: string;
  userId: string;
  projectId: string;
  graph: WorkflowGraph;
  sshKeys: DecryptedSshKey[];
  /** 上一次成功构建的 backup id；首次构建为 null。worker 在新 backup 完成后会删旧。 */
  previousBackupId: string | null;
}

export interface AgentStartPayload {
  taskId: string;
  userId: string;
  projectId: string;
  prompt: string;
  systemPrompt: string;
  /** 主应用从 Project.currentBackup 取出的 backup 句柄 */
  backup: BackupHandle;
}

/** BuildWorkflow.complete 时 instance.status().output 的形状（与 worker BuildResultPayload 对齐） */
export interface BuildOutput {
  logKey: string;
  backup: BackupHandle;
}

export interface NormalizedWorkflowStatus {
  status:
    | "queued"
    | "running"
    | "paused"
    | "complete"
    | "errored"
    | "terminated"
    /** workflow instance 已被 GC / id 错误（worker workflow.get 抛 not found） */
    | "not_found"
    /** RPC 临时失败，调用方应保持原状下次再试 */
    | "unknown";
  output?: unknown;
  error?: string;
}

/** 内部 helper：把 workflow 状态归一化到终态/非终态；pending 不带 taskId */
type WorkflowOutcome =
  | { status: "done"; finalText: string }
  | { status: "failed"; error: string }
  | { status: "aborted" }
  | { status: "pending" };

export function toWorkflowOutcome(s: NormalizedWorkflowStatus): WorkflowOutcome {
  if (s.status === "complete") {
    const finalText =
      (s.output as { finalText?: string } | undefined)?.finalText ?? "";
    return { status: "done", finalText };
  }
  if (s.status === "errored") {
    return { status: "failed", error: s.error ?? "unknown error" };
  }
  if (s.status === "terminated") return { status: "aborted" };
  if (s.status === "not_found") {
    return {
      status: "failed",
      error: "workflow instance 不存在（可能已被回收）",
    };
  }
  return { status: "pending" };
}

/** 对外返回的查询结果；pending 一定带 taskId */
export type AgentResult =
  | { status: "done"; finalText: string }
  | { status: "failed"; error: string }
  | { status: "aborted" }
  | { status: "pending"; taskId: string };

/** 把 outcome + taskId 合成对外的 AgentResult */
export function toAgentResult(
  outcome: WorkflowOutcome,
  taskId: string,
): AgentResult {
  if (outcome.status === "pending") {
    return { status: "pending", taskId };
  }
  return outcome;
}
