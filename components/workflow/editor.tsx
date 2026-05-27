"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";
import { nanoid } from "nanoid";
import {
  AlertCircle,
  FileText,
  GitBranch,
  Maximize,
  Package,
  Save,
  Sparkles,
  Terminal,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Inspector } from "./inspector";
import { workflowNodeTypes } from "./nodes";
import {
  hasNodeOutput,
  nodePath,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeType,
} from "@/lib/dto/workflow";
import {
  clearDraft,
  draftKey,
  loadDraft,
  saveDraft,
} from "@/lib/workflow/draft";
import { layoutGraph, nextNodePosition } from "@/lib/workflow/layout";
import { makeUniqueNodeName, validateBuildGraph } from "@/lib/workflow/validate";
import {
  projectGetKey,
  projectsListKey,
  saveGraphApi,
} from "@/utils/projects";

interface Props {
  projectId: string;
  initialGraph: WorkflowGraph;
}

interface NodeCardData {
  type: WorkflowNodeType;
  name: string;
  hint?: string;
  [key: string]: unknown;
}

type XyfNode = Node<NodeCardData>;

function toXyfNode(n: WorkflowNode, idx: number): XyfNode {
  return {
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 80 + idx * 40, y: 80 },
    data: {
      type: n.type,
      name: n.name,
      hint: hasNodeOutput(n) ? nodePath(n) : undefined,
    },
  };
}

function toXyfEdge(e: WorkflowEdge): Edge {
  return { id: e.id, source: e.source, target: e.target, animated: true };
}

