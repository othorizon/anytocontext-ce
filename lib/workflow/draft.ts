/**
 * 工作流编辑器的本地草稿存取（localStorage）。
 * 构建 graph 与对话 graph 各占一份 key，避免两个 tab 串台；
 * StartBuildButton 等外部组件用 "build" kind 检测/清除草稿。
 */
import type { ChatGraph } from "@/lib/dto/chat-graph";
import type { WorkflowGraph } from "@/lib/dto/workflow";

export type DraftKind = "build" | "chat";

export function draftKey(projectId: string, kind: DraftKind): string {
  return `acx-wf-draft-${projectId}-${kind}`;
}

interface DraftPayload<T> {
  graph?: T;
}

function loadRaw<T>(
  projectId: string,
  kind: DraftKind,
  validate: (g: unknown) => g is T,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(projectId, kind));
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftPayload<T>;
    if (d.graph && validate(d.graph)) return d.graph;
  } catch {
    // ignore malformed draft
  }
  return null;
}

function isWorkflowGraph(g: unknown): g is WorkflowGraph {
  if (!g || typeof g !== "object") return false;
  const obj = g as Partial<WorkflowGraph>;
  return Array.isArray(obj.nodes) && Array.isArray(obj.edges);
}

function isChatGraph(g: unknown): g is ChatGraph {
  if (!g || typeof g !== "object") return false;
  const obj = g as Partial<ChatGraph>;
  return Array.isArray(obj.nodes) && Array.isArray(obj.edges);
}

export function loadDraft(projectId: string): WorkflowGraph | null {
  return loadRaw(projectId, "build", isWorkflowGraph);
}

export function loadChatDraft(projectId: string): ChatGraph | null {
  return loadRaw(projectId, "chat", isChatGraph);
}

export function hasDraft(projectId: string): boolean {
  return loadDraft(projectId) !== null;
}

export function clearDraft(projectId: string, kind: DraftKind = "build"): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(projectId, kind));
}

export function saveDraft(
  projectId: string,
  graph: WorkflowGraph,
): void {
  saveRaw(projectId, "build", graph);
}

export function saveChatDraft(projectId: string, graph: ChatGraph): void {
  saveRaw(projectId, "chat", graph);
}

function saveRaw<T>(projectId: string, kind: DraftKind, graph: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      draftKey(projectId, kind),
      JSON.stringify({ graph }),
    );
  } catch {
    // 配额不足等情况静默
  }
}
