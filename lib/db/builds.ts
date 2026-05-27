import { prisma } from "./prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { BackupHandle } from "./projects";
import type { BuildDTO, BuildStatusDTO } from "@/lib/dto";

function toDTO(row: {
  id: string;
  projectId: string;
  status: string;
  logKey: string | null;
  error: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}): BuildDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as BuildStatusDTO,
    logKey: row.logKey,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listBuilds(
  userId: string,
  projectId: string,
): Promise<BuildDTO[]> {
  const rows = await prisma.build.findMany({
    where: { projectId, project: { userId } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map(toDTO);
}

export async function getBuild(
  userId: string,
  id: string,
): Promise<BuildDTO | null> {
  const row = await prisma.build.findFirst({
    where: { id, project: { userId } },
  });
  return row ? toDTO(row) : null;
}

export async function createBuild(
  projectId: string,
): Promise<BuildDTO> {
  const row = await prisma.build.create({
    data: { projectId, status: "PENDING" },
  });
  return toDTO(row);
}

export async function markBuildRunning(id: string): Promise<void> {
  await prisma.build.update({
    where: { id },
    data: { status: "RUNNING", startedAt: new Date() },
  });
}

export async function finalizeBuild(
  id: string,
  result:
    | { status: "SUCCESS"; logKey: string; backup: BackupHandle }
    | { status: "FAILED"; error: string; logKey?: string },
): Promise<void> {
  if (result.status === "SUCCESS") {
    // 一次事务：写回 Build 终态 + 覆盖 Project.currentBackup。
    // 旧 backup 已由 worker delete-old-backup step 删过，主应用不再重复删。
    const build = await prisma.build.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!build) {
      throw new Error(`Build ${id} not found`);
    }
    await prisma.$transaction([
      prisma.build.update({
        where: { id },
        data: {
          status: "SUCCESS",
          logKey: result.logKey,
          error: null,
          endedAt: new Date(),
        },
      }),
      prisma.project.update({
        where: { id: build.projectId },
        data: {
          currentBackup: result.backup as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    return;
  }
  await prisma.build.update({
    where: { id },
    data: {
      status: "FAILED",
      logKey: result.logKey ?? null,
      error: result.error,
      endedAt: new Date(),
    },
  });
}
