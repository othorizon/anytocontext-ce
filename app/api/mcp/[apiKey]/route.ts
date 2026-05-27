/**
 * MCP server endpoint (streamable HTTP, stateless).
 *
 * 暴露两个工具：
 *   - query_project({ projectId, prompt })  最长等 60s；超时返 pending + taskId
 *   - get_query_result({ taskId })          最长等 30s；超时返 pending
 *
 * 鉴权：URL path 取 apiKey → sha256 比对 ApiKey.keyHash。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  findApiKeyByPlaintext,
  isProjectInScope,
} from "@/lib/db/api-keys";
import { getQueryTaskMeta } from "@/lib/db/query-tasks";
import { runAgentQuery, waitForResult } from "@/lib/agent/service";

export const runtime = "nodejs";

interface ApiKeyRow {
  id: string;
  userId: string;
  scopeAll: boolean;
  projectScope: string[];
}

function buildMcpServer(apiKey: ApiKeyRow): McpServer {
  const server = new McpServer({
    name: "anytocontext",
    version: "0.1.0",
  });

  server.registerTool(
    "query_project",
    {
      description:
        "向指定项目发起一次独立查询。如果 60 秒内完成则直接返回结果；若仍在执行，返回 structuredContent.status='pending' 与 taskId —— 请继续调用 get_query_result(taskId) 直至 done 或 failed。每次查询都是独立的，无对话历史。",
      inputSchema: {
        projectId: z.string().min(1),
        prompt: z.string().min(1),
      },
    },
    async ({ projectId, prompt }) => {
      if (!isProjectInScope(apiKey, projectId)) {
        return {
          isError: true,
          content: [
            { type: "text", text: `Forbidden: projectId ${projectId} 不在该 API Key 的授权范围` },
          ],
        };
      }
      const r = await runAgentQuery({
        userId: apiKey.userId,
        projectId,
        prompt,
        waitMs: 60_000,
      });
      if (r.status === "done") {
        return { content: [{ type: "text", text: r.finalText }] };
      }
      if (r.status === "failed") {
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${r.error}` }],
        };
      }
      if (r.status === "aborted") {
        return {
          isError: true,
          content: [{ type: "text", text: "任务已被取消" }],
        };
      }
      // pending
      return {
        content: [
          {
            type: "text",
            text: `任务仍在执行，请调用 get_query_result 获取结果。taskId=${r.taskId}`,
          },
        ],
        structuredContent: { status: "pending", taskId: r.taskId },
      };
    },
  );

  server.registerTool(
    "get_query_result",
    {
      description:
        "拉取 query_project 返回的 pending 任务结果。每次最长等待 30 秒；若仍未完成则再次返回 pending —— 客户端可继续调直到 done/failed。",
      inputSchema: {
        taskId: z.string().min(1),
      },
    },
    async ({ taskId }) => {
      // 校验 taskId 归属该 API key
      const meta = await getQueryTaskMeta(taskId);
      if (!meta || meta.userId !== apiKey.userId) {
        return {
          isError: true,
          content: [{ type: "text", text: "taskId 不存在或不属于该 API Key" }],
        };
      }
      if (!isProjectInScope(apiKey, meta.projectId)) {
        return {
          isError: true,
          content: [{ type: "text", text: "该 taskId 关联的 projectId 不在授权范围" }],
        };
      }
      const r = await waitForResult(apiKey.userId, taskId, 30_000);
      if (r.status === "not_found") {
        return {
          isError: true,
          content: [{ type: "text", text: "任务不存在或已过期" }],
        };
      }
      if (r.status === "done") {
        return { content: [{ type: "text", text: r.finalText }] };
      }
      if (r.status === "failed") {
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${r.error}` }],
        };
      }
      if (r.status === "aborted") {
        return {
          isError: true,
          content: [{ type: "text", text: "任务已被取消" }],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `任务仍在执行，请稍后再调 get_query_result。taskId=${taskId}`,
          },
        ],
        structuredContent: { status: "pending", taskId },
      };
    },
  );

  return server;
}

async function handle(
  request: Request,
  { params }: { params: Promise<{ apiKey: string }> },
): Promise<Response> {
  const { apiKey } = await params;
  const apiKeyRow = await findApiKeyByPlaintext(apiKey);
  if (!apiKeyRow) {
    return new Response("Unauthorized", { status: 401 });
  }
  const server = buildMcpServer(apiKeyRow);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return await transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
