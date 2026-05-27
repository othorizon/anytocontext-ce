/**
 * 跨 worker 共享的数据类型。
 * WorkflowNode / WorkflowGraph 的形状要与主应用的
 * lib/dto/workflow.ts 保持一致（手工同步；MVP 不抽公共包）。
 *
 * 社区版统一使用一个 OpenAI 兼容 provider，模型 / baseURL / apiKey 全部由
 * worker 端环境变量提供，因此 worker 不再需要客户端传入 ModelDef。
 */

export type WorkflowNodeType = "git" | "text" | "script" | "build";

export type WorkflowNode =
  | {
      id: string;
      type: "git";
      name: string;
      position?: { x: number; y: number };
      data: {
        url: string;
        ref: string;
        credentialId?: string;
      };
    }
  | {
      id: string;
      type: "text";
      name: string;
      position?: { x: number; y: number };
      data: { content: string };
    }
  | {
      id: string;
      type: "script";
      name: string;
      position?: { x: number; y: number };
      data: { script: string; outputDir?: string; noOutput?: boolean };
    }
  | {
      id: string;
      type: "build";
      name: string;
      position?: { x: number; y: number };
      /**
       * 输出目录固定为源节点名（text 加 .md）。
       * excludedSourceIds: 连接到构建节点但被用户排除、不参与装配的源 id 列表。
       */
      data: { excludedSourceIds?: string[] };
    };

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** 主应用发起 build 时传给 worker 的解密凭证（明文私钥）。仅在 build/agent 调用瞬时使用，不落盘。 */
export interface DecryptedSshKey {
  credentialId: string;
  privateKey: string;
  knownHosts?: string;
}

/**
 * Sandbox SDK DirectoryBackup 的 worker 侧镜像。
 * 与 @cloudflare/sandbox 的 DirectoryBackup 接口保持兼容；可直接互转。
 */
export interface DirectoryBackupHandle {
  id: string;
  dir: string;
  localBucket?: boolean;
}

/** POST /build/start 的 body */
export interface BuildStartRequest {
  buildId: string;
  userId: string;
  projectId: string;
  graph: WorkflowGraph;
  /** 按 credentialId 提供的明文 SSH key。worker 端不存。 */
  sshKeys: DecryptedSshKey[];
  /** 上一次成功构建的 backup id；首次构建为 null。worker 在新 backup 完成后会删旧。 */
  previousBackupId: string | null;
}

/** BuildWorkflow.run 的返回值，进入 instance.status().output */
export interface BuildResultPayload {
  logKey: string;
  backup: DirectoryBackupHandle;
}

/** POST /agent/start 的 body */
export interface AgentStartRequest {
  taskId: string;
  userId: string;
  projectId: string;
  prompt: string;
  systemPrompt: string;
  /** 主应用从 Project.currentBackup 取出的 DirectoryBackup 句柄，worker 端 restore */
  backup: DirectoryBackupHandle;
}

/** POST /backups/delete 的 body */
export interface DeleteBackupRequest {
  backupId: string;
}
