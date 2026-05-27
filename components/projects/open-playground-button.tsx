"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { clearDraft, loadChatDraft } from "@/lib/workflow/draft";
import { projectGetKey, saveChatGraphApi } from "@/utils/projects";

interface Props {
  projectId: string;
}

export function OpenPlaygroundButton({ projectId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function go() {
    router.push(`/projects/${projectId}/playground`);
  }

  function onClick() {
    // 对话设置（chatGraph）有未保存草稿就先弹窗——和 StartBuildButton 一样
    // 让用户决定：保存后打开 / 放弃保存并打开 / 取消
    if (loadChatDraft(projectId)) {
      setConfirmOpen(true);
      return;
    }
    go();
  }

  async function onSaveAndOpen() {
    setConfirmOpen(false);
    const draft = loadChatDraft(projectId);
    if (!draft) {
      go();
      return;
    }
    setBusy(true);
    try {
      await saveChatGraphApi(projectId, draft);
      clearDraft(projectId, "chat");
      await mutate(projectGetKey(projectId));
      toast.success("对话设置已保存");
    } catch (err) {
      toast.error(`保存失败：${(err as Error).message}`);
      setBusy(false);
      return;
    }
    setBusy(false);
    go();
  }

  function onDiscardAndOpen() {
    setConfirmOpen(false);
    // 草稿继续留在 localStorage，编辑器刷新仍可恢复；但本次 playground 用服务器上版本
    go();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={onClick} disabled={busy}>
        <MessageSquare className="mr-1 h-4 w-4" />
        Playground
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>有未保存的对话设置</DialogTitle>
            <DialogDescription>
              对话编辑器还有未保存到服务器的本地草稿。Playground 始终基于
              <b>服务器版本</b>运行，你想怎么处理？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              variant="outline"
              onClick={onDiscardAndOpen}
              disabled={busy}
              title="保留本地草稿不动，Playground 用服务器上已保存的版本"
            >
              放弃保存并打开
            </Button>
            <Button onClick={onSaveAndOpen} disabled={busy}>
              保存后打开
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
