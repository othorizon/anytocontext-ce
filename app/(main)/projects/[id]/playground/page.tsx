import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectPlayground } from "@/components/projects/project-playground";
import { requireUserId } from "@/lib/auth";
import { getProject } from "@/lib/db/projects";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaygroundPage({ params }: PageProps) {
  const userId = await requireUserId();
  const { id } = await params;
  const project = await getProject(userId, id);
  if (!project) notFound();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-1 flex-col">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Button asChild size="icon" variant="ghost" className="h-7 w-7">
            <Link href={`/projects/${id}?tab=chat`} aria-label="返回对话设置">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-base font-semibold">{project.name} · Playground</h1>
        </div>
        <span className="text-xs text-muted-foreground">
          每次查询独立、无对话历史；刷新页面清空
        </span>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">
        <ProjectPlayground projectId={id} fullHeight />
      </main>
    </div>
  );
}
