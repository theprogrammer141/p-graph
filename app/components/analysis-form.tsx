"use client";

import React, { useActionState } from "react";
import { submitRepoAction, type ActionState } from "@/app/actions/analysis";

export function AnalysisForm() {
  const [state, formAction, isPending] = useActionState<ActionState | null, FormData>(
    submitRepoAction,
    null,
  );

  return (
    <div className="mb-6">
      <form action={formAction} className="flex flex-col sm:flex-row gap-2 max-w-xl">
        <div className="flex-1 min-w-0">
          <label htmlFor="repoUrl" className="sr-only">
            GitHub repository URL
          </label>
          <input
            id="repoUrl"
            name="repoUrl"
            type="text"
            required
            disabled={isPending}
            placeholder="https://github.com/owner/repository"
            className="w-full px-3 py-1.5 font-mono text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-3.5 py-1.5 font-mono text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 rounded-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
        >
          {isPending ? "Starting..." : "Analyse"}
        </button>
      </form>

      {state?.error && (
        <div className="mt-2 font-mono text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 px-2.5 py-1 rounded-xs max-w-xl">
          {state.error}
        </div>
      )}
    </div>
  );
}
