import type { AgentResult } from "@/lib/agent/types";
import { postAction, jsonFetcher } from "./fetcher";

export type { AgentResult };

export async function startQuery(input: {
  projectId: string;
  prompt: string;
}): Promise<AgentResult> {
  return await postAction<AgentResult>("/api/agent/query", input);
}

export async function pollResult(
  taskId: string,
  waitMs = 30_000,
): Promise<AgentResult> {
  return await jsonFetcher<AgentResult>(
    `/api/agent/result/${encodeURIComponent(taskId)}?waitMs=${waitMs}`,
  );
}

export async function abortQueryApi(taskId: string): Promise<void> {
  await postAction(`/api/agent/abort/${encodeURIComponent(taskId)}`, {});
}
