"use client";

import { Bot, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChatModelNode } from "@/lib/dto/chat-graph";
import {
  isSourceExcluded,
  workspaceOutputPath,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/lib/dto/workflow";
import { collectSourcesForBuild, findBuildNode } from "@/lib/workflow/topology";
import { autoSystemPrompt } from "@/lib/workflow/prompt";

interface Props {
  node: ChatModelNode | null;
  /** 项目的构建 graph，用于展示可引用的数据源 */
  buildGraph: WorkflowGraph;
  onUpdate: (patch: Partial<ChatModelNode>) => void;
}

export function ChatInspector({ node, buildGraph, onUpdate }: Props) {
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <div>点击「对话模型」节点配置</div>
      </div>
    );
  }

  const assembledSources = collectAssembledSources(buildGraph);

  function patchData(d: Partial<ChatModelNode["data"]>) {
    onUpdate({
      data: { ...node!.data, ...d },
    });
  }

  return (
    <div className="nokey flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Badge variant="secondary" className="gap-1">
          <Bot className="h-3 w-3" />
          对话模型
        </Badge>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <Label>可引用的数据源</Label>
          {assembledSources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              当前构建节点还未配置任何数据源的输出目录。到「构建」tab 添加数据源并
              连到构建节点，填写输出目录后，这里会列出可用的源与对应路径。
            </p>
          ) : (
            <ul className="space-y-1">
              {assembledSources.map((s) => {
                const variable = `{source.${s.name}.path}`;
                const real = workspaceOutputPath(s);
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-sm border px-2 py-1.5 text-xs"
                  >
                    <span className="truncate">
                      <span className="font-medium">{s.name}</span>
                      <span className="ml-2 font-mono text-muted-foreground">
                        {real}
                      </span>
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={async () => {
                        await navigator.clipboard.writeText(variable);
                        toast.success(`已复制 ${variable}`);
                      }}
                      aria-label="复制变量名"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>系统提示词</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                patchData({ systemPrompt: autoSystemPrompt(buildGraph) })
              }
            >
              自动填写
            </Button>
          </div>
          <Textarea
            rows={8}
            value={node.data.systemPrompt}
            onChange={(e) => patchData({ systemPrompt: e.target.value })}
            placeholder="可包含 {source.<name>.path} 占位符，运行时会替换为容器内 /workspace/<outputDir> 真实路径。"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1 rounded-sm border bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">模型配置</div>
          <p>
            社区版统一通过环境变量 <code className="font-mono">OPENAI_MODEL</code> /
            <code className="font-mono"> OPENAI_BASE_URL</code> /
            <code className="font-mono"> OPENAI_API_KEY</code> 配置 OpenAI
            兼容服务端。所有项目共用同一份模型设置，不在前端选择。
          </p>
        </div>
      </div>
    </div>
  );
}

function collectAssembledSources(buildGraph: WorkflowGraph): WorkflowNode[] {
  const build = findBuildNode(buildGraph);
  if (!build || build.type !== "build") return [];
  // 连接到 build 且未被排除的源按节点名装配到 /workspace 下
  return collectSourcesForBuild(buildGraph, build.id).filter(
    (s) => !isSourceExcluded(build, s.id),
  );
}
