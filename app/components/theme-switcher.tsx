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
    return <div className="w-[88px] h-8" />;
  }

  return (
    <div className="flex items-center gap-1 border border-black/[.08] dark:border-white/[.145] p-1 rounded-md">
      <button
        onClick={() => setTheme("light")}
        className={`p-1.5 rounded-sm transition-colors ${
          theme === "light"
            ? "bg-black/[.04] dark:bg-white/[.08]"
            : "hover:bg-black/[.02] dark:hover:bg-white/[.04]"
        }`}
        title="Light"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`p-1.5 rounded-sm transition-colors ${
          theme === "system"
            ? "bg-black/[.04] dark:bg-white/[.08]"
            : "hover:bg-black/[.02] dark:hover:bg-white/[.04]"
        }`}
        title="System"
      >
        <Monitor className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`p-1.5 rounded-sm transition-colors ${
          theme === "dark"
            ? "bg-black/[.04] dark:bg-white/[.08]"
            : "hover:bg-black/[.02] dark:hover:bg-white/[.04]"
        }`}
        title="Dark"
      >
        <Moon className="w-4 h-4" />
      </button>
    </div>
  );
}
