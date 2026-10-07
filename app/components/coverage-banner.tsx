"use client";

import React, { useState } from "react";
import type { Coverage } from "@/parser/types";

interface CoverageBannerProps {
  coverage: Coverage;
}

export function CoverageBanner({ coverage }: CoverageBannerProps) {
  const [collapsed, setCollapsed] = useState(false);

  const { imports, files } = coverage;
  const totalInternal = imports.found - imports.external - imports.excluded;
  const coveragePercent =
    totalInternal > 0 ? Math.round((imports.resolved / totalInternal) * 100) : 100;

  const isPartial = coveragePercent < 95 || files.skipped > 0;
  if (!isPartial) return null;

  if (collapsed) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1 flex items-center justify-between text-[11px] font-mono text-amber-700 dark:text-amber-400 shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Partial graph: {coveragePercent}% coverage
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="hover:underline text-[10px] cursor-pointer"
        >
          expand
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-2 text-[11px] font-mono text-amber-800 dark:text-amber-300 shrink-0 flex items-start justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Graph is partial: {coveragePercent}% resolved
        </div>
        <div className="text-[10px] text-amber-700/90 dark:text-amber-400/90">
          {imports.unresolved} unresolved import{imports.unresolved === 1 ? "" : "s"}
          {files.skipped > 0 && `, ${files.skipped} skipped file${files.skipped === 1 ? "" : "s"}`}
          . Some edges could not be statically resolved.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        className="text-amber-700 dark:text-amber-400 hover:underline text-[10px] cursor-pointer ml-4 shrink-0"
      >
        collapse
      </button>
    </div>
  );
}
