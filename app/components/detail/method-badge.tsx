import React from "react";

/** Renders an uppercase HTTP method with its method-specific color or a neutral fallback. */
export function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  let badgeStyle = "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700";
  if (m === "GET") {
    badgeStyle = "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/70 border-sky-200 dark:border-sky-800";
  } else if (m === "POST") {
    badgeStyle = "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800";
  } else if (m === "PUT") {
    badgeStyle = "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border-amber-200 dark:border-amber-800";
  } else if (m === "DELETE") {
    badgeStyle = "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800";
  } else if (m === "PATCH") {
    badgeStyle = "text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/70 border-purple-200 dark:border-purple-800";
  }
  return (
    <span
      className={`px-1 py-0.5 rounded-xs border text-[9px] font-bold tracking-tight shrink-0 ${badgeStyle}`}
    >
      {m}
    </span>
  );
}
