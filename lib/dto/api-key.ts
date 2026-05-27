export interface ApiKeyDTO {
  id: string;
  name: string;
  prefix: string;
  /** 是否对所有项目都生效（含未来新建） */
  scopeAll: boolean;
  /** scopeAll = false 时生效的明确 projectId 列表 */
  projectScope: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/** 创建时一次性返回的 DTO，含明文 key —— 仅此一次 */
export interface ApiKeyWithSecretDTO extends ApiKeyDTO {
  secret: string;
}
