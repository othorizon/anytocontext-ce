"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { FolderGit2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import {
  deleteProjectApi,
  projectsListKey,
  useProjects,
} from "@/utils/projects";
import type { ProjectSummaryDTO } from "@/lib/dto";

export default function ProjectsPage() {
  const { data, isLoading, error } = useProjects();
  const [open, setOpen] = useState(false);

  async function onDelete(p: ProjectSummaryDTO) {
    if (
      !confirm(`确定删除项目「${p.name}」?该操作不可撤销，相关构建与查询任务记录也会被清除。`)
    ) {
      return;
    }
    try {
      await deleteProjectApi(p.id);
      toast.success("项目已删除");
      await mutate(projectsListKey);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-1 flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">项目</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每个项目用一张 workflow 图组织数据源，构建到对象存储后可在 Playground / MCP 中对话。
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新建项目
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
            还没有项目。点击「新建项目」开始你的第一个 workflow。
          </div>
        )}
        {!isLoading && data?.items && data.items.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((p) => (
              <div key={p.id} className="group relative">
                <Link
                  href={`/projects/${p.id}`}
                  className="flex flex-col rounded-md border p-4 transition-colors hover:bg-muted/40"
                  aria-label={`打开项目 ${p.name}`}
                >
                  <div className="flex items-center gap-2 pr-8">
                    <FolderGit2 className="h-5 w-5 text-muted-foreground" />
                    <div className="font-medium">{p.name}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    更新于 {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-3 top-3 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(p);
                  }}
                  aria-label="删除项目"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateProjectDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
