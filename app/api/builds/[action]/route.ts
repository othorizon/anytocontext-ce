import { after } from "next/server";
import { z } from "zod";
import { BuildActions, type BuildAction } from "@/app/route.config";
import { requireUserId } from "@/lib/auth";
import { agentClient } from "@/lib/agent/client";
import {
  createBuild,
  finalizeBuild,
  getBuild,
  listBuilds,
  markBuildRunning,
} from "@/lib/db/builds";
import { decryptSshCredential } from "@/lib/db/credentials";
import { getProject, getProjectCurrentBackup } from "@/lib/db/projects";
import { readR2Range } from "@/lib/r2";
import type { BuildOutput, DecryptedSshKey } from "@/lib/agent/types";
import type { BuildDTO } from "@/lib/dto";
import { validateGraph } from "@/lib/workflow/validate";

/**
 * 兜底 short-poll：worker → 主应用回调（BuildWorkflow.notify-main-app）失败时
 * 这里主动问一次 worker。命中终态就 finalize 入库；非终态保持原状。
 * waitMs 设短一点（默认 500ms），instance.status() 已经 complete/errored 的能立刻拿到；
 * 仍 running 的会等待 ≤ waitMs 后返回当前 running 状态。
 */
async function probeAndFinalize(buildId: string, waitMs = 500): Promise<void> {
  try {
    const s = await agentClient.waitBuild(buildId, waitMs);
    if (s.status === "complete") {
      const output = s.output as BuildOutput | undefined;
      if (!output?.backup?.id || !output.logKey) {
        await finalizeBuild(buildId, {
          status: "FAILED",
          error: `worker returned incomplete output: ${JSON.stringify(output)}`,
        });
      } else {
        await finalizeBuild(buildId, {
          status: "SUCCESS",
          logKey: output.logKey,
          backup: output.backup,
        });
      }
    } else if (s.status === "errored") {
      await finalizeBuild(buildId, {
        status: "FAILED",
        error: s.error ?? "unknown",
      });
    } else if (s.status === "terminated") {
      await finalizeBuild(buildId, {
        status: "FAILED",
        error: "terminated",
      });
    } else if (s.status === "not_found") {
      // workflow instance 已被 GC 或从未创建 —— 标记 FAILED 避免永远卡 RUNNING
      await finalizeBuild(buildId, {
        status: "FAILED",
        error: `workflow instance not found (${s.error ?? "gc or invalid id"})`,
      });
    }
    // "queued" / "running" / "paused" / "unknown" → 保持原状下次再试
  } catch {
    // worker 暂不可达（网络错），下次再试
  }
}

function isStuck(b: Pick<BuildDTO, "status">): boolean {
  return b.status === "PENDING" || b.status === "RUNNING";
}

const IdSchema = z.object({ id: z.string().min(1) });
const ProjectIdSchema = z.object({ projectId: z.string().min(1) });
const StartSchema = z.object({ projectId: z.string().min(1) });
const LogSchema = z.object({
  id: z.string().min(1),
  from: z.coerce.number().int().nonnegative().default(0),
});

async function handle(action: BuildAction, body: unknown, userId: string) {
  switch (action) {
    case BuildActions.list: {
      const { projectId } = ProjectIdSchema.parse(body);
      const items = await listBuilds(userId, projectId);
      // 兜底 short-poll 放到响应之后异步执行：命中终态写回 DB，下一次 SWR
      // refresh（3s 间隔）自然拿到收敛后的状态。这样 list 接口本身不再被
      // worker 跨区 RTT + waitMs 阻塞，首屏与轮询都只剩一次 listBuilds 的开销。
      const stuck = items.filter(isStuck);
      if (stuck.length > 0) {
        after(async () => {
          await Promise.all(stuck.map((b) => probeAndFinalize(b.id)));
        });
      }
      return Response.json({ items });
    }

    case BuildActions.start: {
      const { projectId } = StartSchema.parse(body);
      const project = await getProject(userId, projectId);
      if (!project) return new Response("Project not found", { status: 404 });

      const issues = validateGraph(project.graph);
      if (issues.length > 0) {
        return Response.json(
          { error: "graph_invalid", issues },
          { status: 400 },
        );
      }

      // 收集所有 git 节点用到的 credentialId，去重并解密
      const credentialIds = new Set<string>();
      for (const n of project.graph.nodes) {
        if (n.type === "git" && n.data.credentialId) {
          credentialIds.add(n.data.credentialId);
        }
      }
      const sshKeys: DecryptedSshKey[] = [];
      for (const cid of credentialIds) {
        const payload = await decryptSshCredential(userId, cid);
        if (!payload) {
          return new Response(
            `Credential ${cid} not found`,
            { status: 400 },
          );
        }
        sshKeys.push({
          credentialId: cid,
          privateKey: payload.privateKey,
          knownHosts: payload.knownHosts,
        });
      }

      // 读出上一次成功 build 的 backup id，让 worker 在新 backup 完成后删旧
      const previousBackup = await getProjectCurrentBackup(projectId);
      const previousBackupId = previousBackup?.id ?? null;

      const build = await createBuild(projectId);
      try {
        await agentClient.startBuild({
          buildId: build.id,
          userId,
          projectId,
          graph: project.graph,
          sshKeys,
          previousBackupId,
        });
        await markBuildRunning(build.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await finalizeBuild(build.id, { status: "FAILED", error: msg });
        return Response.json(
          { error: "worker_start_failed", message: msg },
          { status: 502 },
        );
      }
      return Response.json({ item: { ...build, status: "RUNNING" } });
    }

    case BuildActions.get: {
      const { id } = IdSchema.parse(body);
      const build = await getBuild(userId, id);
      if (!build) return new Response("Not found", { status: 404 });
      if (isStuck(build)) {
        await probeAndFinalize(id, 2000);
        const refreshed = await getBuild(userId, id);
        return Response.json({ item: refreshed });
      }
      return Response.json({ item: build });
    }

    case BuildActions.log: {
      const { id, from } = LogSchema.parse(body);
      const build = await getBuild(userId, id);
      if (!build) return new Response("Not found", { status: 404 });
      // 进行中的 build logKey 可能还没回写到 DB，但我们能从约定路径推算
      const key =
        build.logKey ?? `_buildlogs/${userId}/${build.projectId}/${id}.log`;
      const slice = await readR2Range(key, from);
      return Response.json({
        text: slice.text,
        totalSize: slice.totalSize,
        status: build.status,
      });
    }

    case BuildActions.abort: {
      const { id } = IdSchema.parse(body);
      const build = await getBuild(userId, id);
      if (!build) return new Response("Not found", { status: 404 });
      if (!isStuck(build)) {
        return Response.json({ ok: true, message: "already finalized" });
      }
      try {
        await agentClient.abortBuild(id);
      } catch (err) {
        console.warn("[build/abort] worker call failed", err);
      }
      // 立即写 DB 终态，不等下次 list 兜底；error 标记用户主动中止
      await finalizeBuild(id, {
        status: "FAILED",
        error: "已被用户停止",
        logKey: build.logKey ?? undefined,
      });
      const refreshed = await getBuild(userId, id);
      return Response.json({ item: refreshed });
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
    return await handle(action as BuildAction, body, userId);
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "validation", issues: err.issues },
        { status: 400 },
      );
    }
    console.error("[builds]", err);
    return new Response(
      err instanceof Error ? err.message : "Internal Server Error",
      { status: 500 },
    );
  }
}
