"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartBuildButton } from "@/components/builds/start-build-button";
import { ProjectWorkflowEditor } from "@/components/workflow/editor";
import { ChatWorkflowEditor } from "@/components/workflow/chat-editor";
import { OpenPlaygroundButton } from "./open-playground-button";
import type { ProjectDTO } from "@/lib/dto";

type TabKey = "build" | "chat";

interface Props {
  project: ProjectDTO;
}

export function ProjectDetailShell({ project }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: TabKey = raw === "chat" ? "chat" : "build";

  const setTab = useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "build") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const q = params.toString();
      router.replace(`/projects/${project.id}${q ? `?${q}` : ""}`);
    },
    [router, searchParams, project.id],
  );

  const tabs = useMemo<{ key: TabKey; label: string }[]>(
    () => [
      { key: "build", label: "构建配置" },
      { key: "chat", label: "对话配置" },
    ],
    [],
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-1 flex-col">
      {/* 顶部三段栏：左标题、中 tab、右操作。grid 三列保证中间 tab 严格水平居中 */}
      <header className="grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b px-4">
        <div className="flex items-center gap-2">
          <Button asChild size="icon" variant="ghost" className="h-7 w-7">
            <Link href="/projects" aria-label="返回项目列表">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-base font-semibold">{project.name}</h1>
        </div>
        <nav className="inline-flex items-center rounded-lg border bg-muted/40 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                t.key === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-2">
          <OpenPlaygroundButton projectId={project.id} />
          {tab === "build" && (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={`/projects/${project.id}/builds`}>构建历史</Link>
              </Button>
              <StartBuildButton projectId={project.id} />
            </>
          )}
        </div>
      </header>

      {tab === "build" ? (
        <ProjectWorkflowEditor
          projectId={project.id}
          initialGraph={project.graph}
        />
      ) : (
        <ChatWorkflowEditor
          projectId={project.id}
          initialChatGraph={project.chatGraph}
          buildGraph={project.graph}
        />
      )}
    </div>
  );
}
