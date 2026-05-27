import type { ChatGraph } from "./chat-graph";
import type { WorkflowGraph } from "./workflow";

export interface ProjectDTO {
  id: string;
  name: string;
  graph: WorkflowGraph;
  chatGraph: ChatGraph;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummaryDTO {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