export function ProjectWorkflowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorInner({ projectId, initialGraph }: Props) {
  // savedGraph 是"已保存到 server 的 baseline"，用来算 isDirty。
  const normalizedInitial = useMemo<WorkflowGraph>(
    () => ({
      nodes: initialGraph.nodes ?? [],
      edges: initialGraph.edges ?? [],
    }),
    [initialGraph],
  );
  const [savedGraph, setSavedGraph] = useState<WorkflowGraph>(normalizedInitial);

  const [graph, setGraph] = useState<WorkflowGraph>(normalizedInitial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();

  const [xnodes, setXnodes] = useState<XyfNode[]>(() =>
    graph.nodes.map((n, i) => toXyfNode(n, i)),
  );
  const [xedges, setXedges] = useState<Edge[]>(() =>
    graph.edges.map(toXyfEdge),
  );

  // Mount 后一次性加载本地草稿（如有）并覆盖 graph + xnodes + xedges。
  useEffect(() => {
    const draft = loadDraft(projectId);
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGraph(draft);
    setXnodes(draft.nodes.map((n, i) => toXyfNode(n, i)));
    setXedges(draft.edges.map(toXyfEdge));
  }, [projectId]);

  const isDirty = useMemo(() => {
    return JSON.stringify(graph) !== JSON.stringify(savedGraph);
  }, [graph, savedGraph]);

  // graph 变化时同步 localStorage（纯 IO，不触发 setState）
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDirty) {
      saveDraft(projectId, graph);
    } else {
      window.localStorage.removeItem(draftKey(projectId, "build"));
    }
  }, [graph, isDirty, projectId]);

  // 离开页面前如果有未保存草稿，浏览器原生提示
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ─── xyflow 事件 ──────────────────────────────────────────
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
          return { ...n, position: pc.position } as WorkflowNode;
        }),
      }));
    }
    for (const c of changes) {
      if (c.type === "select" && c.selected) setSelectedId(c.id);
      if (c.type === "remove") {
        if (selectedId === c.id) setSelectedId(null);
        setGraph((g) => removeNodeFromGraph(g, c.id));
      }
    }
  }

  function onEdgesChange(changes: EdgeChange[]) {
    setXedges((prev) => applyEdgeChanges(changes, prev));
    setGraph((g) => {
      const next = applyEdgeChanges(changes, xedges);
      return {
        ...g,
        edges: next.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        })),
      };
    });
  }

  function onConnect(conn: Connection) {
    if (!conn.source || !conn.target) return;
    const newId = `e-${nanoid(8)}`;
    const src = conn.source;
    const dst = conn.target;
    setXedges((prev) =>
      addEdge({ ...conn, id: newId, animated: true }, prev),
    );
    setGraph((g) => {
      if (g.edges.some((e) => e.id === newId)) return g;
      if (g.edges.some((e) => e.source === src && e.target === dst)) return g;
      return {
        ...g,
        edges: [...g.edges, { id: newId, source: src, target: dst }],
      };
    });
  }

  // ─── 添加节点 ─────────────────────────────────────────────
  function addNode(type: WorkflowNodeType) {
    if (type === "build" && graph.nodes.some((n) => n.type === "build")) {
      toast.error("每个项目只能有一个构建节点");
      return;
    }
    let fallback = { x: 80, y: 80 };
    const wrapper = wrapperRef.current;
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      fallback = reactFlow.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    }
    const position = nextNodePosition(graph, fallback);
    const name = makeUniqueNodeName(graph, type);
    const newNode = makeNewNode(type, name, position);
    setGraph((g) =>
      g.nodes.some((n) => n.id === newNode.id)
        ? g
        : { ...g, nodes: [...g.nodes, newNode] },
    );
    setXnodes((prev) =>
      prev.some((n) => n.id === newNode.id)
        ? prev
        : [...prev, toXyfNode(newNode, prev.length)],
    );
    setTimeout(() => {
      const { zoom } = reactFlow.getViewport();
      reactFlow.setCenter(position.x + 110, position.y + 50, {
        zoom,
        duration: 300,
      });
    }, 50);
  }

  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === id ? ({ ...n, ...patch } as WorkflowNode) : n,
      ),
    }));
    setXnodes((prev) =>
      prev.map((xn) => {
        if (xn.id !== id) return xn;
        const merged = {
          ...graph.nodes.find((n) => n.id === id),
          ...patch,
        } as WorkflowNode;
        const fresh = toXyfNode(merged, 0);
        return { ...xn, data: fresh.data };
      }),
    );
  }

  function renameNode(id: string, name: string) {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) =>
        n.id === id ? ({ ...n, name } as WorkflowNode) : n,
      ),
    }));
    setXnodes((prev) =>
      prev.map((xn) =>
        xn.id === id
          ? { ...xn, data: { ...(xn.data as NodeCardData), name } }
          : xn,
      ),
    );
  }

  // ─── 工具栏操作 ──────────────────────────────────────────
  async function onSave() {
    if (saving) return;
    setSaving(true);
    try {
      await saveGraphApi(projectId, graph);
      setLastSavedAt(Date.now());
      setSavedGraph(graph);
      clearDraft(projectId, "build");
      mutate(projectsListKey);
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
    if (!confirm("丢弃所有未保存改动，恢复为已存储版本？")) return;
    clearDraft(projectId, "build");
    window.location.reload();
  }

  function onAutoLayout() {
    const next = layoutGraph(graph, { rankdir: "LR" });
    setGraph(next);
    setXnodes((prev) => {
      const byId = new Map(next.nodes.map((n) => [n.id, n.position!]));
      return prev.map((xn) => {
        const pos = byId.get(xn.id);
        return pos ? { ...xn, position: pos } : xn;
      });
    });
    [50, 200, 500].forEach((ms) =>
      setTimeout(() => reactFlow.fitView({ padding: 0.2, duration: 300 }), ms),
    );
  }

  function onFitView() {
    reactFlow.fitView({ padding: 0.2, duration: 300 });
  }

  const selectedNode = selectedId
    ? graph.nodes.find((n) => n.id === selectedId) ?? null
    : null;

  const issues = useMemo(() => validateBuildGraph(graph), [graph]);

  return (
    <div className="flex h-full min-h-0 flex-1" suppressHydrationWarning>
      <div className="flex flex-1 flex-col">
        <Toolbar
          onAdd={addNode}
          onSave={onSave}
          onRevert={onRevert}
          onAutoLayout={onAutoLayout}
          onFitView={onFitView}
          saving={saving}
          dirty={isDirty}
          lastSavedAt={lastSavedAt}
          issuesCount={issues.length}
        />
        <div ref={wrapperRef} className="relative flex-1">
          <ReactFlow
            nodes={xnodes}
            edges={xedges}
            nodeTypes={workflowNodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={() => setSelectedId(null)}
            fitView
            panOnScroll
            zoomOnScroll={false}
            zoomOnPinch
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {issues.length > 0 && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-10">
              <div className="pointer-events-auto max-w-md rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:bg-amber-950 dark:text-amber-100">
                <div className="flex items-center gap-1 font-medium">
                  <AlertCircle className="h-3 w-3" />
                  校验问题 ({issues.length})
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {issues.slice(0, 5).map((iss, i) => (
                    <li key={i}>{iss.message}</li>
                  ))}
                  {issues.length > 5 && (
                    <li className="text-muted-foreground">
                      还有 {issues.length - 5} 条…
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
      <aside className="nokey w-[360px] border-l">
        <Inspector
          node={selectedNode}
          graph={graph}
          onUpdate={updateNode}
          onRename={renameNode}
        />
      </aside>
    </div>
  );
}

function Toolbar({
  onAdd,
  onSave,
  onRevert,
  onAutoLayout,
  onFitView,
  saving,
  dirty,
  lastSavedAt,
  issuesCount,
}: {
  onAdd: (t: WorkflowNodeType) => void;
  onSave: () => void;
  onRevert: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  saving: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  issuesCount: number;
}) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => onAdd("git")}>
          <GitBranch className="mr-1 h-4 w-4" />
          Git
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd("text")}>
          <FileText className="mr-1 h-4 w-4" />
          Text
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd("script")}>
          <Terminal className="mr-1 h-4 w-4" />
          Script
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAdd("build")}>
          <Package className="mr-1 h-4 w-4" />
          构建
        </Button>
        <div className="mx-2 h-5 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={onAutoLayout} title="按 dagre LR 排版">
          <Sparkles className="mr-1 h-4 w-4" />
          整理节点
        </Button>
        <Button size="sm" variant="outline" onClick={onFitView} title="适应画布">
          <Maximize className="mr-1 h-4 w-4" />
          适应画布
        </Button>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {issuesCount > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <AlertCircle className="h-3 w-3" />
            {issuesCount} 个校验问题
          </span>
        )}
        {dirty ? (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <Save className="h-3 w-3" />
            未保存（本地草稿）
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Save className="h-3 w-3" />
            {lastSavedAt
              ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString()}`
              : "已保存"}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onRevert}
          disabled={!dirty}
          title="丢弃本地草稿，恢复为已存储版本"
        >
          <Undo2 className="mr-1 h-4 w-4" />
          恢复
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !dirty}
          title="保存到服务器"
        >
          <Save className="mr-1 h-4 w-4" />
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}

function makeNewNode(
  type: WorkflowNodeType,
  name: string,
  position: { x: number; y: number },
): WorkflowNode {
  const id = `n-${nanoid(8)}`;
  switch (type) {
    case "git":
      return {
        id,
        type: "git",
        name,
        position,
        data: { url: "", ref: "main" },
      };
    case "text":
      return {
        id,
        type: "text",
        name,
        position,
        data: { content: "" },
      };
    case "script":
      return {
        id,
        type: "script",
        name,
        position,
        data: { script: "#!/usr/bin/env bash\nset -euo pipefail\n" },
      };
    case "build":
      return {
        id,
        type: "build",
        name,
        position,
        data: { excludedSourceIds: [] },
      };
  }
}

function removeNodeFromGraph(g: WorkflowGraph, removedId: string): WorkflowGraph {
  return {
    nodes: g.nodes
      .filter((n) => n.id !== removedId)
      .map((n) => {
        if (n.type !== "build") return n;
        // 同步清理被删源在 build.excludedSourceIds 里的悬空引用
        const ex = n.data.excludedSourceIds ?? [];
        if (!ex.includes(removedId)) return n;
        return {
          ...n,
          data: {
            ...n.data,
            excludedSourceIds: ex.filter((id) => id !== removedId),
          },
        } as WorkflowNode;
      }),
    edges: g.edges.filter(
      (e) => e.source !== removedId && e.target !== removedId,
    ),
  };
}
