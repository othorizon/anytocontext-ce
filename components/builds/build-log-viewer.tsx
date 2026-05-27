"use client";

import { useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import {
  abortBuildApi,
  buildsListKey,
  fetchBuildLog,
  type LogSlice,
} from "@/utils/builds";

interface Props {
  buildId: string;
  projectId: string;
}

export function BuildLogViewer({ buildId, projectId }: Props) {
  return (
    <BuildLogStream buildId={buildId} projectId={projectId} key={buildId} />
  );
}

/**
 * 每秒轮询 /api/builds/log，要求服务端从上次偏移开始返回增量。
 * 终态后停止轮询。
 */
function BuildLogStream({ buildId, projectId }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<LogSlice["status"]>("PENDING");
  const [aborting, setAborting] = useState(false);
  const offsetRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const inProgress = status === "PENDING" || status === "RUNNING";

  async function onAbort() {
    if (!inProgress || aborting) return;
    if (!confirm("确定停止当前构建？已生成的日志和临时 sandbox 会被丢弃。")) {
      return;
    }
    setAborting(true);
    try {
      await abortBuildApi(buildId);
      toast.success("构建已停止");
      await mutate(buildsListKey(projectId));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAborting(false);
    }
  }

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const slice = await fetchBuildLog(buildId, offsetRef.current);
        if (stopped) return;
        if (slice.text) {
          setText((prev) => prev + slice.text);
          offsetRef.current = slice.totalSize;
        }
        setStatus(slice.status);
        if (slice.status === "SUCCESS" || slice.status === "FAILED") {
          // 终态再拉一次确保拿到尾部，然后停
          if (slice.text) return;
          return;
        }
      } catch {
        // 忽略一次失败，下次再试
      }
      if (!stopped) timer = setTimeout(tick, 1000);
    }

    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [buildId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [text]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs text-muted-foreground">
        <span>build {buildId.slice(0, 8)}…</span>
        <div className="flex items-center gap-3">
          <span
            className={
              status === "SUCCESS"
                ? "text-emerald-600"
                : status === "FAILED"
                  ? "text-destructive"
                  : "text-amber-600"
            }
          >
            {status}
          </span>
          {inProgress && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onAbort}
              disabled={aborting}
              className="h-7"
            >
              <Square className="mr-1 h-3 w-3" />
              {aborting ? "停止中…" : "停止"}
            </Button>
          )}
        </div>
      </div>
      <pre className="flex-1 overflow-auto bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-100">
        {text}
        <div ref={bottomRef} />
      </pre>
    </div>
  );
}
