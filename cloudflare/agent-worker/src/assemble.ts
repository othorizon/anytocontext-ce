/**
 * 装配 /workspace：把连接到构建节点的所有数据源从 /build/<sourceName>
 * 复制到 /workspace/<sourceName>。
 *
 * - git/script 源是目录 → cp -r 到 /workspace/<name>
 * - text 源是文件 → cp 到 /workspace/<name>.md
 * - 输出目录恒等于源节点名，节点名全图唯一已保证目录唯一
 *
 * 失败抛错，由 BuildWorkflow.run catch 落到 finalize FAILED。
 */
import type { Sandbox } from "@cloudflare/sandbox";
import { BUILD_DIR, WORKSPACE_DIR } from "./backup";
import type { R2LogWriter } from "./log-writer";
import type { WorkflowGraph, WorkflowNode } from "./types";

interface AssembleOptions {
  sandbox: Sandbox;
  graph: WorkflowGraph;
  log: R2LogWriter;
}

export async function assembleWorkspace({
  sandbox,
  graph,
  log,
}: AssembleOptions): Promise<void> {
  const build = findBuildNode(graph);
  if (!build) {
    throw new Error("缺少构建节点");
  }

  // 清理旧 /workspace 内容（每次构建是全量装配；保留目录本身以便 backup dir 不变）
  await sandbox.exec(
    `find ${shellQuote(WORKSPACE_DIR)} -mindepth 1 -maxdepth 1 -exec rm -rf {} +`,
  );

  const excluded = new Set(build.data.excludedSourceIds ?? []);
  const allConnected = collectSourcesForBuild(graph, build.id);
  const connected = allConnected.filter((s) => !excluded.has(s.id));
  for (const s of allConnected) {
    if (excluded.has(s.id)) {
      await log.appendLine(`[build] 排除数据源 ${s.name}，不装配到 /workspace`);
    }
  }
  if (connected.length === 0) {
    await log.appendLine(
      "[build] 构建节点无可装配的数据源 → /workspace 为空（仍会创建空构建产物）",
    );
    return;
  }

  for (const source of connected) {
    const isFile = source.type === "text";
    const target = isFile
      ? `${WORKSPACE_DIR}/${source.name}.md`
      : `${WORKSPACE_DIR}/${source.name}`;
    const sourcePath = isFile
      ? `${BUILD_DIR}/${source.name}.md`
      : `${BUILD_DIR}/${source.name}`;

    await log.appendLine(`[build] 制作构建产物 ${source.name} → ${target}`);

    if (isFile) {
      const res = await sandbox.exec(
        `cp -f ${shellQuote(sourcePath)} ${shellQuote(target)}`,
      );
      if (res.exitCode !== 0) {
        throw new Error(
          `cp ${sourcePath} → ${target} 失败 (exit ${res.exitCode}): ${res.stderr}`,
        );
      }
    } else {
      // git/script 源是目录；target 作为目录复制（cp -r 把 source 整个目录复制为 target）
      await sandbox.exec(`rm -rf ${shellQuote(target)}`);
      const res = await sandbox.exec(
        `cp -r ${shellQuote(sourcePath)} ${shellQuote(target)}`,
      );
      if (res.exitCode !== 0) {
        throw new Error(
          `cp -r ${sourcePath} → ${target} 失败 (exit ${res.exitCode}): ${res.stderr}`,
        );
      }
    }
  }
}

function findBuildNode(graph: WorkflowGraph) {
  const builds = graph.nodes.filter(
    (n): n is Extract<WorkflowNode, { type: "build" }> => n.type === "build",
  );
  return builds.length === 1 ? builds[0] : null;
}

/**
 * 收集所有上游可达的、产数据的源节点（git/text/非 noOutput script）。
 * 与主应用 lib/workflow/topology.ts 的 collectSourcesForBuild 保持等价；
 * worker 不能 import 主应用代码，所以内联一份。
 */
function collectSourcesForBuild(
  graph: WorkflowGraph,
  buildId: string,
): WorkflowNode[] {
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const reverseAdj = new Map<string, string[]>();
  for (const n of graph.nodes) reverseAdj.set(n.id, []);
  for (const e of graph.edges) reverseAdj.get(e.target)?.push(e.source);
  const seen = new Set<string>();
  const stack = [...(reverseAdj.get(buildId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const prev of reverseAdj.get(id) ?? []) {
      if (!seen.has(prev)) stack.push(prev);
    }
  }
  const out: WorkflowNode[] = [];
  for (const id of seen) {
    const n = idToNode.get(id);
    if (!n) continue;
    if (n.type === "build") continue;
    if (n.type === "script" && n.data.noOutput) continue;
    out.push(n);
  }
  return out;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
