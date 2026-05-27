/**
 * Sandbox 持久化层 —— 把构建产物 /workspace 通过 SDK 原生 backup/restore 持久化到 R2。
 *
 * 不变量：
 * - BUILD_DIR 仅在 build sandbox 内可见，是数据源原始产出（git clone / text / script），
 *   不进 backup；构建末步根据 build 节点 outputDirs 把它复制到 WORKSPACE_DIR 下。
 * - WORKSPACE_DIR 是 backup 目标 + agent 默认 cwd，主应用 / agent tool 看到的都是这个根。
 * - excludes 是 mksquashfs 的 wildcard 模式，不要加 ** 前缀（CF SDK 是字面路径匹配）。
 * - 本地 dev 必须传 localBucket: true，否则 SDK 会走 presigned URL（容器内 fetch 不到本地 dev R2）。
 */
import type { DirectoryBackup, Sandbox } from "@cloudflare/sandbox";
import type { DirectoryBackupHandle } from "./types";

/** 数据源在 build sandbox 内的原始产出根目录，仅用于 build runner & assemble 阶段；不进 backup */
export const BUILD_DIR = "/build";
/** 构建装配 / backup / agent cwd 的工作区根目录 */
export const WORKSPACE_DIR = "/workspace";

/**
 * 5 年。只保留最新一份的语义由 BuildWorkflow.delete-old-backup 保证；
 * R2 lifecycle 不再加 expire-backups 兜底规则，所以 TTL 设长一点避免误过期。
 */
export const BACKUP_TTL_SECONDS = 5 * 365 * 24 * 60 * 60;

/**
 * 排除各语言依赖/包安装目录与缓存：体积大、可由 lockfile 重建，无需进备份。
 */
export const BACKUP_EXCLUDES = [
  // Node / JS
  "node_modules",
  ".pnpm-store",
  ".yarn/cache",
  // Python
  "__pycache__",
  "*.pyc",
  ".venv",
  "venv",
  ".mypy_cache",
  ".pytest_cache",
  ".tox",
  "*.egg-info",
];

export function isLocalDev(env: Env): boolean {
  const value = env.IS_LOCAL_DEV;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(
    (value ?? "").trim().toLowerCase(),
  );
}

/**
 * 构建末步调用：对 WORKSPACE_DIR 创建快照并返回可序列化 handle。
 * BUILD_DIR 不在 dir 参数下，天然不会被打进备份。
 * name 仅供 R2 控制台 / 调试肉眼识别，无业务语义。
 */
export async function backupWorkspace(
  env: Env,
  sandbox: Sandbox,
  name: string,
): Promise<DirectoryBackup> {
  return await sandbox.createBackup({
    dir: WORKSPACE_DIR,
    name,
    ttl: BACKUP_TTL_SECONDS,
    excludes: BACKUP_EXCLUDES,
    localBucket: isLocalDev(env),
  });
}

/**
 * Agent 任务首步调用：从 backup overlay 挂载 WORKSPACE_DIR。
 * 接受 DirectoryBackupHandle（来自主应用 Project.currentBackup）并转成 SDK 期望的形状。
 * sleep 后挂载会丢失；如需恢复要再调一次（本架构里每次新建 sandbox 都重新 restore，不会遇到）。
 */
export async function restoreWorkspace(
  _env: Env,
  sandbox: Sandbox,
  backup: DirectoryBackupHandle,
): Promise<void> {
  await sandbox.restoreBackup(backup as DirectoryBackup);
}

/**
 * 删除一份 backup 对应的两个 R2 对象。best-effort，吞错（旧 backup 由 R2 lifecycle 365 天兜底）。
 */
export async function deleteBackupRecord(
  env: Env,
  backupId: string,
): Promise<void> {
  try {
    await env.BACKUP_BUCKET.delete([
      `backups/${backupId}/data.sqsh`,
      `backups/${backupId}/meta.json`,
    ]);
  } catch (err) {
    console.error(
      `[backup] deleteBackupRecord(${backupId}) failed (will rely on R2 lifecycle):`,
      err,
    );
  }
}
