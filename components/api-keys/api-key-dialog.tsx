"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  apiKeysListKey,
  createApiKeyApi,
  updateApiKeyScopeApi,
} from "@/utils/api-keys";
import { useProjects } from "@/utils/projects";
import type { ApiKeyDTO, ApiKeyWithSecretDTO } from "@/lib/dto";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑模式传入；为空表示新建 */
  initial?: ApiKeyDTO | null;
  /** 创建成功后回调，用于弹出明文 secret 对话框 */
  onCreated?: (created: ApiKeyWithSecretDTO) => void;
}

export function ApiKeyDialog({
  open,
  onOpenChange,
  initial,
  onCreated,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <ApiKeyForm
          initial={initial ?? null}
          onCreated={onCreated}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ApiKeyForm({
  initial,
  onCreated,
  onClose,
}: {
  initial: ApiKeyDTO | null;
  onCreated?: (created: ApiKeyWithSecretDTO) => void;
  onClose: () => void;
}) {
  const editing = !!initial;
  const projects = useProjects();
  const [name, setName] = useState(initial?.name ?? "");
  const [scopeAll, setScopeAll] = useState(initial?.scopeAll ?? false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial?.projectScope ?? []),
  );
  const [submitting, setSubmitting] = useState(false);

  const items = useMemo(() => projects.data?.items ?? [], [projects.data]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      if (editing && initial) {
        await updateApiKeyScopeApi({
          id: initial.id,
          scopeAll,
          projectScope: Array.from(selected),
        });
        toast.success("权限已更新");
      } else {
        const created = await createApiKeyApi({
          name: name.trim(),
          scopeAll,
          projectScope: Array.from(selected),
        });
        toast.success("API Key 已创建");
        onCreated?.(created);
      }
      await mutate(apiKeysListKey);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editing ? "编辑 API Key 权限" : "新建 API Key"}
        </DialogTitle>
        <DialogDescription>
          为 MCP / 程序化访问签发凭证。可以授予所有项目，或精确选择若干项目。
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {!editing && (
          <div className="space-y-2">
            <Label htmlFor="key-name">名称</Label>
            <Input
              id="key-name"
              placeholder="例如：claude-desktop"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={scopeAll}
            onChange={(e) => setScopeAll(e.target.checked)}
          />
          访问该账号下的所有项目（含未来新建的项目）
        </label>

        {!scopeAll && (
          <div className="space-y-2">
            <Label>授权访问的项目</Label>
            <div className="max-h-60 overflow-auto rounded-md border p-2">
              {projects.isLoading && (
                <div className="px-2 py-1 text-sm text-muted-foreground">
                  加载中…
                </div>
              )}
              {!projects.isLoading && items.length === 0 && (
                <div className="px-2 py-1 text-sm text-muted-foreground">
                  还没有任何项目，先去创建一个项目，或勾选「所有项目」。
                </div>
              )}
              {items.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-muted/60 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button
          onClick={onSubmit}
          disabled={
            submitting ||
            (!editing && !name.trim()) ||
            (!scopeAll && selected.size === 0)
          }
        >
          {submitting ? "保存中…" : editing ? "保存" : "创建"}
        </Button>
      </DialogFooter>
    </>
  );
}
