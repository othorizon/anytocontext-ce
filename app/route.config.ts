// 统一的 API action 枚举，用于 [action] 动态路由的分发。
// 避免每个 CRUD 都新建一个 route 文件。

export const ProjectActions = {
  list: "list",
  get: "get",
  create: "create",
  rename: "rename",
  saveGraph: "save-graph",
  saveChatGraph: "save-chat-graph",
  delete: "delete",
} as const;
export type ProjectAction = (typeof ProjectActions)[keyof typeof ProjectActions];

export const CredentialActions = {
  list: "list",
  create: "create",
  update: "update",
  delete: "delete",
  generate: "generate",
} as const;
export type CredentialAction =
  (typeof CredentialActions)[keyof typeof CredentialActions];

export const ApiKeyActions = {
  list: "list",
  create: "create",
  updateScope: "update-scope",
  delete: "delete",
} as const;
export type ApiKeyAction = (typeof ApiKeyActions)[keyof typeof ApiKeyActions];

export const BuildActions = {
  list: "list",
  start: "start",
  get: "get",
  log: "log",
  abort: "abort",
} as const;
export type BuildAction = (typeof BuildActions)[keyof typeof BuildActions];
