import type { ChatGraph } from "@/lib/dto/chat-graph";
import {
  hasNodeOutput,
  nodePath,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/dto/workflow";

export interface ValidationIssue {
  /** 关联到哪个节点 / 边（可空表示全图级错误） */
  nodeId?: string;
  edgeId?: string;
  message: string;
}

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/;

/**
 * 校验构建 graph：数据源 + 构建节点。
 * 历史入口 validateGraph 沿用此函数（默认调用方都用构建 graph）。
 */
export function validateBuildGraph(graph: WorkflowGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. 节点名格式与唯一
  const seenNames = new Map<string, number>();
  for (const n of graph.nodes) {
    if (!NAME_RE.test(n.name)) {
      issues.push({
        nodeId: n.id,
        message: `节点名 "${n.name}" 不合法（仅允许字母开头、字母/数字/下划线/短横线，最长 41 字符）`,
      });
    }
    seenNames.set(n.name, (seenNames.get(n.name) ?? 0) + 1);
  }
  for (const [name, count] of seenNames) {
    if (count > 1) {
      issues.push({ message: `节点名 "${name}" 出现 ${count} 次，必须唯一` });
    }
  }

  // 2. 源类型节点 path 唯一（noOutput script 不产生 path，跳过）
  const seenPaths = new Map<string, number>();
  for (const n of graph.nodes) {
    if (!hasNodeOutput(n)) continue;
    const p = nodePath(n);
    seenPaths.set(p, (seenPaths.get(p) ?? 0) + 1);
  }
  for (const [p, count] of seenPaths) {
    if (count > 1) {
      issues.push({ message: `路径 "${p}" 在多个节点重复，不允许` });
    }
  }

  // 3. 恰好 1 个 build 节点
  const builds = graph.nodes.filter((n) => n.type === "build");
  if (builds.length === 0) {
    issues.push({ message: "缺少构建节点（每个项目必须有且仅有一个构建节点）" });
  } else if (builds.length > 1) {
    issues.push({
      message: `存在 ${builds.length} 个构建节点，每个项目只允许一个`,
    });
  }

  // 4. 边引用合法 + build 节点上游不能是另一个 build 节点
  const nodeMap = new Map<string, WorkflowNode>(
    graph.nodes.map((n) => [n.id, n]),
  );
  for (const e of graph.edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src) {
      issues.push({ edgeId: e.id, message: `边引用了不存在的源节点 ${e.source}` });
      continue;
    }
    if (!tgt) {
      issues.push({ edgeId: e.id, message: `边引用了不存在的目标节点 ${e.target}` });
      continue;
    }
    if (tgt.type === "build" && src.type === "build") {
      issues.push({
        edgeId: e.id,
        message: "构建节点的上游不能是另一个构建节点",
      });
    }
  }

  // 5. 检测环
  if (hasCycle(graph)) {
    issues.push({ message: "图中存在循环依赖" });
  }

  // 输出目录恒等于源节点名（text 加 .md），其唯一性已由节点名唯一性 + path 唯一性保证，
  // 不需要额外校验。

  return issues;
}

/**
 * 兼容旧调用方：默认按构建 graph 校验。
 * @deprecated 直接调用 validateBuildGraph
 */
export function validateGraph(graph: WorkflowGraph): ValidationIssue[] {
  return validateBuildGraph(graph);
}

/**
 * 校验对话 graph：必须恰好 chat-input + chat-model 各一个，一条输入→模型的边。
 * UI 强制固定结构，理论上不会触发，但保险起见加一层。
 */
export function validateChatGraph(graph: ChatGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const input = graph.nodes.filter((n) => n.type === "chat-input");
  const model = graph.nodes.filter((n) => n.type === "chat-model");
  if (input.length !== 1)
    issues.push({ message: `对话 graph 必须恰好 1 个输入节点（当前 ${input.length}）` });
  if (model.length !== 1)
    issues.push({ message: `对话 graph 必须恰好 1 个模型节点（当前 ${model.length}）` });
  if (input.length === 1 && model.length === 1) {
    const hasEdge = graph.edges.some(
      (e) => e.source === input[0].id && e.target === model[0].id,
    );
    if (!hasEdge)
      issues.push({ message: "对话 graph 缺少输入 → 模型节点的连接边" });
  }
  return issues;
}

function hasCycle(graph: WorkflowGraph): boolean {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) adj.get(e.source)?.push(e.target);

  // 三色 DFS
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const n of graph.nodes) color.set(n.id, WHITE);

  function dfs(id: string): boolean {
    color.set(id, GRAY);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const n of graph.nodes) {
    if (color.get(n.id) === WHITE && dfs(n.id)) return true;
  }
  return false;
}

/** 生成短的随机节点名后缀，避免新建时与现有节点重名 */
export function makeUniqueNodeName(
  graph: WorkflowGraph,
  prefix: string,
): string {
  const used = new Set(graph.nodes.map((n) => n.name));
  let i = 0;
  while (i < 10000) {
    const name = `${prefix}-${randomSuffix()}`;
    if (!used.has(name)) return name;
    i += 1;
  }
  throw new Error("无法生成唯一节点名");
}

function randomSuffix(): string {
  // 5 位 base36
  return Math.random().toString(36).slice(2, 7);
}
