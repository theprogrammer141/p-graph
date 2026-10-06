"use client";

import React, { useMemo, useState } from "react";
import type { CategorySummary } from "@/lib/file-categories";
import type { Edge, FileNode } from "@/parser/types";
import { prepare } from "@/lib/graph/layout";
import {
  buildFileDetail,
  buildFolderDetail,
  buildRepoSummary,
} from "@/lib/graph/detail";
import { buildInsights } from "@/lib/graph/maths";
import { GraphCanvas } from "./graph-canvas";
import { DetailPane } from "./detail-pane";

export type SelectionTarget =
  | { kind: "file"; path: string }
  | { kind: "folder"; dir: string }
  | null;

interface WorkspaceShellProps {
  categories: CategorySummary[];
  totalFiles: number;
  files: readonly FileNode[];
  edges: readonly Edge[];
  repoName?: string;
  adapter?: string;
  edgeCount?: number;
}

export function WorkspaceShell({
  categories,
  totalFiles,
  files,
  edges,
  repoName = "preact",
  adapter = "none",
  edgeCount,
}: WorkspaceShellProps) {
  const [selection, setSelection] = useState<SelectionTarget>(null);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"structure" | "explanation">("structure");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [openCount, setOpenCount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const prepared = useMemo(() => prepare(files, edges), [files, edges]);
  const filesByPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  const repoSummary = useMemo(
    () => buildRepoSummary(files, edges, { repoName, adapter }),
    [files, edges, repoName, adapter],
  );

  const insights = useMemo(() => buildInsights(files, edges), [files, edges]);

  const fileDetail = useMemo(
    () =>
      selection?.kind === "file"
        ? buildFileDetail(selection.path, filesByPath, edges)
        : null,
    [selection, filesByPath, edges],
  );

  const folderDetail = useMemo(() => {
    if (selection?.kind !== "folder") return null;
    const group = prepared.fold.groups.find((g) => g.dir === selection.dir);
    const folderFiles = group
      ? group.files.map((p) => filesByPath.get(p)!).filter(Boolean)
      : [];
    const stats = prepared.stats.get(selection.dir);
    return buildFolderDetail(selection.dir, folderFiles, stats);
  }, [selection, prepared, filesByPath]);

  const handleOpen = (id: string) => {
    setOpen((prev) => new Set(prev).add(id));
    setSelection({ kind: "folder", dir: id });
    setOpenCount((n) => n + 1);
  };

  const handleClose = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSelection({ kind: "folder", dir: id });
  };

  const handleSelectFile = (path: string) => {
    const folder = prepared.fold.groupOf.get(path);
    if (folder && !open.has(folder)) {
      setOpen((prev) => new Set(prev).add(folder));
      setOpenCount((n) => n + 1);
    }
    setSelection({ kind: "file", path });
  };

  const handleSelectFolder = (dir: string) => {
    setSelection({ kind: "folder", dir });
  };

  const handleDeselect = () => {
    setSelection(null);
  };

  const handleHover = (target: string | null) => {
    setHoveredTarget(target);
  };

  const handleToggleCategory = (ext: string) => {
    setSelectedCategory((prev) => (prev === ext ? null : ext));
  };

  return (
    <div className="flex-1 w-full h-[calc(100vh-2.75rem)] flex overflow-hidden bg-background text-foreground text-xs select-none">
      {/* Left rail: narrow column listing categories of file */}
      <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950 flex flex-col overflow-hidden">
        <div className="px-3 h-9 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium">
            Categories
          </span>
          {selectedCategory ? (
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="font-mono text-[10px] text-(--pg-accent) hover:underline cursor-pointer"
            >
              Reset
            </button>
          ) : (
            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
              {totalFiles} files
            </span>
          )}
        </div>

        <div className="p-2 space-y-0.5 overflow-y-auto flex-1">
          {categories.map((cat) => {
            const isCatActive = selectedCategory === cat.extension;
            return (
              <button
                type="button"
                key={cat.extension}
                onClick={() => handleToggleCategory(cat.extension)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-xs text-xs font-mono cursor-pointer transition-colors ${
                  isCatActive
                    ? "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 font-medium ring-1 ring-(--pg-accent)"
                    : selectedCategory
                    ? "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: cat.colorHex }}
                  />
                  <span className="truncate">{cat.extension}</span>
                </div>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums ml-2 shrink-0">
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Middle column: canvas / map filling the middle */}
      <main className="flex-1 relative overflow-hidden bg-white dark:bg-zinc-950 flex flex-col">
        <div className="px-3 h-9 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/40 dark:bg-zinc-900/20">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {repoName}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-zinc-400 dark:text-zinc-500">canvas</span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
            {edgeCount !== undefined && (
              <div>
                <span className="tabular-nums">{edgeCount}</span> edges
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <GraphCanvas
            files={files}
            edges={edges}
            prepared={prepared}
            open={open}
            openCount={openCount}
            selection={selection}
            hoveredTarget={hoveredTarget}
            selectedCategory={selectedCategory}
            onOpen={handleOpen}
            onClose={handleClose}
            onSelectFile={handleSelectFile}
            onSelectFolder={handleSelectFolder}
            onDeselect={handleDeselect}
            onHover={handleHover}
          />
        </div>
      </main>

      {/* Right column: detail pane */}
      <DetailPane
        selection={selection}
        repoSummary={repoSummary}
        fileDetail={fileDetail}
        folderDetail={folderDetail}
        insights={insights}
        edges={edges}
        activeTab={activeTab}
        hoveredTarget={hoveredTarget}
        groupOfFile={(p) => prepared.fold.groupOf.get(p)}
        onTabChange={setActiveTab}
        onSelectFile={handleSelectFile}
        onDeselect={handleDeselect}
        onHover={handleHover}
      />
    </div>
  );
}
