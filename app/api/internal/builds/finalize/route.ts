/**
 * Internal endpoint —— 仅供 cloudflare agent worker 调用。
 *
 * BuildWorkflow 的 notify-main-app step 在构建完成（成功/失败）时 POST 到这里，
 * 直接把 Build.status 写到 DB（成功路径同事务覆盖 Project.currentBackup）。
 * UI 列表 SWR 3s 一拉，就能立刻看到终态，不再依赖 /api/builds/get short-poll。
 *
 * 鉴权：与 worker 共享的 INTERNAL_API_SECRET（与 lib/agent/client.ts 中互信通道同源）。
 */
import { z } from "zod";
import { finalizeBuild } from "@/lib/db/builds";

const BackupSchema = z.object({
  id: z.string().min(1),
  dir: z.string().min(1),
  localBucket: z.boolean().optional(),
});

const PayloadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("SUCCESS"),
    buildId: z.string().min(1),
    logKey: z.string().min(1),
    backup: BackupSchema,
  }),
  z.object({
    status: z.literal("FAILED"),
    buildId: z.string().min(1),
    logKey: z.string().min(1).optional(),
    error: z.string().min(1),
  }),
]);

function checkSecret(req: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) return false;
  return req.headers.get("x-internal-api-secret") === expected;
}

export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  try {
    if (payload.status === "SUCCESS") {
      await finalizeBuild(payload.buildId, {
        status: "SUCCESS",
        logKey: payload.logKey,
        backup: payload.backup,
      });
    } else {
      await finalizeBuild(payload.buildId, {
        status: "FAILED",
        error: payload.error,
        logKey: payload.logKey,
      });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[internal/builds/finalize]", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "internal_error" },
      { status: 500 },
    );
  }
}
