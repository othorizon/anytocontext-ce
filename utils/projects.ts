import useSWR from "swr";
import type {
  ChatGraph,
  ProjectDTO,
  ProjectSummaryDTO,
  WorkflowGraph,
} from "@/lib/dto";
import { postAction } from "./fetcher";

const LIST_URL = "/api/projects/list";

interface ListResp {
  items: ProjectSummaryDTO[];
}

interface ItemResp {
  item: ProjectDTO;
}

export function useProjects() {
  return useSWR<ListResp>(LIST_URL, async (u: string) => {
    return postAction<ListResp>(u, {});
  });
}

export function useProject(id: string | undefined) {
  return useSWR<ItemResp>(
    id ? ["/api/projects/get", id] : null,
    async ([u, pid]: [string, string]) => postAction<ItemResp>(u, { id: pid }),
  );
}

export async function createProjectApi(name: string): Promise<ProjectDTO> {
  const { item } = await postAction<ItemResp>(
    "/api/projects/create",
    { name },
  );
  return item;
}

export async function renameProjectApi(
  id: string,
  name: string,
): Promise<ProjectDTO> {
  const { item } = await postAction<ItemResp>(
    "/api/projects/rename",
    { id, name },
  );
  return item;
}

export async function saveGraphApi(
  id: string,
  graph: WorkflowGraph,
): Promise<ProjectDTO> {
  const { item } = await postAction<ItemResp>(
    "/api/projects/save-graph",
    { id, graph },
  );
  return item;
}

export async function saveChatGraphApi(
  id: string,
  chatGraph: ChatGraph,
): Promise<ProjectDTO> {
  const { item } = await postAction<ItemResp>(
    "/api/projects/save-chat-graph",
    { id, chatGraph },
  );
  return item;
}

export async function deleteProjectApi(id: string): Promise<void> {
  await postAction("/api/projects/delete", { id });
}

export const projectsListKey = LIST_URL;
export const projectGetKey = (id: string) => ["/api/projects/get", id] as const;
