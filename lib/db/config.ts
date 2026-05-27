/**
 * 数据库连接配置（Neon）：
 * - 运行时走 `DATABASE_URL`，应是 Neon 的 pooled 连接（host 形如 `*-pooler.region.neon.tech`）。
 * - Prisma CLI（migrate / introspect / studio）必须走直连，因为 Neon pooler 不支持 DDL；
 *   首选 `DIRECT_URL`，缺失时回退 `DATABASE_URL`（仅当 DATABASE_URL 本身就是直连时才能跑成功）。
 */

const PLACEHOLDER_DATABASE_URL =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";

const readEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

export const getRuntimeDatabaseUrl = () => {
  const databaseUrl = readEnv("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("Please define DATABASE_URL in the environment.");
  }
  return databaseUrl;
};

export const getCliDatabaseUrl = () => {
  const directUrl = readEnv("DIRECT_URL");
  const databaseUrl = readEnv("DATABASE_URL");
  return directUrl ?? databaseUrl ?? PLACEHOLDER_DATABASE_URL;
};
