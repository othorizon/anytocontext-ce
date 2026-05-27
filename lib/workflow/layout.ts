/**
 * 用 dagre 计算 workflow 的横向布局（rankdir=LR）。
 * 输入 / 输出都是 WorkflowGraph，只修改 node.position；不动 data。
 */
import Dagre from "@dagrejs/dagre";
import type { WorkflowGraph, WorkflowNode } from "@/lib/dto/workflow";

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

export function layoutGraph(
  graph: WorkflowGraph,
  options: { rankdir?: "LR" | "TB"; nodeWidth?: number; nodeHeight?: number } = {},
): WorkflowGraph {
  const {
    rankdir = "LR",
    nodeWidth = DEFAULT_NODE_WIDTH,
    nodeHeight = DEFAULT_NODE_HEIGHT,
  } = options;

  if (graph.nodes.length === 0) return graph;

  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, ranksep: 80, nodesep: 40 });

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of graph.edges) {
    if (
      graph.nodes.some((n) => n.id === edge.source) &&
      graph.nodes.some((n) => n.id === edge.target)
    ) {
      g.setEdge(edge.source, edge.target);
    }
  }

  Dagre.layout(g);

  const nodes: WorkflowNode[] = graph.nodes.map((n) => {
    const layoutNode = g.node(n.id);
    return {
      ...n,
      position: {
        // dagre 返回中心点坐标；转左上
        x: Math.round(layoutNode.x - nodeWidth / 2),
        y: Math.round(layoutNode.y - nodeHeight / 2),
      },
    } as WorkflowNode;
  });

  return { nodes, edges: graph.edges };
}

/**
 * 给"新加节点"算一个合适的位置：放在已有节点的最右侧 + 一格，y 取所有节点的中位。
 * 空图时返回视口中心传入值，没传时退化到原点。
 */
export function nextNodePosition(
  graph: WorkflowGraph,
  fallback: { x: number; y: number } = { x: 80, y: 80 },
): { x: number; y: number } {
  if (graph.nodes.length === 0) return fallback;

  const xs = graph.nodes
    .map((n) => n.position?.x ?? 0)
    .filter((v): v is number => Number.isFinite(v));
  const ys = graph.nodes
    .map((n) => n.position?.y ?? 0)
    .filter((v): v is number => Number.isFinite(v));
  const maxX = xs.length > 0 ? Math.max(...xs) : 0;
  const sortedY = [...ys].sort((a, b) => a - b);
  const medianY =
    sortedY.length > 0 ? sortedY[Math.floor(sortedY.length / 2)] : 0;

  return { x: maxX + DEFAULT_NODE_WIDTH + 40, y: medianY };
}
