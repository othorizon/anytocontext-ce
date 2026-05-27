import { z } from "zod";
import { ApiKeyActions, type ApiKeyAction } from "@/app/route.config";
import { requireUserId } from "@/lib/auth";
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  updateApiKeyScope,
} from "@/lib/db/api-keys";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopeAll: z.boolean(),
  projectScope: z.array(z.string()).default([]),
});

const UpdateScopeSchema = z.object({
  id: z.string().min(1),
  scopeAll: z.boolean(),
  projectScope: z.array(z.string()).default([]),
});

const DeleteSchema = z.object({ id: z.string().min(1) });

async function handle(action: ApiKeyAction, body: unknown, userId: string) {
  switch (action) {
    case ApiKeyActions.list: {
      const items = await listApiKeys(userId);
      return Response.json({ items });
    }
    case ApiKeyActions.create: {
      const input = CreateSchema.parse(body);
      const item = await createApiKey({
        userId,
        name: input.name,
        scopeAll: input.scopeAll,
        projectScope: input.projectScope,
      });
      return Response.json({ item });
    }
    case ApiKeyActions.updateScope: {
      const input = UpdateScopeSchema.parse(body);
      const item = await updateApiKeyScope({
        userId,
        id: input.id,
        scopeAll: input.scopeAll,
        projectScope: input.projectScope,
      });
      if (!item) return new Response("Not found", { status: 404 });
      return Response.json({ item });
    }
    case ApiKeyActions.delete: {
      const input = DeleteSchema.parse(body);
      const ok = await deleteApiKey(userId, input.id);
      if (!ok) return new Response("Not found", { status: 404 });
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
    return await handle(action as ApiKeyAction, body, userId);
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "validation", issues: err.issues },
        { status: 400 },
      );
    }
    console.error("[api-keys]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
