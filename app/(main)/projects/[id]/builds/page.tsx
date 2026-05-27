"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BuildLogViewer } from "@/components/builds/build-log-viewer";
import { StartBuildButton } from "@/components/builds/start-build-button";
import { useBuilds } from "@/utils/builds";
import { useProject } from "@/utils/projects";
import type { BuildDTO } from "@/lib/dto";

export default function BuildsPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const projectId = params.id;
  const selectedId = search.get("selected");

  const { data: projectData } = useProject(projectId);
  const { data, isLoading } = useBuilds(projectId);
  const items = data?.items ?? [];
  const selected =
    items.find((b) => b.id === selectedId) ?? items[0] ?? null;

  const projectName = projectData?.item?.name ?? "...";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-1 flex-col">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Button asChild size="icon" variant="ghost" className="h-7 w-7">
            <Link href={`/projects/${projectId}`} aria-label="返回项目">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-base font-semibold">{projectName} · 构建历史</h1>
        </div>
        <StartBuildButton projectId={projectId} />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 overflow-y-auto border-r">
          {isLoading && (
            <div className="p-4 text-sm text-muted-foreground">加载中…</div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              还没有任何构建。点击右上角「立即构建」开始。
            </div>
          )}
          {items.map((b) => (
            <BuildRow
              key={b.id}
              build={b}
              selected={selected?.id === b.id}
              projectId={projectId}
            />
          ))}
        </aside>
        <main className="flex-1">
          {selected ? (
            <BuildLogViewer buildId={selected.id} projectId={projectId} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              选择左侧的构建查看日志
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function BuildRow({
  build,
  selected,
  projectId,
}: {
  build: BuildDTO;
  selected: boolean;
  projectId: string;
}) {
  return (
    <Link
      href={`/projects/${projectId}/builds?selected=${build.id}`}
      className={[
        "block border-b px-3 py-2.5 transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/50",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs">{build.id.slice(0, 8)}</span>
        <StatusBadge status={build.status} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {new Date(build.createdAt).toLocaleString()}
      </div>
      {build.error && (
        <div className="mt-1 truncate text-xs text-destructive">{build.error}</div>
      )}
    </Link>
  );
}

function StatusBadge({ status }: { status: BuildDTO["status"] }) {
  const variant =
    status === "SUCCESS"
      ? "secondary"
      : status === "FAILED"
        ? "destructive"
        : "outline";
  return (
    <Badge variant={variant} className="text-[10px]">
      {status}
    </Badge>
  );
}
