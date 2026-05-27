import { z } from "zod";
import { CredentialActions, type CredentialAction } from "@/app/route.config";
import { requireUserId } from "@/lib/auth";
import {
  createSshCredential,
  deleteCredential,
  listCredentials,
  updateSshCredential,
} from "@/lib/db/credentials";
import { generateEd25519KeyPair } from "@/lib/ssh/keygen";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  privateKey: z.string().trim().min(20),
});

const UpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  privateKey: z.string().trim().min(20).optional(),
});

const DeleteSchema = z.object({ id: z.string().min(1) });

const GenerateSchema = z.object({
  comment: z.string().trim().max(80).optional(),
});

async function handle(
  action: CredentialAction,
  body: unknown,
  userId: string,
) {
  switch (action) {
    case CredentialActions.list: {
      const items = await listCredentials(userId);
      return Response.json({ items });
    }
    case CredentialActions.create: {
      const input = CreateSchema.parse(body);
      const item = await createSshCredential({
        userId,
        name: input.name,
        privateKey: input.privateKey,
      });
      return Response.json({ item });
    }
    case CredentialActions.update: {
      const input = UpdateSchema.parse(body);
      const item = await updateSshCredential({
        userId,
        id: input.id,
        name: input.name,
        privateKey: input.privateKey,
      });
      if (!item) return new Response("Not found", { status: 404 });
      return Response.json({ item });
    }
    case CredentialActions.delete: {
      const input = DeleteSchema.parse(body);
      const ok = await deleteCredential(userId, input.id);
      if (!ok) return new Response("Not found", { status: 404 });
      return Response.json({ ok: true });
    }
    case CredentialActions.generate: {
      const input = GenerateSchema.parse(body);
      const comment = input.comment?.trim() || `anytocontext-${userId.slice(-6)}`;
      // 私钥不入库——返回给客户端填表单，用户点保存才走 create
      const pair = generateEd25519KeyPair(comment);
      return Response.json({
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
        fingerprint: pair.fingerprint,
      });
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
    return await handle(action as CredentialAction, body, userId);
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "validation", issues: err.issues },
        { status: 400 },
      );
    }
    console.error("[credentials]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
