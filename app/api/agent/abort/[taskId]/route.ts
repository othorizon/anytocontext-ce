import { requireUserId } from "@/lib/auth";
import { abortQuery } from "@/lib/agent/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { taskId } = await params;
    const ok = await abortQuery(userId, taskId);
    if (!ok) return new Response("Not found", { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[agent/abort]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
