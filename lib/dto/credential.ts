export type CredentialTypeDTO = "SSH_KEY";

/** 列表/选择器用的 DTO，不含敏感 payload */
export interface CredentialDTO {
  id: string;
  name: string;
  type: CredentialTypeDTO;
  createdAt: string;
  updatedAt: string;
}
