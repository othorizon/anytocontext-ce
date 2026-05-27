"use client";

import { Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  secret: string | null;
  onClose: () => void;
}

export function ApiKeySecretDialog({ open, secret, onClose }: Props) {
  const [tab, setTab] = useState<"secret" | "mcp">("secret");

  const mcpJson = useMemo(() => {
    if (!secret) return "";
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/mcp/${secret}`
        : `/api/mcp/${secret}`;
    return JSON.stringify(
      {
        mcpServers: {
          anytocontext: {
            url: base,
          },
        },
      },
      null,
      2,
    );
  }, [secret]);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>请妥善保存这个 API Key</DialogTitle>
          <DialogDescription>
            出于安全考虑，明文 key 只在此显示一次。关闭后无法再次查看；如丢失只能重新创建。
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b text-sm">
          <TabButton
            active={tab === "secret"}
            onClick={() => setTab("secret")}
          >
            API Key 明文
          </TabButton>
          <TabButton active={tab === "mcp"} onClick={() => setTab("mcp")}>
            MCP 配置
          </TabButton>
        </div>

        {tab === "secret" && secret && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm break-all">
              {secret}
            </div>
            <Button variant="outline" onClick={() => copy(secret)}>
              <Copy className="mr-2 h-4 w-4" />
              复制
            </Button>
          </div>
        )}

        {tab === "mcp" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              把以下 JSON 写入 Claude Desktop / Claude Code 等 MCP 客户端的配置文件。
              工具流程：先调 <code>query_project</code>，若返回 pending 则继续调{" "}
              <code>get_query_result(taskId)</code> 直到 done 或 failed。
            </p>
            <pre className="rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
              {mcpJson}
            </pre>
            <Button variant="outline" onClick={() => copy(mcpJson)}>
              <Copy className="mr-2 h-4 w-4" />
              复制 JSON
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>我已保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "border-b-2 px-3 py-2 transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
