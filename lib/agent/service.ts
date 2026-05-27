/**
 * 主应用侧的 Agent 查询服务：
 * - runAgentQuery: 创建 QueryTask + 调 worker /agent/start + long-poll /agent/wait
 * - waitForResult: 用同一 taskId 再次 long-poll
 * - abortQuery: 调 worker /agent/abort
 *
 * Playground 与 MCP 共用同一套 service。
 * 对话所用的模型 / 系统提示词从 project.chatGraph 的 chat-model 节点读取；
 * 占位符 {source.<name>.path} 渲染时按 project.graph 的构建节点 outputDirs 解析。
 */
import { nanoid } from "nanoid";
import { agentClient } from "./client";
import { toAgentResult, toWorkflowOutcome, type AgentResult } from "./types";
import { findChatModel } from "@/lib/dto/chat-graph";
import { renderSystemPrompt } from "@/lib/workflow/prompt";
import { getProject, getProjectCurrentBackup } from "@/lib/db/projects";
import { createQueryTask, getQueryTaskMeta } from "@/lib/db/query-tasks";

interface QueryParams {
  userId: string;
  projectId: string;
  prompt: string;
  /** 单次 HTTP 等待上限 ms；默认 60s */
  waitMs?: number;
}

export async function runAgentQuery({
  userId,
  projectId,
  prompt,
  waitMs = 60_000,
}: QueryParams): Promise<AgentResult> {
  const project = await getProject(userId, projectId);
  if (!project) {
    return { status: "failed", error: "Project not found" };
  }
  const chatModel = findChatModel(project.chatGraph);
  if (!chatModel) {
    return {
      status: "failed",
      error: "对话模型节点缺失，请到「对话」tab 重新保存",
    };
  }
  const systemPrompt = renderSystemPrompt(
    chatModel.data.systemPrompt || "",
    project.graph,
  );

  // 必须先构建过一次才能查询（agent sandbox 启动时需 restoreWorkspace）
  const backup = await getProjectCurrentBackup(projectId);
  if (!backup) {
    return {
      status: "failed",
      error: "项目尚无可用构建，请先到「构建」tab 触发一次构建",
    };
  }

  const taskId = nanoid();
  await createQueryTask({ id: taskId, userId, projectId });

  await agentClient.startAgent({
    taskId,
    userId,
    projectId,
    prompt,
    systemPrompt,
    backup,
  });

  const status = await agentClient.waitAgent(taskId, waitMs);
  return toAgentResult(toWorkflowOutcome(status), taskId);
}

export async function waitForResult(
  userId: string,
  taskId: string,
  waitMs: number,
): Promise<AgentResult | { status: "not_found" }> {
  const meta = await getQueryTaskMeta(taskId);
  if (!meta || meta.userId !== userId) {
    return { status: "not_found" };
  }
  const status = await agentClient.waitAgent(taskId, waitMs);
  return toAgentResult(toWorkflowOutcome(status), taskId);
}

export async function abortQuery(
  userId: string,
  taskId: string,
): Promise<boolean> {
  const meta = await getQueryTaskMeta(taskId);
  if (!meta || meta.userId !== userId) return false;
  try {
    await agentClient.abortAgent(taskId);
  } catch (err) {
    console.warn("[agent] abort failed", err);
    return false;
  }
  return true;
}
