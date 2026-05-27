"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Hammer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildsListKey, startBuildApi } from "@/utils/builds";
import { clearDraft, hasDraft, loadDraft } from "@/lib/workflow/draft";
import { projectGetKey, saveGraphApi } from "@/utils/projects";

interface Props {
  projectId: string;
}

export function StartBuildButton({ projectId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runBuild() {
    setBusy(true);
    try {
      const build = await startBuildApi(projectId);
      toast.success("构建已发起");
      await mutate(buildsListKey(projectId));
      router.push(`/projects/${projectId}/builds?selected=${build.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onClick() {
    // 编辑器把未保存改动写在 localStorage 草稿里 —— 有草稿说明 client 和 server 版本不一致
    if (hasDraft(projectId)) {
      setConfirmOpen(true);
      return;
    }
    void runBuild();
  }

  async function onSaveAndBuild() {
    setConfirmOpen(false);
    const draft = loadDraft(projectId);
    if (!draft) {
      // 罕见竞态：草稿在 dialog 期间被清掉，直接构建
      void runBuild();
      return;
    }
    setBusy(true);
    try {
      await saveGraphApi(projectId, draft);
      clearDraft(projectId, "build");
      // 让 editor / project SWR 拉到最新 baseline
      await mutate(projectGetKey(projectId));
      toast.success("草稿已保存");
    } catch (err) {
      toast.error(`保存失败：${(err as Error).message}`);
      setBusy(false);
      return;
    }
    await runBuild();
  }

  async function onDiscardAndBuild() {
    setConfirmOpen(false);
    // 仅用 server 上的 saved graph 构建 —— 草稿继续留在 localStorage，编辑器刷新仍可恢复
    void runBuild();
  }

  return (
    <>
      <Button size="sm" onClick={onClick} disabled={busy}>
        <Hammer className="mr-1 h-4 w-4" />
        {busy ? "启动中…" : "立即构建"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>有未保存的改动</DialogTitle>
            <DialogDescription>
              工作流编辑器还有未保存到服务器的本地草稿。构建始终基于
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
              onClick={onDiscardAndBuild}
              disabled={busy}
              title="保留本地草稿不动，构建用服务器上已保存的版本"
            >
              放弃保存并构建
            </Button>
            <Button onClick={onSaveAndBuild} disabled={busy}>
              保存后构建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
