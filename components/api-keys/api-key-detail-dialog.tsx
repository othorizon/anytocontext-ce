"use client";

import { Copy } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiKeyDTO } from "@/lib/dto";

interface Props {
  open: boolean;
  apiKey: ApiKeyDTO | null;
  onClose: () => void;
}

const KEY_PLACEHOLDER = "<YOUR_API_KEY>";

export function ApiKeyDetailDialog({ open, apiKey, onClose }: Props) {
  const mcpJson = useMemo(() => {
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/mcp/${KEY_PLACEHOLDER}`
        : `/api/mcp/${KEY_PLACEHOLDER}`;
    return JSON.stringify(
      { mcpServers: { anytocontext: { url: base } } },
      null,
      2,
    );
  }, []);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            API Key 详情{apiKey ? ` · ${apiKey.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        {apiKey && (
          <>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">前缀</dt>
              <dd className="font-mono">{apiKey.prefix}…</dd>
              <dt className="text-muted-foreground">权限范围</dt>
              <dd>
                {apiKey.scopeAll ? (
                  <Badge variant="secondary">所有项目（含未来新建）</Badge>
                ) : (
                  <Badge variant="outline">
                    {apiKey.projectScope.length} 个项目
                  </Badge>
                )}
              </dd>
              <dt className="text-muted-foreground">创建时间</dt>
              <dd>{new Date(apiKey.createdAt).toLocaleString()}</dd>
              <dt className="text-muted-foreground">最近使用</dt>
              <dd>
                {apiKey.lastUsedAt
                  ? new Date(apiKey.lastUsedAt).toLocaleString()
                  : "—"}
              </dd>
            </dl>

            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-medium">MCP 配置</h3>
              <p className="text-xs text-muted-foreground">
                把以下 JSON 写入 Claude Desktop / Claude Code 等 MCP
                客户端配置；将{" "}
                <code className="rounded bg-muted px-1">{KEY_PLACEHOLDER}</code>{" "}
                替换为创建时保存的明文 key（key 仅在创建时显示一次，DB 只存
                sha256 哈希，丢失只能重新创建）。
              </p>
              <pre className="rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-all">
                {mcpJson}
              </pre>
              <Button variant="outline" onClick={() => copy(mcpJson)}>
                <Copy className="mr-2 h-4 w-4" />
                复制 JSON
              </Button>
              <p className="text-xs text-muted-foreground">
                工具调用流程：先调 <code>query_project</code>；若返回 pending
                状态，循环调 <code>get_query_result(taskId)</code> 直到 done 或
                failed。
              </p>
            </div>
          </>
        )}

        <DialogFooter>
          <Button onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
