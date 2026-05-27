// 对话 graph：Project.chatGraph 字段的 TypeScript 形状。
// 固定结构：chat-input → chat-model；输入节点为占位符不需要配置，
// 模型节点只承载系统提示词；模型本身由服务端环境变量统一配置。

import type { NodeBase, WorkflowEdge } from "./workflow";

export type ChatInputNode = NodeBase<"chat-input", Record<string, never>>;
export type ChatModelNode = NodeBase<
  "chat-model",
  {
    /** 系统提示词；支持 {source.<sourceName>.path} 占位符，渲染时按构建 graph 的 outputDirs 解析 */
    systemPrompt: string;
  }
>;

export type ChatGraphNode = ChatInputNode | ChatModelNode;
export type ChatGraphNodeType = ChatGraphNode["type"];

export interface ChatGraph {
  nodes: ChatGraphNode[];
  edges: WorkflowEdge[];
}

/** 固定 id：chat graph 永远只有这两节点 + 一条边 */
export const CHAT_INPUT_NODE_ID = "chat-input";
export const CHAT_MODEL_NODE_ID = "chat-model";
export const CHAT_EDGE_ID = "chat-input--chat-model";

export function defaultChatGraph(): ChatGraph {
  return {
    nodes: [
      {
        id: CHAT_INPUT_NODE_ID,
        type: "chat-input",
        name: "用户输入",
        position: { x: 80, y: 120 },
        data: {},
      },
      {
        id: CHAT_MODEL_NODE_ID,
        type: "chat-model",
        name: "对话模型",
        position: { x: 400, y: 120 },
        data: {
          systemPrompt: "",
        },
      },
    ],
    edges: [
      {
        id: CHAT_EDGE_ID,
        source: CHAT_INPUT_NODE_ID,
        target: CHAT_MODEL_NODE_ID,
      },
    ],
  };
}

/**
 * 把任意 JSON 兜底为合法的 ChatGraph：
 * - 空对象 / 缺字段 → 完整默认
 * - 有部分节点 → 缺的补默认
 * 用于从 DB 反序列化时，避免 null/{}/老数据导致下游崩
 */
export function ensureChatGraph(raw: unknown): ChatGraph {
  const fallback = defaultChatGraph();
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Partial<ChatGraph>;
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const inputNode =
    (rawNodes.find((n) => n.type === "chat-input") as
      | ChatInputNode
      | undefined) ?? (fallback.nodes[0] as ChatInputNode);
  const rawModel = rawNodes.find((n) => n.type === "chat-model") as
    | (ChatModelNode & { data?: Partial<ChatModelNode["data"]> & Record<string, unknown> })
    | undefined;
  const modelNode: ChatModelNode = rawModel
    ? {
        ...rawModel,
        data: {
          systemPrompt:
            typeof rawModel.data?.systemPrompt === "string"
              ? rawModel.data.systemPrompt
              : "",
        },
      }
    : (fallback.nodes[1] as ChatModelNode);
  const edges =
    Array.isArray(obj.edges) && obj.edges.length > 0
      ? (obj.edges as WorkflowEdge[])
      : fallback.edges;
  return { nodes: [inputNode, modelNode], edges };
}

export function findChatModel(graph: ChatGraph): ChatModelNode | null {
  const node = graph.nodes.find((n) => n.type === "chat-model");
  return node ? (node as ChatModelNode) : null;
}
