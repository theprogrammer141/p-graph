"use client";

import React, { useEffect } from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary for unexpected page and component crashes.
 * Displays a sanitized, human-readable notification and opaque error digest
 * without exposing internal application or database diagnostics.
 */
export default function ErrorBoundary({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Technical stack trace is logged in client console for debugging without rendering in DOM
    console.error("[p-graph][error-boundary]", error);
  }, [error]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-50/50 dark:bg-zinc-950/50 text-xs">
      <div className="w-full max-w-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xs shadow-2xs p-5">
        <div className="flex items-center gap-2 mb-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-medium">
            Application Error
          </span>
        </div>

        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
          Something went wrong
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 text-[11px]">
          An unexpected issue prevented this page from displaying properly. You can try loading it again, or return to your workspace.
        </p>

        {error.digest && (
          <div className="mb-4 font-mono text-[10px] text-zinc-500 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 rounded-xs select-all">
            Reference: {error.digest}
          </div>
        )}

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <button
            onClick={() => reset()}
            className="px-3 py-1.5 bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 font-medium rounded-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] transition-all cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Return to workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
