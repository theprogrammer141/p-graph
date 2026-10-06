"use client";

import "@xyflow/react/dist/style.css";

import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { colorOf, extensionOf } from "@/lib/file-categories";
import {
  buildCanvas,
  rowOfHandle,
  handleIn,
  handleOut,
  foldedMeta,
  HEADER_H,
  ROW_H,
  type CanvasEdge,
  type CanvasNode,
  type Prepared,
} from "@/lib/graph/layout";
import type { Edge, FileNode } from "@/parser/types";
import type { SelectionTarget } from "./workspace-shell";

interface Lit {
  /** Nothing selected: everything at full strength. */
  all: boolean;
  nodes: Set<string>;
  rows: Set<string>;
}

const rowKey = (node: string, row: string) => `${node}\u0000${row}`;

interface Actions {
  open: (id: string) => void;
  close: (id: string) => void;
  selectFile: (path: string) => void;
  selectFolder: (dir: string) => void;
  hover: (target: string | null) => void;
}
const ActionsContext = createContext<Actions | null>(null);
function useActions(): Actions {
  const a = useContext(ActionsContext);
  if (!a) throw new Error("graph node rendered outside GraphCanvas");
  return a;
}

type NodeData = {
  model: CanvasNode;
  lit: Lit;
  selection: SelectionTarget;
  hoveredTarget: string | null;
  groupOf: ReadonlyMap<string, string>;
  selectedCategory: string | null;
};
type FoldedFlowNode = FlowNode<NodeData, "folded">;
type PanelFlowNode = FlowNode<NodeData, "panel">;

