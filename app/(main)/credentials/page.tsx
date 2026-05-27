"use client";

import { Plus, Trash2, KeyRound, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { CredentialDialog } from "@/components/credentials/credential-dialog";
import {
  credentialsListKey,
  deleteCredentialApi,
  useCredentials,
} from "@/utils/credentials";
import type { CredentialDTO } from "@/lib/dto";

export default function CredentialsPage() {
  const { data, isLoading, error } = useCredentials();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialDTO | null>(null);

  async function onDelete(c: CredentialDTO) {
    if (!confirm(`确定删除凭证「${c.name}」?`)) return;
    try {
      await deleteCredentialApi(c.id);
      toast.success("凭证已删除");
      await mutate(credentialsListKey);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">凭证</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SSH 私钥等敏感数据，加密保存。供 Git 数据源节点使用。
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          新建凭证
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
            还没有任何凭证。点击「新建凭证」添加 SSH 私钥。
          </div>
        )}
        {!isLoading && data?.items && data.items.length > 0 && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">名称</th>
                  <th className="px-4 py-2 font-medium">类型</th>
                  <th className="px-4 py-2 font-medium">更新时间</th>
                  <th className="px-4 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        {c.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.type === "SSH_KEY" ? "SSH 私钥" : c.type}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(c);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(c)}
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

      <CredentialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
      />
    </div>
  );
}
