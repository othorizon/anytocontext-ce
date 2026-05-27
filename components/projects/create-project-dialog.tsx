"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { createProjectApi, projectsListKey } from "@/utils/projects";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <CreateProjectForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateProjectForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const project = await createProjectApi(name.trim());
      await mutate(projectsListKey);
      toast.success("项目已创建");
      onClose();
      router.push(`/projects/${project.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>新建项目</DialogTitle>
        <DialogDescription>
          创建后会跳转到 workflow 编辑器，可立即添加数据源与模型节点。
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="proj-name">项目名称</Label>
        <Input
          id="proj-name"
          autoFocus
          placeholder="例如：my-knowledge-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !submitting) onSubmit();
          }}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button onClick={onSubmit} disabled={submitting || !name.trim()}>
          {submitting ? "创建中…" : "创建"}
        </Button>
      </DialogFooter>
    </>
  );
}
