import { prisma } from "./prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  ChatGraph,
  ProjectDTO,
  ProjectSummaryDTO,
  WorkflowGraph,
} from "@/lib/dto";
import { defaultChatGraph, ensureChatGraph } from "@/lib/dto/chat-graph";
import { EMPTY_GRAPH } from "@/lib/dto/workflow";

/**
 * Sandbox SDK DirectoryBackup 句柄；存到 Project.currentBackup JSON 列。
 * 只保留最新一份成功构建产物。
 */
export interface BackupHandle {
  id: string;
  dir: string;
  localBucket?: boolean;
}

function toJsonInput<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function toDTO(row: {
  id: string;
  name: string;
  graph: unknown;
  chatGraph: unknown;
  createdAt: Date;
  updatedAt: Date;
}): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    graph: (row.graph as WorkflowGraph) ?? EMPTY_GRAPH,
    chatGraph: ensureChatGraph(row.chatGraph),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSummary(row: {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectSummaryDTO {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listProjects(
  userId: string,
): Promise<ProjectSummaryDTO[]> {
  const rows = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  return rows.map(toSummary);
}

export async function getProject(
  userId: string,
  id: string,
): Promise<ProjectDTO | null> {
  const row = await prisma.project.findFirst({
    where: { id, userId },
  });
  return row ? toDTO(row) : null;
}

export async function createProject(
  userId: string,
  name: string,
): Promise<ProjectDTO> {
  const row = await prisma.project.create({
    data: {
      userId,
      name,
      graph: toJsonInput(EMPTY_GRAPH),
      chatGraph: toJsonInput(defaultChatGraph()),
    },
  });
  return toDTO(row);
}

export async function updateProjectGraph(
  userId: string,
  id: string,
  graph: WorkflowGraph,
): Promise<ProjectDTO | null> {
  const result = await prisma.project.updateMany({
    where: { id, userId },
    data: { graph: toJsonInput(graph) },
  });
  if (result.count === 0) return null;
  return await getProject(userId, id);
}

export async function updateProjectChatGraph(
  userId: string,
  id: string,
  chatGraph: ChatGraph,
): Promise<ProjectDTO | null> {
  const result = await prisma.project.updateMany({
    where: { id, userId },
    data: { chatGraph: toJsonInput(chatGraph) },
  });
  if (result.count === 0) return null;
  return await getProject(userId, id);
}

export async function renameProject(
  userId: string,
  id: string,
  name: string,
): Promise<ProjectDTO | null> {
  const result = await prisma.project.updateMany({
    where: { id, userId },
    data: { name },
  });
  if (result.count === 0) return null;
  return await getProject(userId, id);
}

export async function deleteProject(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.project.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

/**
 * 构建成功后写回当前最新 backup 句柄；旧 backup 已由 worker delete-old-backup step 删过，
 * 这里只覆盖 DB 字段。
 */
export async function setProjectCurrentBackup(
  projectId: string,
  backup: BackupHandle,
): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { currentBackup: backup as unknown as Prisma.InputJsonValue },
  });
}

/**
 * 查询前取该 project 当前 backup；返回 null 时主应用 fail-fast 提示"请先构建一次"。
 */
export async function getProjectCurrentBackup(
  projectId: string,
): Promise<BackupHandle | null> {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentBackup: true },
  });
  const value = row?.currentBackup;
  if (!value) return null;
  return value as unknown as BackupHandle;
}
