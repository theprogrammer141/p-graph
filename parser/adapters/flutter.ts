import { existsSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

export const flutterAdapter: FrameworkAdapter = {
  name: "Flutter",

  /** Recognizes Flutter/Dart projects from pubspec.yaml at the repository root. */
  detect(root: string): boolean {
    return existsSync(path.join(/*turbopackIgnore: true*/ root, "pubspec.yaml"));
  },

  /** Excludes platform runner folders, Dart tool state, and build outputs. */
  excludeDirectory(relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name.startsWith(".")) {
      if (name === ".dart_tool") return "build output (.dart_tool)";
      return "hidden directory";
    }
    if (
      name === "build" ||
      name === "out" ||
      name === "dist" ||
      name === "coverage"
    ) {
      return `build output (${name})`;
    }
    if (
      relPath === "ios" ||
      relPath === "android" ||
      relPath === "web" ||
      relPath === "macos" ||
      relPath === "linux" ||
      relPath === "windows"
    ) {
      return `platform runner (${name})`;
    }
    return null;
  },

  /** Classifies Flutter screens, widgets, state/BLoCs/providers, models, and services. */
  assignRole(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/");
    const fileName = norm.split("/").pop() ?? "";

    if (
      fileName.endsWith("_test.dart") ||
      /(^|\/)(test|integration_test)\//.test(norm)
    ) {
      return "Generic";
    }

    if (
      /(^|\/)(screens?|pages?|views?)\/.*\.dart$/.test(norm) ||
      /_(screen|page|view)\.dart$/.test(fileName)
    ) {
      return "Screens";
    }
    if (
      /(^|\/)(widgets?|components?)\/.*\.dart$/.test(norm) ||
      /_widget\.dart$/.test(fileName)
    ) {
      return "Widgets";
    }
    if (
      /(^|\/)(blocs?|cubits?|providers?|controllers?|notifiers?|state)\/.*\.dart$/.test(
        norm,
      ) ||
      /_(bloc|cubit|provider|controller|notifier|state|event)\.dart$/.test(fileName)
    ) {
      return "State";
    }
    if (
      /(^|\/)(models?|entities|domain)\/.*\.dart$/.test(norm) ||
      /_(model|entity)\.dart$/.test(fileName)
    ) {
      return "Models";
    }
    if (
      /(^|\/)(services?|repositories|repos?|data|api|datasources?)\/.*\.dart$/.test(
        norm,
      ) ||
      /_(service|repository|repo|api|datasource)\.dart$/.test(fileName)
    ) {
      return "Services";
    }

    return "Generic";
  },

  /** Flutter navigation is widget-based at runtime and does not define static HTTP routes. */
  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};

