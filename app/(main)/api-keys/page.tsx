"use client";

import { Eye, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiKeyDialog } from "@/components/api-keys/api-key-dialog";
import { ApiKeyDetailDialog } from "@/components/api-keys/api-key-detail-dialog";
import { ApiKeySecretDialog } from "@/components/api-keys/api-key-secret-dialog";
import {
  apiKeysListKey,
  deleteApiKeyApi,
  useApiKeys,
} from "@/utils/api-keys";
import type { ApiKeyDTO, ApiKeyWithSecretDTO } from "@/lib/dto";

export default function ApiKeysPage() {
  const { data, isLoading, error } = useApiKeys();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKeyDTO | null>(null);
  const [viewing, setViewing] = useState<ApiKeyDTO | null>(null);
  const [createdSecret, setCreatedSecret] =
    useState<ApiKeyWithSecretDTO | null>(null);

  async function onDelete(k: ApiKeyDTO) {
    if (!confirm(`确定删除 API Key「${k.name}」?`)) return;
    try {
      await deleteApiKeyApi(k.id);
      toast.success("API Key 已删除");
      await mutate(apiKeysListKey);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Key</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            给 MCP 或程序化访问签发的凭证。可授权访问全部项目或精确到若干项目。
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          新建 API Key
        </Button>
      </div>

      <div className="mt-8">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            加载失败：{(error as Error).message}
          </div>
        )}
        {isLoading && (
          <div className="text-sm text-muted-foreground">加载中…</div>
        )}
        {!isLoading && (data?.items?.length ?? 0) === 0 && (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            还没有 API Key。点击「新建 API Key」开始创建。
          </div>
        )}
        {!isLoading && data?.items && data.items.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">名称</th>
                  <th className="px-4 py-2 font-medium">前缀</th>
                  <th className="px-4 py-2 font-medium">权限范围</th>
                  <th className="px-4 py-2 font-medium">最近使用</th>
                  <th className="px-4 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((k) => (
                  <tr key={k.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        {k.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">
                      {k.prefix}…
                    </td>
                    <td className="px-4 py-3">
                      {k.scopeAll ? (
                        <Badge variant="secondary">所有项目</Badge>
                      ) : (
                        <Badge variant="outline">
                          {k.projectScope.length} 个项目
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setViewing(k)}
                        title="查看详情 / MCP 配置"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(k);
                          setDialogOpen(true);
                        }}
                        title="编辑"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(k)}
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ApiKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onCreated={setCreatedSecret}
      />
      <ApiKeySecretDialog
        open={!!createdSecret}
        secret={createdSecret?.secret ?? null}
        onClose={() => setCreatedSecret(null)}
      />
      <ApiKeyDetailDialog
        open={!!viewing}
        apiKey={viewing}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