function Counts({
  model,
  selectedCategory,
  matchCount,
}: {
  model: CanvasNode;
  selectedCategory: string | null;
  matchCount: number;
}) {
  if (selectedCategory) {
    return (
      <span className="font-mono text-[10px] tabular-nums whitespace-nowrap flex items-center gap-2">
        <span className="text-(--pg-accent) font-semibold">
          {matchCount} matched
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          ({model.fileCount} total)
        </span>
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
      {model.fileCount} files{"  "}
      <span style={{ color: "var(--pg-in)" }}>in {model.stats.fanIn}</span>{"  "}
      <span style={{ color: "var(--pg-out)" }}>out {model.stats.fanOut}</span>
    </span>
  );
}

const FoldedNode = memo(function FoldedNode({ data }: NodeProps<FoldedFlowNode>) {
  const { open, hover } = useActions();
  const { model, lit, selection, hoveredTarget, groupOf, selectedCategory } = data;
  const matchCount = selectedCategory ? (model.categoryCounts.get(selectedCategory) ?? 0) : 0;
  const categoryMatch = selectedCategory ? matchCount > 0 : true;

  const isSelected = selection?.kind === "folder" && selection.dir === model.id;
  const isHovered =
    hoveredTarget === model.id ||
    (hoveredTarget ? groupOf.get(hoveredTarget) === model.id : false);
  const isLit = (lit.all || isSelected || isHovered || lit.nodes.has(model.id)) && categoryMatch;

  return (
    <div
      onClick={() => open(model.id)}
      onMouseEnter={() => hover(model.id)}
      onMouseLeave={() => hover(null)}
      title={`${model.id}\n${model.fileCount} files · in ${model.stats.fanIn} · out ${model.stats.fanOut}${
        selectedCategory ? `\n${matchCount} matching ${selectedCategory}` : ""
      }`}
      style={{ width: model.width, height: model.height, opacity: isLit ? 1 : 0.25 }}
      className={`pointer-events-auto flex flex-col justify-center px-2.5 rounded-xs border bg-white dark:bg-zinc-900 cursor-pointer transition-[border-color,box-shadow,opacity] ${
        isSelected
          ? "border-(--pg-accent) ring-1 ring-(--pg-accent)"
          : isHovered
          ? "border-(--pg-accent) ring-2 ring-(--pg-accent)/50 shadow-xs"
          : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 dark:hover:border-zinc-500"
      }`}
    >
      <Handle type="target" position={Position.Left} id={handleIn()} className="pg-handle" isConnectable={false} />
      <span className="font-mono text-[11px] leading-tight font-medium text-zinc-900 dark:text-zinc-100 truncate">{model.label}</span>
      <span className="font-mono text-[10px] leading-tight tabular-nums text-zinc-500 dark:text-zinc-400">
        {selectedCategory ? `${matchCount} of ${model.fileCount} files` : foldedMeta(model.fileCount)}
      </span>
      <Handle type="source" position={Position.Right} id={handleOut()} className="pg-handle" isConnectable={false} />
    </div>
  );
});

const PanelNode = memo(function PanelNode({ data }: NodeProps<PanelFlowNode>) {
  const { close, selectFile, hover } = useActions();
  const updateNodeInternals = useUpdateNodeInternals();
  const [scrollTop, setScrollTop] = useState(0);
  const { model, lit, selection, hoveredTarget, selectedCategory } = data;
  const matchCount = selectedCategory ? (model.categoryCounts.get(selectedCategory) ?? 0) : 0;
  const categoryMatch = selectedCategory ? matchCount > 0 : true;

  const isSelectedFolder = selection?.kind === "folder" && selection.dir === model.id;
  const isSelectedFileInFolder = selection?.kind === "file" && model.rows.some((r) => r.id === selection.path);
  const isHoveredNode = hoveredTarget === model.id;
  const hasLitRow = model.rows.some((r) => lit.rows.has(rowKey(model.id, r.id)));
  const panelLit =
    (lit.all || isSelectedFolder || isSelectedFileInFolder || isHoveredNode || lit.nodes.has(model.id) || hasLitRow) &&
    categoryMatch;

  const visibleHeight = model.height - HEADER_H - 4;
  const visibleRows = Math.max(1, Math.floor(visibleHeight / ROW_H));

  useLayoutEffect(() => {
    updateNodeInternals(model.id);
  }, [scrollTop, model.id, updateNodeInternals]);

  return (
    <div
      style={{ width: model.width, height: model.height, opacity: panelLit ? 1 : 0.25 }}
      className={`pointer-events-auto rounded-xs border bg-white dark:bg-zinc-900 overflow-hidden flex flex-col transition-[border-color,box-shadow,opacity] ${
        isSelectedFolder
          ? "border-(--pg-accent) ring-1 ring-(--pg-accent)"
          : isHoveredNode
          ? "border-(--pg-accent) ring-1 ring-(--pg-accent)/50"
          : "border-zinc-400 dark:border-zinc-600"
      }`}
    >
      <button
        type="button"
        onClick={() => close(model.id)}
        onMouseEnter={() => hover(model.id)}
        onMouseLeave={() => hover(null)}
        title={`${model.id} — click to close`}
        style={{ height: HEADER_H }}
        className="shrink-0 w-full flex items-center justify-between gap-3 px-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
      >
        <span className="font-mono text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{model.label}</span>
        <Counts model={model} selectedCategory={selectedCategory} matchCount={matchCount} />
      </button>
      <div
        className="nowheel nodrag flex-1 overflow-y-auto overflow-x-hidden min-h-0 select-none scrollbar-thin"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        {model.rows.map((row, i) => {
          const key = rowKey(model.id, row.id);
          const isSelectedRow = selection?.kind === "file" && selection.path === row.id;
          const isRowHovered = hoveredTarget === row.id;
          const rowMatchesCat = selectedCategory && row.kind === "file" ? extensionOf(row.path) === selectedCategory : true;
          const isRowLit =
            (lit.all || isSelectedFolder || isSelectedRow || isRowHovered || lit.rows.has(key)) && rowMatchesCat;
          const rowTop = i * ROW_H - scrollTop;
          const clampedRowTop = Math.max(0, Math.min((visibleRows - 1) * ROW_H, rowTop));
          const handleTranslateY = clampedRowTop - rowTop;

          return (
            <div
              key={row.id}
              style={{ height: ROW_H, opacity: isRowLit ? 1 : 0.25 }}
              onClick={(e) => {
                if (row.kind !== "file") return;
                e.stopPropagation();
                selectFile(row.id);
              }}
              onMouseEnter={() => {
                if (row.kind === "file") hover(row.id);
              }}
              onMouseLeave={() => {
                if (row.kind === "file") hover(null);
              }}
              className={`relative flex items-center gap-1.5 px-2.5 font-mono text-[11px] shrink-0 transition-colors ${
                row.kind === "file" ? "cursor-pointer" : ""
              } ${
                isSelectedRow
                  ? "bg-(--pg-accent)/10 text-zinc-900 dark:text-zinc-100 font-medium ring-1 ring-(--pg-accent)"
                  : isRowHovered
                  ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 font-medium ring-1 ring-(--pg-accent)"
                  : row.kind === "file"
                  ? "hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={handleIn(row.id)}
                className="pg-handle"
                isConnectable={false}
                style={{ transform: handleTranslateY ? `translateY(${handleTranslateY}px)` : undefined }}
              />
              {row.kind === "file" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-xs shrink-0" style={{ backgroundColor: colorOf(extensionOf(row.path)) }} />
                  <span className="truncate flex-1" title={row.path}>{row.label}</span>
                  <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500" title="files that import this one">
                    {row.fanIn}
                  </span>
                </>
              ) : (
                <span className="text-zinc-400 dark:text-zinc-500">+{row.count} more</span>
              )}
              <Handle
                type="source"
                position={Position.Right}
                id={handleOut(row.id)}
                className="pg-handle"
                isConnectable={false}
                style={{ transform: handleTranslateY ? `translateY(${handleTranslateY}px)` : undefined }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

const nodeTypes = { folded: FoldedNode, panel: PanelNode };

/** Which end of an edge, if either, touches the selection. */
function sideOf(
  e: CanvasEdge,
  sel: SelectionTarget,
  groupOf: ReadonlyMap<string, string>
): { source: boolean; target: boolean } {
  if (!sel) return { source: false, target: false };
  if (sel.kind === "folder") {
    return { source: e.source === sel.dir, target: e.target === sel.dir };
  }
  const group = groupOf.get(sel.path) ?? ".";
  return {
    source: e.source === group && rowOfHandle(e.sourceHandle) === sel.path,
    target: e.target === group && rowOfHandle(e.targetHandle) === sel.path,
  };
}

function computeLit(
  edges: CanvasEdge[],
  sel: SelectionTarget,
  groupOf: ReadonlyMap<string, string>
): Lit {
  const lit: Lit = { all: sel === null, nodes: new Set(), rows: new Set() };
  if (!sel) return lit;

  if (sel.kind === "folder") {
    lit.nodes.add(sel.dir);
    for (const e of edges) {
      if (e.source === sel.dir) {
        const row = rowOfHandle(e.targetHandle);
        if (row === null) lit.nodes.add(e.target);
        else lit.rows.add(rowKey(e.target, row));
      }
      if (e.target === sel.dir) {
        const row = rowOfHandle(e.sourceHandle);
        if (row === null) lit.nodes.add(e.source);
        else lit.rows.add(rowKey(e.source, row));
      }
    }
  } else if (sel.kind === "file") {
    const group = groupOf.get(sel.path) ?? ".";
    lit.rows.add(rowKey(group, sel.path));

    for (const e of edges) {
      const sourceRow = rowOfHandle(e.sourceHandle);
      const targetRow = rowOfHandle(e.targetHandle);

      const isSource = e.source === group && sourceRow === sel.path;
      const isTarget = e.target === group && targetRow === sel.path;

      if (isSource) {
        if (targetRow === null) lit.nodes.add(e.target);
        else lit.rows.add(rowKey(e.target, targetRow));
      }
      if (isTarget) {
        if (sourceRow === null) lit.nodes.add(e.source);
        else lit.rows.add(rowKey(e.source, sourceRow));
      }
    }
  }

  return lit;
}

interface CanvasProps {
  files: readonly FileNode[];
  edges: readonly Edge[];
  prepared: Prepared;
  open: ReadonlySet<string>;
  openCount: number;
  selection: SelectionTarget;
  hoveredTarget: string | null;
  selectedCategory?: string | null;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onSelectFile: (path: string) => void;
  onSelectFolder: (dir: string) => void;
  onDeselect: () => void;
  onHover: (target: string | null) => void;
}

function Canvas({
  edges,
  prepared,
  open,
  openCount,
  selection,
  hoveredTarget,
  selectedCategory,
  onOpen,
  onClose,
  onSelectFile,
  onSelectFolder,
  onDeselect,
  onHover,
}: CanvasProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const flow = useReactFlow();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const canvas = useMemo(() => buildCanvas(prepared, edges, open), [prepared, edges, open]);
  const lit = useMemo(() => computeLit(canvas.edges, selection, prepared.fold.groupOf), [canvas.edges, selection, prepared.fold.groupOf]);

  const actions = useMemo<Actions>(
    () => ({
      open: onOpen,
      close: onClose,
      selectFile: onSelectFile,
      selectFolder: onSelectFolder,
      hover: onHover,
    }),
    [onOpen, onClose, onSelectFile, onSelectFolder, onHover],
  );

  // Runs after the render that carries the new panel, so the fit reads the
  // opened state, not the one before it. maxZoom pinned to current zoom means
  // refit can only ever zoom out.
  useEffect(() => {
    if (openCount === 0) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.06, maxZoom: flow.getZoom(), duration: 150 });
    });
    return () => cancelAnimationFrame(frame);
  }, [openCount, flow]);

  const flowNodes = useMemo<(FoldedFlowNode | PanelFlowNode)[]>(
    () =>
      canvas.nodes.map((n) => {
        const isSelected =
          (selection?.kind === "folder" && selection.dir === n.id) ||
          (selection?.kind === "file" && (prepared.fold.groupOf.get(selection.path) ?? ".") === n.id);
        const zIndex = n.open ? (isSelected ? 30 : 20) : isSelected ? 5 : 2;
        return {
          id: n.id,
          type: n.open ? "panel" : "folded",
          position: { x: n.x, y: n.y },
          width: n.width,
          height: n.height,
          zIndex,
          data: {
            model: n,
            lit,
            selection,
            hoveredTarget,
            groupOf: prepared.fold.groupOf,
            selectedCategory: selectedCategory ?? null,
          },
        };
      }),
    [canvas.nodes, lit, selection, hoveredTarget, prepared.fold.groupOf, selectedCategory],
  );

  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      canvas.edges.map((e) => {
        const side = selection ? sideOf(e, selection, prepared.fold.groupOf) : { source: false, target: false };
        const touching = side.source || side.target;

        // Check if this edge connects the selected file to the hovered neighbour
        let connectsHover = false;
        if (selection?.kind === "file" && hoveredTarget) {
          const sRow = rowOfHandle(e.sourceHandle);
          const tRow = rowOfHandle(e.targetHandle);
          const sMatch = e.source === hoveredTarget || sRow === hoveredTarget;
          const tMatch = e.target === hoveredTarget || tRow === hoveredTarget;
          if ((side.source && tMatch) || (side.target && sMatch)) {
            connectsHover = true;
          }
        }

        let categoryDim = false;
        if (selectedCategory) {
          const sRow = rowOfHandle(e.sourceHandle);
          const tRow = rowOfHandle(e.targetHandle);
          const sExt = sRow ? extensionOf(sRow) : null;
          const tExt = tRow ? extensionOf(tRow) : null;
          if (sExt !== selectedCategory && tExt !== selectedCategory) {
            categoryDim = true;
          }
        }

        const stroke = connectsHover
          ? "var(--pg-accent)"
          : side.target && !side.source
          ? "var(--pg-in)"
          : side.source && !side.target
          ? "var(--pg-out)"
          : "var(--pg-edge)";

        const strokeWidth = connectsHover
          ? 2.5
          : Math.min(2, 0.75 + Math.log2(e.count) * 0.3);

        const opacity = connectsHover
          ? 1
          : categoryDim
          ? 0.08
          : selection === null || touching
          ? 1
          : 0.12;

        const zIndex = connectsHover ? 3 : touching ? 2 : 1;

        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
          focusable: false,
          zIndex,
          style: {
            stroke,
            strokeWidth,
            opacity,
          },
        };
      }),
    [canvas.edges, selection, hoveredTarget, prepared.fold.groupOf, selectedCategory],
  );

  const { fold: folded, undrawnEdges } = prepared;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="h-6 shrink-0 px-3 flex items-center gap-3 border-b border-zinc-200 dark:border-zinc-800 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
        <span className="tabular-nums">
          {folded.groups.length} nodes · folders under {folded.threshold} files fold into their parent
        </span>
        {folded.unplaced.length > 0 && (
          <span className="tabular-nums" title="The top-level folder has no parent to fold into, so a single file there gets no node.">
            · {folded.unplaced.length} not on map: {folded.unplaced.join(", ")}
            {undrawnEdges > 0 && ` (${undrawnEdges} edges not drawn)`}
          </span>
        )}
      </div>
      <div className="flex-1 relative">
        <ActionsContext.Provider value={actions}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onPaneClick={onDeselect}
            fitView
            fitViewOptions={{ padding: 0.04, maxZoom: 1 }}
            minZoom={0.1}
            maxZoom={2}
          >
            <Controls showInteractive={false} />
          </ReactFlow>
        </ActionsContext.Provider>
      </div>
    </div>
  );
}

export interface GraphCanvasProps {
  files: readonly FileNode[];
  edges: readonly Edge[];
  prepared: Prepared;
  open: ReadonlySet<string>;
  openCount: number;
  selection: SelectionTarget;
  hoveredTarget: string | null;
  selectedCategory?: string | null;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
  onSelectFile: (path: string) => void;
  onSelectFolder: (dir: string) => void;
  onDeselect: () => void;
  onHover: (target: string | null) => void;
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
