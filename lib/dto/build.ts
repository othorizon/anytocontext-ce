export type BuildStatusDTO = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";

export interface BuildDTO {
  id: string;
  projectId: string;
  status: BuildStatusDTO;
  logKey: string | null;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}
