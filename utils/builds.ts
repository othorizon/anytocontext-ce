import useSWR from "swr";
import type { BuildDTO } from "@/lib/dto";
import { postAction } from "./fetcher";

const listKey = (projectId: string) =>
  ["/api/builds/list", projectId] as const;
const getKey = (id: string) => ["/api/builds/get", id] as const;
const logKey = (id: string, from: number) =>
  ["/api/builds/log", id, from] as const;

export function useBuilds(projectId: string | undefined) {
  return useSWR<{ items: BuildDTO[] }>(
    projectId ? listKey(projectId) : null,
    async ([u, pid]: readonly [string, string]) =>
      postAction(u, { projectId: pid }),
    { refreshInterval: 3000 },
  );
}

export function useBuild(id: string | undefined) {
  return useSWR<{ item: BuildDTO }>(
    id ? getKey(id) : null,
    async ([u, bid]: readonly [string, string]) =>
      postAction(u, { id: bid }),
    { refreshInterval: 3000 },
  );
}

export interface LogSlice {
  text: string;
  totalSize: number;
  status: BuildDTO["status"];
}

export async function fetchBuildLog(
  id: string,
  from: number,
): Promise<LogSlice> {
  return await postAction<LogSlice>("/api/builds/log", { id, from });
}

export async function startBuildApi(projectId: string): Promise<BuildDTO> {
  const { item } = await postAction<{ item: BuildDTO }>(
    "/api/builds/start",
    { projectId },
  );
  return item;
}

export async function abortBuildApi(id: string): Promise<BuildDTO | null> {
  const res = await postAction<{ item?: BuildDTO }>(
    "/api/builds/abort",
    { id },
  );
  return res.item ?? null;
}

export const buildsListKey = (projectId: string) => listKey(projectId);
export const buildGetKey = (id: string) => getKey(id);
export const buildLogKey = (id: string, from: number) => logKey(id, from);
