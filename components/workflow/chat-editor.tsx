"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatInspector } from "./chat-inspector";
import { chatNodeTypes } from "./nodes";
import {
  CHAT_MODEL_NODE_ID,
  defaultChatGraph,
  ensureChatGraph,
  type ChatGraph,
  type ChatGraphNode,
  type ChatModelNode,
} from "@/lib/dto/chat-graph";
import type { WorkflowGraph } from "@/lib/dto/workflow";
import {
  clearDraft,
  draftKey,
  loadChatDraft,
  saveChatDraft,
} from "@/lib/workflow/draft";
import { projectGetKey, saveChatGraphApi } from "@/utils/projects";

interface Props {
  projectId: string;
  initialChatGraph: ChatGraph;
  /** 用于在右侧 inspector 展示「可引用的数据源」列表 */
  buildGraph: WorkflowGraph;
}

interface ChatNodeData {
  type: ChatGraphNode["type"];
  name: string;
  hint?: string;
  [key: string]: unknown;
}

type XyfNode = Node<ChatNodeData>;

function toXyfNode(n: ChatGraphNode, idx: number): XyfNode {
  return {
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 80 + idx * 320, y: 80 },
    data: { type: n.type, name: n.name },
    draggable: true,
  };
}

export function ChatWorkflowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <ChatEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function ChatEditorInner({ projectId, initialChatGraph, buildGraph }: Props) {
  const initial = useMemo(() => ensureChatGraph(initialChatGraph), [initialChatGraph]);

  const [savedGraph, setSavedGraph] = useState<ChatGraph>(initial);
  const [graph, setGraph] = useState<ChatGraph>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(CHAT_MODEL_NODE_ID);
  const [saving, setSaving] = useState(false);

  const [xnodes, setXnodes] = useState<XyfNode[]>(() =>
    graph.nodes.map((n, i) => toXyfNode(n, i)),
  );
  const xedges = useMemo<Edge[]>(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: true,
      })),
    [graph.edges],
  );

  // mount 后加载草稿
  useEffect(() => {
    const draft = loadChatDraft(projectId);
    if (!draft) return;
    const normalized = ensureChatGraph(draft);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGraph(normalized);
    setXnodes(normalized.nodes.map((n, i) => toXyfNode(n, i)));
  }, [projectId]);

  const isDirty = useMemo(
    () => JSON.stringify(graph) !== JSON.stringify(savedGraph),
    [graph, savedGraph],
  );

  // 写草稿
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDirty) {
      saveChatDraft(projectId, graph);
    } else {
      window.localStorage.removeItem(draftKey(projectId, "chat"));
    }
  }, [graph, isDirty, projectId]);

  // beforeunload 提示
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function onNodesChange(changes: NodeChange<XyfNode>[]) {
    setXnodes((prev) => applyNodeChanges<XyfNode>(changes, prev));
    const positionChanges = changes.filter(
      (c) => c.type === "position" && c.position,
    );
    if (positionChanges.length > 0) {
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n) => {
          const pc = positionChanges.find(
            (c) => c.type === "position" && c.id === n.id,
          );
          if (pc?.type !== "position" || !pc.position) return n;
          return { ...n, position: pc.position } as ChatGraphNode;
        }),
      }));
    }
    for (const c of changes) {
      if (c.type === "select" && c.selected) setSelectedId(c.id);
    }
  }

  function updateModelNode(patch: Partial<ChatModelNode>) {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => {
        if (n.id !== CHAT_MODEL_NODE_ID) return n;
        const merged = { ...n, ...patch } as ChatModelNode;
        return merged;
      }),
    }));
  }

  async function onSave() {
    if (saving) return;
    setSaving(true);
    try {
      await saveChatGraphApi(projectId, graph);
      setSavedGraph(graph);
      clearDraft(projectId, "chat");
      mutate(projectGetKey(projectId));
      toast.success("已保存");
    } catch (err) {
      toast.error(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  function onRevert() {
    if (!isDirty) return;
    if (!confirm("丢弃未保存的对话设置改动？")) return;
    clearDraft(projectId, "chat");
    setGraph(savedGraph);
    setXnodes(savedGraph.nodes.map((n, i) => toXyfNode(n, i)));
  }

  function onAutoLayout() {
    const fresh = defaultChatGraph();
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n, i) => ({ ...n, position: fresh.nodes[i].position })),
    }));
    setXnodes((prev) =>
      prev.map((xn, i) => ({ ...xn, position: fresh.nodes[i].position! })),
    );
  }

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const modelNode =
    selected && selected.type === "chat-model" ? (selected as ChatModelNode) : null;

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="text-xs text-muted-foreground">
            修改对话设置不会触发构建。点击「对话模型」节点配置模型与系统提示词。
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button size="sm" variant="ghost" onClick={onAutoLayout}>
              重置布局
            </Button>
            {isDirty ? (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <Save className="h-3 w-3" />
                未保存
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Save className="h-3 w-3" />
                已保存
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onRevert}
              disabled={!isDirty}
            >
              <Undo2 className="mr-1 h-4 w-4" />
              撤销
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving || !isDirty}>
              <Save className="mr-1 h-4 w-4" />
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
        <div className="relative flex-1">
          <ReactFlow
            nodes={xnodes}
            edges={xedges}
            nodeTypes={chatNodeTypes}
            onNodesChange={onNodesChange}
            onPaneClick={() => setSelectedId(null)}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            fitView
            panOnScroll
            zoomOnScroll={false}
            zoomOnPinch
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>
      <aside className="nokey w-[360px] border-l">
        <ChatInspector
          node={modelNode}
          buildGraph={buildGraph}
          onUpdate={updateModelNode}
        />
      </aside>
    </div>
  );
}
