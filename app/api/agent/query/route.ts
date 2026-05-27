import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { runAgentQuery } from "@/lib/agent/service";

const Schema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().trim().min(1).max(8000),
});

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = Schema.parse(await req.json());
    const result = await runAgentQuery({
      userId,
      projectId: body.projectId,
      prompt: body.prompt,
      waitMs: 60_000,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "validation", issues: err.issues },
        { status: 400 },
      );
    }
    console.error("[agent/query]", err);
    return new Response(
      err instanceof Error ? err.message : "Internal Server Error",
      { status: 500 },
    );
  }
}
