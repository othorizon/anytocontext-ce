import { prisma } from "./prisma";

export interface QueryTaskMeta {
  id: string;
  userId: string;
  projectId: string;
  createdAt: string;
}

export async function createQueryTask(args: {
  id: string;
  userId: string;
  projectId: string;
}): Promise<void> {
  await prisma.queryTask.create({ data: args });
}

export async function getQueryTaskMeta(
  id: string,
): Promise<QueryTaskMeta | null> {
  const row = await prisma.queryTask.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
  };
}
