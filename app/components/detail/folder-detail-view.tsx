import React from "react";
import type { FolderDetail } from "@/lib/graph/detail";
import { CountUp } from "@/app/components/ui/count-up";
import { ClickSpark } from "@/app/components/ui/click-spark";

export function FolderDetailView({
  detail,
  isFileHovered,
  onSelectFile,
  onHover,
  onTabChange,
}: {
  detail: FolderDetail;
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
  onTabChange?: (tab: "structure" | "explanation") => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Folder header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-all select-text">
          {detail.dir === "." ? "(root)" : detail.dir}
        </div>
        <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              <CountUp to={detail.fileCount} duration={500} /> files
            </span>
            <span>·</span>
            <span style={{ color: "var(--pg-in)" }} className="tabular-nums">
              in <CountUp to={detail.fanIn} duration={500} />
            </span>
            <span>·</span>
            <span style={{ color: "var(--pg-out)" }} className="tabular-nums">
              out <CountUp to={detail.fanOut} duration={500} />
            </span>
          </div>

          {onTabChange && (
            <ClickSpark sparkColor="#3b82f6" sparkRadius={16} sparkCount={8}>
              <button
                type="button"
                onClick={() => onTabChange("explanation")}
                className="px-1.5 py-0.5 rounded-xs bg-(--pg-accent)/10 text-(--pg-accent) font-medium hover:bg-(--pg-accent)/20 cursor-pointer active:scale-95 transition-transform"
              >
                Explain Folder →
              </button>
            </ClickSpark>
          )}
        </div>
      </div>

      {/* Kinds of files inside this folder */}
      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
          File kinds inside
        </div>

        <div className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 flex flex-col gap-2">
          {/* Extension categories */}
          <div className="flex flex-wrap gap-1.5">
            {detail.categories.map((cat) => (
              <span
                key={cat.kind}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xs bg-zinc-100 dark:bg-zinc-800/80 font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
              >
                {cat.colorHex && (
                  <span
                    className="w-1.5 h-1.5 rounded-xs shrink-0"
                    style={{ backgroundColor: cat.colorHex }}
                  />
                )}
                <span>{cat.kind}</span>
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {cat.count}
                </span>
              </span>
            ))}
          </div>

          {/* Convention roles if any non-unidentified */}
          {detail.roles.length > 0 && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex flex-wrap gap-1 font-mono text-[10px]">
              {detail.roles.map((r) => (
                <span
                  key={r.kind}
                  className="px-1.5 py-0.5 rounded-xs bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                >
                  {r.kind}: <span className="tabular-nums font-medium">{r.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Files list inside this folder */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between font-mono">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
            Files in folder
          </span>
          <span className="text-[10px] text-zinc-400 tabular-nums">
            {detail.fileCount}
          </span>
        </div>

        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-56 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {detail.files.map((file) => {
            const isHovered = isFileHovered(file.path);
            return (
              <div
                key={file.path}
                onClick={() => onSelectFile(file.path)}
                onMouseEnter={() => onHover(file.path)}
                onMouseLeave={() => onHover(null)}
                title={`${file.path} · ${file.lines} lines · in ${file.fanIn} · out ${file.fanOut}`}
                className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                  isHovered
                    ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className="w-1.5 h-1.5 rounded-xs shrink-0"
                    style={{ backgroundColor: file.colorHex }}
                  />
                  <span className="truncate">{file.path}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[10px] tabular-nums">
                  <span style={{ color: "var(--pg-in)" }}>in {file.fanIn}</span>
                  <span className="text-zinc-400">{file.lines}L</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
