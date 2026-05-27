"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Bot,
  FileText,
  GitBranch,
  MessageSquare,
  Package,
  Terminal,
} from "lucide-react";
import type { ChatGraphNodeType } from "@/lib/dto/chat-graph";
import type { WorkflowNodeType } from "@/lib/dto/workflow";

export type AnyNodeType = WorkflowNodeType | ChatGraphNodeType;

const TYPE_META: Record<
  AnyNodeType,
  { label: string; icon: typeof GitBranch; className: string }
> = {
  git: {
    label: "Git 仓库",
    icon: GitBranch,
    className: "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950",
  },
  text: {
    label: "文本",
    icon: FileText,
    className: "border-amber-500/60 bg-amber-50 dark:bg-amber-950",
  },
  script: {
    label: "脚本",
    icon: Terminal,
    className: "border-sky-500/60 bg-sky-50 dark:bg-sky-950",
  },
  build: {
    label: "构建",
    icon: Package,
    className: "border-violet-500/60 bg-violet-50 dark:bg-violet-950",
  },
  "chat-input": {
    label: "用户输入",
    icon: MessageSquare,
    className: "border-slate-400/60 bg-slate-50 dark:bg-slate-900",
  },
  "chat-model": {
    label: "对话模型",
    icon: Bot,
    className: "border-violet-500/60 bg-violet-50 dark:bg-violet-950",
  },
};

interface CardData {
  type: AnyNodeType;
  name: string;
  selected?: boolean;
  /** 节点上额外信息（如 path 预览 / 模型名） */
  hint?: string;
}

function NodeCard({ data, selected }: NodeProps & { data: CardData }) {
  const meta = TYPE_META[data.type];
  const Icon = meta.icon;
  const hasSourceHandle =
    data.type === "git" ||
    data.type === "text" ||
    data.type === "script" ||
    data.type === "chat-input";
  const hasTargetHandle =
    data.type === "build" ||
    data.type === "script" ||
    data.type === "chat-model";
  return (
    <div
      className={[
        "min-w-[200px] rounded-md border shadow-sm transition",
        meta.className,
        selected ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {meta.label}
        </span>
      </div>
      <div className="px-3 py-2 text-sm font-medium">{data.name}</div>
      {data.hint && (
        <div className="border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          {data.hint}
        </div>
      )}
      {hasSourceHandle && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !bg-foreground"
        />
      )}
      {hasTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !bg-foreground"
        />
      )}
    </div>
  );
}

export const workflowNodeTypes = {
  git: NodeCard,
  text: NodeCard,
  script: NodeCard,
  build: NodeCard,
};

export const chatNodeTypes = {
  "chat-input": NodeCard,
  "chat-model": NodeCard,
};
