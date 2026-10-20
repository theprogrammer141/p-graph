import React, { useMemo, useState } from "react";
import type { FileDetail } from "@/lib/graph/detail";
import type { Edge } from "@/parser/types";
import { colorOf, extensionOf } from "@/lib/file-categories";
import { transitiveWalk } from "@/lib/graph/maths";
import { classifyFileRoleAction } from "@/app/actions/ai";
import { SpotlightCard } from "@/app/components/ui/spotlight-card";
import { CountUp } from "@/app/components/ui/count-up";
import { ClickSpark } from "@/app/components/ui/click-spark";
import { MethodBadge } from "./method-badge";
import type { RouteItem } from "./repo-summary-view";

export function FileDetailView({
  analysisId,
  detail,
  edges,
  routes = [],
  isFileHovered,
  onSelectFile,
  onHover,
  onRoleAssigned,
  onTabChange,
}: {
  analysisId?: string;
  detail: FileDetail;
  edges: readonly Edge[];
  routes?: readonly RouteItem[];
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
  onRoleAssigned?: (filePath: string, role: string) => void;
  onTabChange?: (tab: "structure" | "explanation") => void;
}) {
  const [classifyingRole, setClassifyingRole] = useState(false);
  const [transitiveMode, setTransitiveMode] = useState<
    "blast-radius" | "dependency-chain" | null
  >(null);

  const blastRadiusItems = useMemo(
    () => transitiveWalk(detail.path, edges, "blast-radius", 2),
    [detail.path, edges]
  );

  const depChainItems = useMemo(
    () => transitiveWalk(detail.path, edges, "dependency-chain", 2),
    [detail.path, edges]
  );

  const fileRoutes = useMemo(
    () => routes.filter((r) => r.filePath === detail.path),
    [routes, detail.path]
  );

  const handleAssignRole = async () => {
    if (!analysisId) return;
    setClassifyingRole(true);
    try {
      const res = await classifyFileRoleAction({
        analysisId,
        filePath: detail.path,
      });
      if (res.ok && res.role && onRoleAssigned) {
        onRoleAssigned(detail.path, res.role);
      }
    } catch (err) {
      console.error("Failed to assign role:", err);
    } finally {
      setClassifyingRole(false);
    }
  };

  return (
    <div data-testid="file-detail-view" className="flex flex-col gap-3 p-3">
      {/* File header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div
          data-testid="file-detail-path"
          className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-all select-text"
        >
          {detail.path}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <span className="px-1.5 py-0.5 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
            {detail.kind}
          </span>
          {(!detail.kind ||
            detail.kind === "Generic" ||
            detail.kind === "Unidentified") &&
            onRoleAssigned && (
              <button
                type="button"
                onClick={handleAssignRole}
                disabled={classifyingRole}
                className="px-1.5 py-0.5 rounded-xs border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-(--pg-accent) hover:border-(--pg-accent) cursor-pointer"
              >
                {classifyingRole ? "Classifying..." : "Assign role (AI)"}
              </button>
            )}
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
            <span
              className="w-1.5 h-1.5 rounded-xs"
              style={{ backgroundColor: detail.colorHex }}
            />
            {detail.extension}
          </span>
          <span className="text-zinc-500 tabular-nums">
            {detail.lines} lines
          </span>

          {onTabChange && (
            <ClickSpark sparkColor="#3b82f6" sparkRadius={16} sparkCount={8} className="ml-auto">
              <button
                type="button"
                onClick={() => onTabChange("explanation")}
                className="px-1.5 py-0.5 rounded-xs bg-(--pg-accent)/10 text-(--pg-accent) font-medium hover:bg-(--pg-accent)/20 cursor-pointer active:scale-95 transition-transform"
              >
                Explain →
              </button>
            </ClickSpark>
          )}
        </div>
      </div>

      {/* Declared routes if any */}
      {fileRoutes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
              Declared routes
            </span>
            <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
              {fileRoutes.length}
            </span>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-[11px]">
            {fileRoutes.map((r, i) => (
              <div key={i} className="px-2 py-1.5 flex items-center gap-2">
                <MethodBadge method={r.method} />
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {r.path}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fan metrics */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <SpotlightCard className="p-2 bg-white dark:bg-zinc-900/60" spotlightSize={180}>
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">
            Depends on
          </div>
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--pg-out)" }}
          >
            <CountUp to={detail.dependsOnCount} duration={500} />
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-2 bg-white dark:bg-zinc-900/60" spotlightSize={180}>
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">
            Depended on by
          </div>
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--pg-in)" }}
          >
            <CountUp to={detail.dependedOnCount} duration={500} />
          </div>
        </SpotlightCard>
      </div>

      {/* Transitive walk buttons: Blast radius and Dependency chain */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <button
          type="button"
          onClick={() =>
            setTransitiveMode((prev) =>
              prev === "blast-radius" ? null : "blast-radius"
            )
          }
          title="Everything that breaks if this file changes (2 levels deep)"
          className={`px-2 py-1.5 rounded-xs border font-medium flex items-center justify-between cursor-pointer transition-colors ${
            transitiveMode === "blast-radius"
              ? "bg-(--pg-in)/15 border-(--pg-in) text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-in)"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          }`}
        >
          <span>Blast radius</span>
          <span
            className="text-[10px] tabular-nums font-semibold"
            style={{ color: "var(--pg-in)" }}
          >
            {blastRadiusItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setTransitiveMode((prev) =>
              prev === "dependency-chain" ? null : "dependency-chain"
            )
          }
          title="Everything this file needs (2 levels deep)"
          className={`px-2 py-1.5 rounded-xs border font-medium flex items-center justify-between cursor-pointer transition-colors ${
            transitiveMode === "dependency-chain"
              ? "bg-(--pg-out)/15 border-(--pg-out) text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-out)"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          }`}
        >
          <span>Dep chain</span>
          <span
            className="text-[10px] tabular-nums font-semibold"
            style={{ color: "var(--pg-out)" }}
          >
            {depChainItems.length}
          </span>
        </button>
      </div>

      {/* Conditional transitive view or direct dependencies view */}
      {transitiveMode === "blast-radius" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-mono">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--pg-in)" }}
              >
                Blast radius
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                (2 levels · {blastRadiusItems.length} files)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTransitiveMode(null)}
              className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              ✕ Direct
            </button>
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
            Everything that breaks if this file changes
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-72 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {blastRadiusItems.length === 0 ? (
              <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                Nothing in the repository depends on this file
              </div>
            ) : (
              blastRadiusItems.map((item) => {
                const isHovered = isFileHovered(item.path);
                const ext = extensionOf(item.path);
                return (
                  <div
                    key={item.path}
                    onClick={() => onSelectFile(item.path)}
                    onMouseEnter={() => onHover(item.path)}
                    onMouseLeave={() => onHover(null)}
                    title={`${item.path} · ${item.depth === 1 ? "direct dependent" : "indirect dependent (2 hops)"}`}
                    className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                      isHovered
                        ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className="w-1.5 h-1.5 rounded-xs shrink-0"
                        style={{ backgroundColor: colorOf(ext) }}
                      />
                      <span className="truncate">{item.path}</span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] tabular-nums px-1 py-0.2 rounded-xs font-medium"
                      style={{
                        backgroundColor:
                          item.depth === 1
                            ? "rgba(16, 185, 129, 0.15)"
                            : "rgba(16, 185, 129, 0.08)",
                        color: "var(--pg-in)",
                      }}
                    >
                      {item.depth === 1 ? "1 hop" : "2 hops"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : transitiveMode === "dependency-chain" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-mono">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--pg-out)" }}
              >
                Dependency chain
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                (2 levels · {depChainItems.length} files)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTransitiveMode(null)}
              className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              ✕ Direct
            </button>
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
            Everything this file needs
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-72 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {depChainItems.length === 0 ? (
              <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                Imports no files inside the repository
              </div>
            ) : (
              depChainItems.map((item) => {
                const isHovered = isFileHovered(item.path);
                const ext = extensionOf(item.path);
                return (
                  <div
                    key={item.path}
                    onClick={() => onSelectFile(item.path)}
                    onMouseEnter={() => onHover(item.path)}
                    onMouseLeave={() => onHover(null)}
                    title={`${item.path} · ${item.depth === 1 ? "direct dependency" : "indirect dependency (2 hops)"}`}
                    className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                      isHovered
                        ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className="w-1.5 h-1.5 rounded-xs shrink-0"
                        style={{ backgroundColor: colorOf(ext) }}
                      />
                      <span className="truncate">{item.path}</span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] tabular-nums px-1 py-0.2 rounded-xs font-medium"
                      style={{
                        backgroundColor:
                          item.depth === 1
                            ? "rgba(245, 158, 11, 0.15)"
                            : "rgba(245, 158, 11, 0.08)",
                        color: "var(--pg-out)",
                      }}
                    >
                      {item.depth === 1 ? "1 hop" : "2 hops"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Dependencies list: what this file imports */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Depends on
              </span>
              <span
                className="text-[10px] tabular-nums font-medium"
                style={{ color: "var(--pg-out)" }}
              >
                {detail.dependsOnCount}
              </span>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-44 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {detail.dependencies.length === 0 ? (
                <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                  Imports no files inside the repository
                </div>
              ) : (
                detail.dependencies.map((dep) => {
                  const isHovered = isFileHovered(dep.path);
                  return (
                    <div
                      key={dep.path}
                      onClick={() => onSelectFile(dep.path)}
                      onMouseEnter={() => onHover(dep.path)}
                      onMouseLeave={() => onHover(null)}
                      title={`${dep.path} · ${dep.lines} lines · click to select`}
                      className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                        isHovered
                          ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className="w-1.5 h-1.5 rounded-xs shrink-0"
                          style={{ backgroundColor: dep.colorHex }}
                        />
                        <span className="truncate">{dep.path}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                        {dep.lines}L
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Dependents list: files that import this file */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Depended on by
              </span>
              <span
                className="text-[10px] tabular-nums font-medium"
                style={{ color: "var(--pg-in)" }}
              >
                {detail.dependedOnCount}
              </span>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-44 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {detail.dependents.length === 0 ? (
                <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                  Imported by no other files
                </div>
              ) : (
                detail.dependents.map((dep) => {
                  const isHovered = isFileHovered(dep.path);
                  return (
                    <div
                      key={dep.path}
                      onClick={() => onSelectFile(dep.path)}
                      onMouseEnter={() => onHover(dep.path)}
                      onMouseLeave={() => onHover(null)}
                      title={`${dep.path} · ${dep.lines} lines · click to select`}
                      className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                        isHovered
                          ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className="w-1.5 h-1.5 rounded-xs shrink-0"
                          style={{ backgroundColor: dep.colorHex }}
                        />
                        <span className="truncate">{dep.path}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                        {dep.lines}L
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
