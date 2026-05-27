import {
  hasNodeOutput,
  type NodeId,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/dto/workflow";

/**
 * Kahn 拓扑排序。返回的节点数组等于输入节点数 → 输入是 DAG；否则抛错。
 */
export function topoSort(graph: WorkflowGraph): WorkflowNode[] {
  const nodes = graph.nodes;
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const inDeg = new Map<NodeId, number>();
  const adj = new Map<NodeId, NodeId[]>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!idToNode.has(e.source) || !idToNode.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const queue: NodeId[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  const out: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(idToNode.get(id)!);
    for (const next of adj.get(id) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (out.length !== nodes.length) {
    throw new Error("Workflow 图存在环依赖");
  }
  return out;
}

/** 收集某节点的所有上游可达节点（不含自身） */
export function collectUpstream(
  graph: WorkflowGraph,
  nodeId: NodeId,
): WorkflowNode[] {
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const reverseAdj = new Map<NodeId, NodeId[]>();
  for (const n of graph.nodes) reverseAdj.set(n.id, []);
  for (const e of graph.edges) {
    reverseAdj.get(e.target)?.push(e.source);
  }
  const seen = new Set<NodeId>();
  const stack = [...(reverseAdj.get(nodeId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const prev of reverseAdj.get(id) ?? []) {
      if (!seen.has(prev)) stack.push(prev);
    }
  }
  return Array.from(seen)
    .map((id) => idToNode.get(id))
    .filter((n): n is WorkflowNode => !!n);
}

/**
 * 找出 build 节点的上游"产出数据"的源节点（git / text / 非 noOutput script）。
 * noOutput script 虽可连到 build 上保证拓扑顺序，但不参与装配。
 */
export function collectSourcesForBuild(
  graph: WorkflowGraph,
  buildNodeId: NodeId,
): WorkflowNode[] {
  return collectUpstream(graph, buildNodeId)
    .filter((n) => n.type === "git" || n.type === "text" || n.type === "script")
    .filter(hasNodeOutput);
}

/** 找图里唯一的 build 节点；找不到或多于一个返回 null（校验交给 validateBuildGraph） */
export function findBuildNode(graph: WorkflowGraph): WorkflowNode | null {
  const builds = graph.nodes.filter((n) => n.type === "build");
  return builds.length === 1 ? builds[0] : null;
}

export type { WorkflowEdge };
