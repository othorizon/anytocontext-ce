import { requireUserId } from "@/lib/auth";
import { waitForResult } from "@/lib/agent/service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { taskId } = await params;
    const url = new URL(req.url);
    const waitMs = Math.max(
      1000,
      Math.min(60_000, Number(url.searchParams.get("waitMs") ?? 30_000)),
    );
    const r = await waitForResult(userId, taskId, waitMs);
    if (r.status === "not_found") {
      return new Response("Not found", { status: 404 });
    }
    return Response.json(r);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[agent/result]", err);
    return new Response(
      err instanceof Error ? err.message : "Internal Server Error",
      { status: 500 },
    );
  }
}
