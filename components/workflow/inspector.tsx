"use client";

import dynamic from "next/dynamic";
import {
  Copy,
  FileText,
  GitBranch,
  Package,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  hasNodeOutput,
  isSourceExcluded,
  nodePath,
  workspaceOutputPath,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/dto/workflow";
import { collectSourcesForBuild } from "@/lib/workflow/topology";
import { useCredentials } from "@/utils/credentials";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center rounded-md border text-xs text-muted-foreground">
      加载编辑器…
    </div>
  ),
});

interface Props {
  node: WorkflowNode | null;
  graph: WorkflowGraph;
  /** 用 patch 更新该节点的 data 字段（只覆盖给定的子字段） */
  onUpdate: (nodeId: string, patch: Partial<WorkflowNode>) => void;
  onRename: (nodeId: string, name: string) => void;
}

export function Inspector({ node, graph, onUpdate, onRename }: Props) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <div>未选中节点</div>
        <div className="text-xs">在画布上点击任意节点查看与编辑配置。</div>
      </div>
    );
  }

  return (
    <div className="nokey flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <TypeBadge type={node.type} />
        <Input
          value={node.name}
          onChange={(e) => onRename(node.id, e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {node.type === "git" && <GitForm node={node} onUpdate={onUpdate} />}
        {node.type === "text" && <TextForm node={node} onUpdate={onUpdate} />}
        {node.type === "script" && (
          <ScriptForm node={node} onUpdate={onUpdate} />
        )}
        {node.type === "build" && (
          <BuildForm node={node} graph={graph} onUpdate={onUpdate} />
        )}
      </div>
      {hasNodeOutput(node) && (
        <div className="border-t bg-muted/30 px-4 py-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            源路径
          </div>
          <div className="mt-1 font-mono text-xs">{nodePath(node)}</div>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: WorkflowNode["type"] }) {
  const map = {
    git: { icon: GitBranch, label: "Git" },
    text: { icon: FileText, label: "Text" },
    script: { icon: Terminal, label: "Script" },
    build: { icon: Package, label: "构建" },
  } as const;
  const m = map[type];
  const Icon = m.icon;
  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

function GitForm({
  node,
  onUpdate,
}: {
  node: Extract<WorkflowNode, { type: "git" }>;
  onUpdate: Props["onUpdate"];
}) {
  const credentials = useCredentials();
  function patch(d: Partial<typeof node.data>) {
    onUpdate(node.id, { ...node, data: { ...node.data, ...d } } as WorkflowNode);
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>仓库 URL</Label>
        <Input
          value={node.data.url}
          onChange={(e) => patch({ url: e.target.value })}
          placeholder="git@github.com:owner/repo.git"
        />
      </div>
      <div className="space-y-2">
        <Label>Branch 或 Tag</Label>
        <Input
          value={node.data.ref}
          onChange={(e) => patch({ ref: e.target.value })}
          placeholder="main"
        />
      </div>
      <div className="space-y-2">
        <Label>SSH 凭证</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={node.data.credentialId ?? ""}
          onChange={(e) =>
            patch({ credentialId: e.target.value || undefined })
          }
        >
          <option value="">不使用（公开仓库）</option>
          {(credentials.data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TextForm({
  node,
  onUpdate,
}: {
  node: Extract<WorkflowNode, { type: "text" }>;
  onUpdate: Props["onUpdate"];
}) {
  return (
    <div className="space-y-2">
      <Label>Markdown 内容</Label>
      <div className="rounded-md border">
        <MonacoEditor
          height="360px"
          language="markdown"
          value={node.data.content}
          onChange={(v) =>
            onUpdate(node.id, {
              ...node,
              data: { ...node.data, content: v ?? "" },
            } as WorkflowNode)
          }
          options={{
            minimap: { enabled: false },
            wordWrap: "on",
            fontSize: 12,
          }}
        />
      </div>
    </div>
  );
}

function ScriptForm({
  node,
  onUpdate,
}: {
  node: Extract<WorkflowNode, { type: "script" }>;
  onUpdate: Props["onUpdate"];
}) {
  function patch(d: Partial<typeof node.data>) {
    onUpdate(node.id, { ...node, data: { ...node.data, ...d } } as WorkflowNode);
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Shell 脚本</Label>
        <div className="rounded-md border">
          <MonacoEditor
            height="320px"
            language="shell"
            value={node.data.script}
            onChange={(v) => patch({ script: v ?? "" })}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={node.data.noOutput ?? false}
            onChange={(e) => patch({ noOutput: e.target.checked || undefined })}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div>无输出（仅执行副作用）</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              勾上后不产生 <code>/build/{node.name}</code>，也不会出现在
              构建节点的可用源里。常用于调远端 API、写远端系统等不需要喂给模型的步骤。
            </p>
          </div>
        </label>
      </div>

      {!node.data.noOutput && (
        <div className="space-y-2">
          <Label>数据目录（可选）</Label>
          <Input
            value={node.data.outputDir ?? ""}
            onChange={(e) => patch({ outputDir: e.target.value || undefined })}
            placeholder="留空：以整个工作目录为输出；填写：将该子目录作为输出"
          />
          <p className="text-xs text-muted-foreground">
            构建时脚本在临时工作目录执行；结束后这个目录会落到{" "}
            <code>/build/{node.name}/</code>。
          </p>
        </div>
      )}
    </div>
  );
}

function BuildForm({
  node,
  graph,
  onUpdate,
}: {
  node: Extract<WorkflowNode, { type: "build" }>;
  graph: WorkflowGraph;
  onUpdate: Props["onUpdate"];
}) {
  const sources = collectSourcesForBuild(graph, node.id);
  const excluded = node.data.excludedSourceIds ?? [];

  function toggleExcluded(sourceId: string, exclude: boolean) {
    const set = new Set(excluded);
    if (exclude) set.add(sourceId);
    else set.delete(sourceId);
    onUpdate(node.id, {
      ...node,
      data: { ...node.data, excludedSourceIds: Array.from(set) },
    } as WorkflowNode);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>构建源</Label>
        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            还没有上游数据源。把 Git / Text / Script 节点连到构建节点的左侧 handle，
            连上后这里会列出每个源在 <code>/workspace</code> 下的最终路径。
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            构建时这些数据源会先产到 <code>/build/&lt;源名&gt;</code>，再装配到{" "}
            <code>/workspace/&lt;源名&gt;</code>（text 自动加 <code>.md</code>）。
            取消勾选可把某个源从构建产物里排除（源仍会执行，仅不复制到 /workspace）。
          </p>
        )}
        <ul className="space-y-2">
          {sources.map((s) => {
            const variable = `{source.${s.name}.path}`;
            const effective = workspaceOutputPath(s);
            const isExcluded = isSourceExcluded(node, s.id);
            return (
              <li
                key={s.id}
                className={[
                  "rounded-md border p-2",
                  isExcluded ? "opacity-60" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 truncate text-xs">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={(e) => toggleExcluded(s.id, !e.target.checked)}
                      title={
                        isExcluded
                          ? "勾选后将装配到构建产物"
                          : "取消勾选后此源不进入构建产物"
                      }
                    />
                    <span className="truncate">
                      <span className="text-muted-foreground">{s.type}</span>
                      <span className="mx-1">·</span>
                      <span
                        className={[
                          "font-medium",
                          isExcluded ? "line-through" : "",
                        ].join(" ")}
                      >
                        {s.name}
                      </span>
                    </span>
                  </label>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={async () => {
                      await navigator.clipboard.writeText(variable);
                      toast.success(`已复制 ${variable}`);
                    }}
                    aria-label="复制变量名"
                    title={`复制 ${variable} 占位符`}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  源：{nodePath(s)}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {isExcluded ? "× 已排除，不会装配到 /workspace" : `→ ${effective}`}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
