// Workflow 图结构：Project.graph 字段的 TypeScript 形状。
// 与 Cloudflare agent-worker 共享同一套类型。

export type NodeId = string;

export interface NodeBase<T extends string, D> {
  id: NodeId;
  type: T;
  /** 节点名（全图唯一） */
  name: string;
  /** UI 坐标（可选，由 xyflow 维护） */
  position?: { x: number; y: number };
  data: D;
}

export type GitNode = NodeBase<
  "git",
  {
    url: string;
    /** branch 或 tag */
    ref: string;
    /** 关联 Credential.id（私有仓库使用 SSH key） */
    credentialId?: string;
  }
>;

export type TextNode = NodeBase<
  "text",
  {
    /** markdown 文本；构建时落到 /build/<name>.md */
    content: string;
  }
>;

export type ScriptNode = NodeBase<
  "script",
  {
    /** bash 脚本；构建时在临时工作目录执行 */
    script: string;
    /**
     * 可选：脚本在工作目录内产出数据的子目录。
     * 非空时把该子目录搬到 /build/<name>/；空时整个工作目录搬到 /build/<name>/。
     * noOutput=true 时本字段被忽略。
     */
    outputDir?: string;
    /**
     * 仅执行脚本不产数据（典型场景：调 API、写远端系统、发通知等副作用）。
     * 勾选后不生成 /build/<name>/，也不出现在 build 节点的可用源里。
     */
    noOutput?: boolean;
  }
>;

/**
 * 构建节点：声明「哪些数据源装配进 /workspace」。
 * 装配规则固定为「按源节点名」：
 *  - git/script → /workspace/<sourceName>
 *  - text      → /workspace/<sourceName>.md
 * 用户要修改输出位置就在源节点上重命名；不再支持在构建节点里独立改名。
 * 每张构建 graph 仅允许一个构建节点（保持 backup 单数语义）。
 *
 * excludedSourceIds：连接到构建节点但希望跳过装配的源节点 id。
 * 排除的源仍会执行（拓扑里有），只是不复制到 /workspace。
 * 常用于：源是 noOutput 的依赖前置 / 临时关闭某个源不打进备份。
 */
export type BuildNode = NodeBase<
  "build",
  {
    excludedSourceIds?: string[];
  }
>;

/** 构建节点是否把某个源排除在装配之外 */
export function isSourceExcluded(build: BuildNode, sourceId: string): boolean {
  return (build.data.excludedSourceIds ?? []).includes(sourceId);
}

export type WorkflowNode = GitNode | TextNode | ScriptNode | BuildNode;
export type WorkflowNodeType = WorkflowNode["type"];

export interface WorkflowEdge {
  id: string;
  source: NodeId;
  target: NodeId;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] };

/** 数据源原始产出根目录（仅在 build sandbox 内可见，不进 backup） */
export const BUILD_DIR = "/build";
/** 工作区根目录：构建末步装配 + backup 目标 + Agent cwd */
export const WORKSPACE_DIR = "/workspace";

/** 节点是否在 BUILD_DIR 下产出数据（决定是否参与 build 节点 outputDirs 候选与路径唯一性校验） */
export function hasNodeOutput(node: WorkflowNode): boolean {
  if (node.type === "build") return false;
  if (node.type === "script" && node.data.noOutput) return false;
  return true;
}

/**
 * 数据源节点在 sandbox BUILD_DIR 下的原始产出路径：
 * - git/script: /build/<name>
 * - text:       /build/<name>.md
 * 不产出的节点（build、noOutput script）调用会抛错；调用前先用 hasNodeOutput 判断。
 */
export function nodePath(node: WorkflowNode): string {
  if (!hasNodeOutput(node)) {
    throw new Error(`node ${node.name} has no output path`);
  }
  if (node.type === "text") return `${BUILD_DIR}/${node.name}.md`;
  return `${BUILD_DIR}/${node.name}`;
}

/**
 * 把 outputDir 字符串规范化为 /workspace/... 绝对路径。
 * 入参不带前导斜杠（前端表单输入形如 "src" 或 "data/foo"）。
 */
export function workspacePath(outputDir: string): string {
  return `${WORKSPACE_DIR}/${outputDir.replace(/^\/+/, "")}`;
}

/**
 * 数据源在 /workspace 下的最终路径，固定按源节点名装配：
 * - git/script: /workspace/<name>
 * - text:       /workspace/<name>.md
 */
export function workspaceOutputPath(node: WorkflowNode): string {
  const base = workspacePath(node.name);
  if (node.type === "text") return `${base}.md`;
  return base;
}
