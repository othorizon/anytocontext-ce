/**
 * anytocontext Agent Worker —— 入口路由（v2 精简版）。
 *
 * 路径：
 *   GET  /health
 *   POST /backups/delete         {backupId}                            → 删除一份 SDK backup（删项目时调）
 *   POST /agent/start            AgentStartRequest                     → 创建 AgentWorkflow instance
 *   GET  /agent/wait/:id?ms=     → 长轮询 instance.status()
 *   POST /agent/abort/:id        → terminate instance
 *   POST /build/start            BuildStartRequest                     → 创建 BuildWorkflow instance
 *   GET  /build/wait/:id?ms=     → 长轮询
 *
 * v2 已移除：/sandbox/ensure-ready, /sandbox/remount, /sandbox/destroy, /sandbox/exec —— 共享 sandbox 模型废弃。
 */
import { checkInternalSecret } from "./auth";
import { deleteBackupRecord } from "./backup";
import { waitInstance } from "./wait-instance";
import type {
  AgentStartRequest,
  BuildStartRequest,
  DeleteBackupRequest,
} from "./types";

// 必须 re-export 让 wrangler 能发现 Durable Object / Workflow 类
export { Sandbox } from "@cloudflare/sandbox";
export { AgentWorkflow } from "./workflow";
export { BuildWorkflow } from "./build-workflow";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    const unauth = checkInternalSecret(request, env);
    if (unauth) return unauth;

    try {
      switch (`${request.method} ${url.pathname}`) {
        case "POST /backups/delete": {
          const body = (await request.json()) as DeleteBackupRequest;
          if (!body.backupId) {
            return Response.json(
              { ok: false, error: "backupId required" },
              { status: 400 },
            );
          }
          await deleteBackupRecord(env, body.backupId);
          return Response.json({ ok: true });
        }

        case "POST /agent/start": {
          const body = (await request.json()) as AgentStartRequest;
          const instance = await env.AGENT_WORKFLOW.create({
            id: body.taskId,
            params: body,
          });
          return Response.json({ taskId: body.taskId, instanceId: instance.id });
        }

        case "POST /build/start": {
          const body = (await request.json()) as BuildStartRequest;
          const instance = await env.BUILD_WORKFLOW.create({
            id: body.buildId,
            params: body,
          });
          return Response.json({ buildId: body.buildId, instanceId: instance.id });
        }
      }

      // /agent/wait/:id  and  /build/wait/:id
      const agentWait = url.pathname.match(/^\/agent\/wait\/([^/]+)$/);
      if (agentWait && request.method === "GET") {
        const ms = parseInt(url.searchParams.get("ms") ?? "60000", 10);
        const status = await waitInstance(env.AGENT_WORKFLOW, agentWait[1], ms);
        return Response.json(status);
      }
      const buildWait = url.pathname.match(/^\/build\/wait\/([^/]+)$/);
      if (buildWait && request.method === "GET") {
        const ms = parseInt(url.searchParams.get("ms") ?? "60000", 10);
        const status = await waitInstance(env.BUILD_WORKFLOW, buildWait[1], ms);
        return Response.json(status);
      }
      const agentAbort = url.pathname.match(/^\/agent\/abort\/([^/]+)$/);
      if (agentAbort && request.method === "POST") {
        try {
          const inst = await env.AGENT_WORKFLOW.get(agentAbort[1]);
          await inst.terminate();
          return Response.json({ ok: true });
        } catch (err) {
          return Response.json({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const buildAbort = url.pathname.match(/^\/build\/abort\/([^/]+)$/);
      if (buildAbort && request.method === "POST") {
        try {
          const inst = await env.BUILD_WORKFLOW.get(buildAbort[1]);
          await inst.terminate();
          return Response.json({ ok: true });
        } catch (err) {
          return Response.json({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("[worker]", err);
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }

    // 让 ctx 被引用，避免 TS 报 unused param
    void ctx;
  },
} satisfies ExportedHandler<Env>;
