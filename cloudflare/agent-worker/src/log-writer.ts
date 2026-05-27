/**
 * 给构建日志用的"GET+append+PUT"实时追加写。
 *
 * R2 没有原生 append；我们维护内存缓冲，按时间/字节触发 flush：
 *   1. GET 当前对象 → 拼接 buffer → PUT 回去
 *   2. 同一个 buildId 全局只有一个 BuildWorkflow instance 在写，无并发
 *
 * 用法：
 *   const log = new R2LogWriter(env.FILES, key);
 *   await log.append("git clone ...\n");
 *   await log.append(stdout);
 *   await log.flush();   // 最后强制 flush
 */

const FLUSH_BYTES = 4 * 1024; // 4KB
const FLUSH_INTERVAL_MS = 500;

export class R2LogWriter {
  private buffer = "";
  private existing: string | null = null;
  private lastFlushAt = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private bucket: R2Bucket,
    private key: string,
  ) {}

  async append(text: string): Promise<void> {
    if (!text) return;
    this.buffer += text;
    if (this.buffer.length >= FLUSH_BYTES) {
      await this.flush();
      return;
    }
    if (
      !this.pendingTimer &&
      Date.now() - this.lastFlushAt >= FLUSH_INTERVAL_MS
    ) {
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        this.flush().catch((err) => console.error("[log-writer] flush", err));
      }, FLUSH_INTERVAL_MS);
    }
  }

  async flush(): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (!this.buffer) return;
    if (this.existing === null) {
      // 第一次：读现有内容（可能是上次失败的残留；正常应不存在）
      const obj = await this.bucket.get(this.key);
      this.existing = obj ? await obj.text() : "";
    }
    const next = this.existing + this.buffer;
    await this.bucket.put(this.key, next, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    this.existing = next;
    this.buffer = "";
    this.lastFlushAt = Date.now();
  }

  /** 写一行（自动补换行） */
  async appendLine(text: string): Promise<void> {
    await this.append(text.endsWith("\n") ? text : text + "\n");
  }
}
