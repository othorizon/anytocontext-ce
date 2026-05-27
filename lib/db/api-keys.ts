import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import type { ApiKeyDTO, ApiKeyWithSecretDTO } from "@/lib/dto";

const PREFIX = "at_";

function toDTO(row: {
  id: string;
  name: string;
  prefix: string;
  scopeAll: boolean;
  projectScope: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
}): ApiKeyDTO {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopeAll: row.scopeAll,
    projectScope: row.projectScope,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

function generateKey(): { plaintext: string; prefix: string; hash: string } {
  // 32 字节随机数 → URL-safe base62-ish；这里用 hex 简化，长度 64 字符
  const raw = randomBytes(24).toString("base64url");
  const plaintext = `${PREFIX}${raw}`;
  const prefix = plaintext.slice(0, 10);
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export async function listApiKeys(userId: string): Promise<ApiKeyDTO[]> {
  const rows = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopeAll: true,
      projectScope: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
  return rows.map(toDTO);
}

export async function createApiKey(args: {
  userId: string;
  name: string;
  scopeAll: boolean;
  projectScope: string[];
}): Promise<ApiKeyWithSecretDTO> {
  const { plaintext, prefix, hash } = generateKey();
  const row = await prisma.apiKey.create({
    data: {
      userId: args.userId,
      name: args.name,
      prefix,
      keyHash: hash,
      scopeAll: args.scopeAll,
      projectScope: args.scopeAll ? [] : args.projectScope,
    },
  });
  return { ...toDTO(row), secret: plaintext };
}

export async function updateApiKeyScope(args: {
  userId: string;
  id: string;
  scopeAll: boolean;
  projectScope: string[];
}): Promise<ApiKeyDTO | null> {
  const result = await prisma.apiKey.updateMany({
    where: { id: args.id, userId: args.userId },
    data: {
      scopeAll: args.scopeAll,
      projectScope: args.scopeAll ? [] : args.projectScope,
    },
  });
  if (result.count === 0) return null;
  const row = await prisma.apiKey.findUnique({ where: { id: args.id } });
  return row ? toDTO(row) : null;
}

export async function deleteApiKey(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.apiKey.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

/**
 * 用 plaintext key 反查并校验，命中则记录 lastUsedAt。
 * 用于 MCP 端点鉴权。
 */
export async function findApiKeyByPlaintext(
  plaintext: string,
): Promise<{
  id: string;
  userId: string;
  scopeAll: boolean;
  projectScope: string[];
} | null> {
  if (!plaintext.startsWith(PREFIX)) return null;
  const hash = hashApiKey(plaintext);
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      userId: true,
      scopeAll: true,
      projectScope: true,
    },
  });
  if (!row) return null;
  // best-effort 更新 lastUsedAt；不阻塞鉴权
  prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  return row;
}

/** 给定 apikey 行与目标 projectId，校验是否在 scope 内 */
export function isProjectInScope(
  apiKey: { scopeAll: boolean; projectScope: string[] },
  projectId: string,
): boolean {
  return apiKey.scopeAll || apiKey.projectScope.includes(projectId);
}
