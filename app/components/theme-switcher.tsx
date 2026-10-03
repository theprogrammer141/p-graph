"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-[74px] h-7" />;
  }

  return (
    <div className="flex items-center gap-0.5 border border-zinc-200 dark:border-zinc-800 p-0.5 rounded-xs bg-zinc-50 dark:bg-zinc-900">
      <button
        onClick={() => setTheme("light")}
        className={`p-1 rounded-xs transition-colors ${
          theme === "light"
            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
            : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        }`}
        title="Light mode"
      >
        <Sun className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`p-1 rounded-xs transition-colors ${
          theme === "system"
            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
            : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        }`}
        title="System theme"
      >
        <Monitor className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`p-1 rounded-xs transition-colors ${
          theme === "dark"
            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
            : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        }`}
        title="Dark mode"
      >
        <Moon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

