import {
  WORKSPACE_DIR,
  isSourceExcluded,
  workspaceOutputPath,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/dto/workflow";
import { collectSourcesForBuild, findBuildNode } from "./topology";

/**
 * 占位符 {source.<sourceName>.path} 在 systemPrompt 里展开为该源在 /workspace 下的最终路径。
 *
 * 解析规则：
 *  1. 在 buildGraph 中按 name 找到对应源节点
 *  2. 该源节点必须连接到 build 节点（参与装配），否则它没有进 /workspace
 *  3. 返回固定的 /workspace/<sourceName>（text 自动加 .md）
 *  4. 任一步失败 → 保留原占位符，便于用户排查
 */
export function renderSystemPrompt(
  template: string,
  buildGraph: WorkflowGraph,
): string {
  const build = findBuildNode(buildGraph);
  const buildNode = build && build.type === "build" ? build : null;
  const assembledIds = buildNode
    ? new Set(
        collectSourcesForBuild(buildGraph, buildNode.id)
          .filter((n) => !isSourceExcluded(buildNode, n.id))
          .map((n) => n.id),
      )
    : new Set<string>();

  const byName = new Map<string, WorkflowNode>(
    buildGraph.nodes.map((n) => [n.name, n]),
  );

  return template.replace(
    /\{source\.([a-zA-Z][a-zA-Z0-9_-]{0,40})\.path\}/g,
    (raw, name: string) => {
      const node = byName.get(name);
      if (!node || node.type === "build") return raw;
      if (!assembledIds.has(node.id)) return raw;
      return workspaceOutputPath(node);
    },
  );
}

/** 自动填写按钮使用：基于当前 buildGraph 生成一段系统提示词模板。 */
export function autoSystemPrompt(buildGraph: WorkflowGraph): string {
  const build = findBuildNode(buildGraph);
  if (!build || build.type !== "build") {
    return [
      `你是一个数据助手。当前项目下挂载的数据位于 ${WORKSPACE_DIR} 目录。`,
      "请使用 list_dir / read_file / grep / exec_shell 工具检索并回答用户问题。",
      "请只在文件内容支持时给出结论，避免编造。",
    ].join("");
  }
  const sources = collectSourcesForBuild(buildGraph, build.id).filter(
    (s) => !isSourceExcluded(build, s.id),
  );
  if (sources.length === 0) {
    return [
      `你是一个数据助手。当前项目下挂载的数据位于 ${WORKSPACE_DIR} 目录。`,
      "请使用 list_dir / read_file / grep / exec_shell 工具检索并回答用户问题。",
      "请只在文件内容支持时给出结论，避免编造。",
    ].join("");
  }
  const lines = [
    `你是一个数据助手。当前项目的数据已装配到 ${WORKSPACE_DIR} 下：`,
    "",
    ...sources.map((s) => `- ${s.name}: ${workspaceOutputPath(s)}`),
    "",
    "基于内容回答用户问题。请只在文件内容支持时给出结论，避免编造。",
  ];
  return lines.join("\n");
}
