"use client";

import { useRef, useState } from "react";
import { Send, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  abortQueryApi,
  pollResult,
  startQuery,
  type AgentResult,
} from "@/utils/agent";

interface Exchange {
  id: string;
  prompt: string;
  status: "running" | "done" | "failed" | "aborted";
  text?: string;
  error?: string;
  taskId?: string;
}

interface Props {
  projectId: string;
  /** 默认 false：嵌在 tab 内时不需要再有大留白；独立页可改为 true 撑满 */
  fullHeight?: boolean;
}

export function ProjectPlayground({ projectId, fullHeight = false }: Props) {
  const [prompt, setPrompt] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const stopPollingRef = useRef<Map<string, boolean>>(new Map());

  async function onSubmit() {
    if (!prompt.trim()) return;
    const id = crypto.randomUUID();
    const userPrompt = prompt.trim();
    setExchanges((prev) => [
      ...prev,
      { id, prompt: userPrompt, status: "running" },
    ]);
    setPrompt("");

    try {
      const first = await startQuery({ projectId, prompt: userPrompt });
      applyResult(id, first);
      if (first.status === "pending") {
        void pollLoop(id, first.taskId);
      }
    } catch (err) {
      setExchanges((prev) =>
        prev.map((ex) =>
          ex.id === id
            ? { ...ex, status: "failed", error: (err as Error).message }
            : ex,
        ),
      );
    }
  }

  async function pollLoop(exchangeId: string, taskId: string) {
    while (true) {
      if (stopPollingRef.current.get(exchangeId)) return;
      try {
        const r = await pollResult(taskId, 30_000);
        applyResult(exchangeId, r);
        if (r.status !== "pending") return;
      } catch (err) {
        toast.error((err as Error).message);
        setExchanges((prev) =>
          prev.map((ex) =>
            ex.id === exchangeId
              ? { ...ex, status: "failed", error: (err as Error).message }
              : ex,
          ),
        );
        return;
      }
    }
  }

  function applyResult(exchangeId: string, r: AgentResult) {
    setExchanges((prev) =>
      prev.map((ex) => {
        if (ex.id !== exchangeId) return ex;
        if (r.status === "done")
          return { ...ex, status: "done", text: r.finalText };
        if (r.status === "failed")
          return { ...ex, status: "failed", error: r.error };
        if (r.status === "aborted") return { ...ex, status: "aborted" };
        return { ...ex, status: "running", taskId: r.taskId };
      }),
    );
  }

  async function onAbort(ex: Exchange) {
    if (!ex.taskId) return;
    stopPollingRef.current.set(ex.id, true);
    try {
      await abortQueryApi(ex.taskId);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setExchanges((prev) =>
      prev.map((e) => (e.id === ex.id ? { ...e, status: "aborted" } : e)),
    );
  }

  return (
    <div
      className={
        fullHeight ? "flex h-full flex-col overflow-hidden" : "flex flex-col"
      }
    >
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {exchanges.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            向项目数据提问，例如：「/workspace 下都有哪些文件？」
          </div>
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {exchanges.map((ex) => (
            <ExchangeView key={ex.id} ex={ex} onAbort={onAbort} />
          ))}
        </div>
      </div>

      <div className="border-t bg-background p-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-2">
            <Textarea
              rows={3}
              placeholder="输入问题，Cmd/Ctrl + Enter 发送"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void onSubmit();
                }
              }}
            />
            <Button
              onClick={onSubmit}
              disabled={!prompt.trim()}
              className="self-end"
            >
              <Send className="mr-1 h-4 w-4" />
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExchangeView({
  ex,
  onAbort,
}: {
  ex: Exchange;
  onAbort: (ex: Exchange) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md bg-muted px-4 py-2 text-sm">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          你的提问
        </div>
        <div className="mt-1 whitespace-pre-wrap">{ex.prompt}</div>
      </div>
      <div className="rounded-md border px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Agent
          </div>
          <StatusPill status={ex.status} />
        </div>
        {ex.status === "running" && (
          <div className="mt-2 flex items-center justify-between">
            <span className="animate-pulse text-sm text-muted-foreground">
              思考中…
            </span>
            <Button size="sm" variant="ghost" onClick={() => onAbort(ex)}>
              <StopCircle className="mr-1 h-4 w-4" />
              取消
            </Button>
          </div>
        )}
        {ex.status === "done" && (
          <div className="mt-2 whitespace-pre-wrap">{ex.text}</div>
        )}
        {ex.status === "failed" && (
          <div className="mt-2 text-destructive">错误：{ex.error}</div>
        )}
        {ex.status === "aborted" && (
          <div className="mt-2 text-muted-foreground">已取消</div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Exchange["status"] }) {
  const map: Record<Exchange["status"], { label: string; cls: string }> = {
    running: { label: "running", cls: "text-amber-600" },
    done: { label: "done", cls: "text-emerald-600" },
    failed: { label: "failed", cls: "text-destructive" },
    aborted: { label: "aborted", cls: "text-muted-foreground" },
  };
  const m = map[status];
  return <span className={`text-[10px] ${m.cls}`}>{m.label}</span>;
}
