import ws from "ws";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { getRuntimeDatabaseUrl } from "@/lib/db/config";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Next 的 server bundling 偶尔会把 `bufferutil` 的 stub 喂给 `ws`，
// 强制走纯 JS 实现，保证 Neon WebSocket 在 dev 下稳定。
process.env.WS_NO_BUFFER_UTIL ??= "1";
process.env.WS_NO_UTF_8_VALIDATE ??= "1";
// 仅在 Node 运行时需要 ws 注入；Edge runtime 自带 WebSocket
neonConfig.webSocketConstructor = ws;

function createPrisma() {
  const adapter = new PrismaNeon({ connectionString: getRuntimeDatabaseUrl() });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
