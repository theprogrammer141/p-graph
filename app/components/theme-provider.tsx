"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

// React 19 flags inline <script> tags inside components as a development warning.
// next-themes relies on this inline script during SSR to prevent screen flash (FOUC).
if (process.env.NODE_ENV === "development") {
  const isPatchedKey = Symbol.for("__pgraph_next_themes_script_warning_filtered__");
  const globalStore = globalThis as unknown as { [key: symbol]: boolean };

  if (!globalStore[isPatchedKey]) {
    globalStore[isPatchedKey] = true;
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("Encountered a script tag while rendering React component")
      ) {
        return;
      }
      originalConsoleError.apply(console, args);
    };
  }
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
