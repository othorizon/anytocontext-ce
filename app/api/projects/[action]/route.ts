import { z } from "zod";
import { ProjectActions, type ProjectAction } from "@/app/route.config";
import { requireUserId } from "@/lib/auth";
import {
  createProject,
  deleteProject,
  getProject,
  getProjectCurrentBackup,
  listProjects,
  renameProject,
  updateProjectChatGraph,
  updateProjectGraph,
} from "@/lib/db/projects";
import type { ChatGraph, WorkflowGraph } from "@/lib/dto";
import { ensureChatGraph } from "@/lib/dto/chat-graph";

const IdSchema = z.object({ id: z.string().min(1) });
const CreateSchema = z.object({ name: z.string().trim().min(1).max(80) });
const RenameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
});
// graph 校验在前端 + worker assemble-workspace 两道；这里只确保形状是个对象
const SaveGraphSchema = z.object({
  id: z.string().min(1),
  graph: z.unknown(),
});
const SaveChatGraphSchema = z.object({
  id: z.string().min(1),
  chatGraph: z.unknown(),
});

async function handle(action: ProjectAction, body: unknown, userId: string) {
  switch (action) {
    case ProjectActions.list: {
      const items = await listProjects(userId);
      return Response.json({ items });
    }
    case ProjectActions.get: {
      const { id } = IdSchema.parse(body);
      const item = await getProject(userId, id);
      if (!item) return new Response("Not found", { status: 404 });
      return Response.json({ item });
    }
    case ProjectActions.create: {
      const { name } = CreateSchema.parse(body);
      const item = await createProject(userId, name);
      return Response.json({ item });
    }
    case ProjectActions.rename: {
      const input = RenameSchema.parse(body);
      const item = await renameProject(userId, input.id, input.name);
      if (!item) return new Response("Not found", { status: 404 });
      return Response.json({ item });
    }
    case ProjectActions.saveGraph: {
      const input = SaveGraphSchema.parse(body);
      const item = await updateProjectGraph(
        userId,
        input.id,
        input.graph as WorkflowGraph,
      );
      if (!item) return new Response("Not found", { status: 404 });
      return Response.json({ item });
    }
    case ProjectActions.saveChatGraph: {
      const input = SaveChatGraphSchema.parse(body);
      // ensureChatGraph 兜底防御：前端理论上传完整结构，但万一缺字段也兜出合法形状
      const chatGraph: ChatGraph = ensureChatGraph(input.chatGraph);
      const item = await updateProjectChatGraph(userId, input.id, chatGraph);
      if (!item) return new Response("Not found", { status: 404 });
      return Response.json({ item });
    }
    case ProjectActions.delete: {
      const { id } = IdSchema.parse(body);
      // 先读 backup，再删 DB —— 否则级联删了 Project 就拿不到 currentBackup
      const backup = await getProjectCurrentBackup(id).catch(() => null);
      const ok = await deleteProject(userId, id);
      if (!ok) return new Response("Not found", { status: 404 });
      // best-effort 清理：backup 走 worker BACKUP_BUCKET binding；构建日志走主应用 R2 client
      if (backup?.id) {
        try {
          const { agentClient } = await import("@/lib/agent/client");
          await agentClient.deleteBackup(backup.id);
        } catch (err) {
          console.warn("[projects/delete] delete backup failed", err);
        }
      }
      try {
        const { deletePrefix } = await import("@/lib/r2");
        await deletePrefix(`_buildlogs/${userId}/${id}/`);
      } catch (err) {
        console.warn("[projects/delete] R2 cleanup failed", err);
      }
      return Response.json({ ok: true });
    }
    default:
      return new Response("Unknown action", { status: 400 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const userId = await requireUserId();
    const { action } = await params;
    const body = (await req.json().catch(() => ({}))) as unknown;
    return await handle(action as ProjectAction, body, userId);
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "validation", issues: err.issues },
        { status: 400 },
      );
    }
    console.error("[projects]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
