"use client";

import { Copy, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  createCredential,
  credentialsListKey,
  generateSshKeyPair,
  updateCredential,
} from "@/utils/credentials";
import type { CredentialDTO } from "@/lib/dto";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑模式传入；为空表示新建 */
  initial?: CredentialDTO | null;
}

export function CredentialDialog({ open, onOpenChange, initial }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <CredentialForm
          key={initial?.id ?? "new"}
          initial={initial ?? null}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CredentialForm({
  initial,
  onClose,
}: {
  initial: CredentialDTO | null;
  onClose: () => void;
}) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [privateKey, setPrivateKey] = useState("");
  const [generatedPublicKey, setGeneratedPublicKey] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function onGenerate() {
    if (generating) return;
    if (
      privateKey.trim().length > 0 &&
      !confirm("将覆盖当前输入的私钥内容，确认？")
    ) {
      return;
    }
    setGenerating(true);
    try {
      const comment = name.trim() || "anytocontext-deploy-key";
      const pair = await generateSshKeyPair(comment);
      setPrivateKey(pair.privateKey);
      setGeneratedPublicKey(pair.publicKey);
      toast.success("已生成 ed25519 密钥对");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function onCopy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      if (editing && initial) {
        await updateCredential({
          id: initial.id,
          name: name.trim() || undefined,
          privateKey: privateKey.trim() || undefined,
        });
        toast.success("凭证已更新");
      } else {
        if (privateKey.trim().length < 20) {
          toast.error("请填写私钥内容（或点「自动生成」）");
          return;
        }
        await createCredential({
          name: name.trim(),
          privateKey: privateKey.trim(),
        });
        toast.success("凭证已创建");
      }
      await mutate(credentialsListKey);
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
        <DialogTitle>{editing ? "编辑凭证" : "新建 SSH 凭证"}</DialogTitle>
        <DialogDescription>
          私钥使用 AES-256-GCM 加密保存，编辑时不会回显已保存内容。
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cred-name">名称</Label>
          <Input
            id="cred-name"
            placeholder="例如：github-deploy-key"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="cred-key">
              SSH 私钥 (PEM){editing ? "（留空则不修改）" : ""}
            </Label>
            {!editing && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                )}
                自动生成 ed25519
              </Button>
            )}
          </div>
          <Textarea
            id="cred-key"
            rows={10}
            spellCheck={false}
            wrap="off"
            placeholder={
              "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"
            }
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="block w-full font-mono text-xs resize-y overflow-auto"
            // 关掉 ui/textarea.tsx 默认的 field-sizing:content —— 长行私钥会把
            // textarea 撑爆 dialog 宽度（576px）。fixed + wrap=off + overflow-auto
            // 保持私钥原始格式，超宽横向滚动
            style={{ fieldSizing: "fixed" } as React.CSSProperties}
          />
        </div>

        {generatedPublicKey && (
          <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-50 p-3 dark:bg-emerald-950">
            <div className="flex items-center justify-between">
              <Label className="text-emerald-900 dark:text-emerald-100">
                对应公钥（复制到 GitHub Deploy Keys）
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onCopy(generatedPublicKey)}
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                复制
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-background/60 p-2 font-mono text-[11px] whitespace-pre-wrap break-all">
              {generatedPublicKey}
            </pre>
            <p className="text-xs text-emerald-900/80 dark:text-emerald-100/80">
              在 GitHub 仓库 Settings → Deploy keys → Add deploy
              key，粘贴上面这段；如果需要 push 权限勾选 Allow write
              access（构建只读 clone 不需要）。
            </p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button onClick={onSubmit} disabled={submitting || !name.trim()}>
          {submitting ? "保存中…" : "保存"}
        </Button>
      </DialogFooter>
    </>
  );
}
