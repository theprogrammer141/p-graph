import type { OpenAI } from "openai";
import { buildFileDetail, buildRepoSummary } from "@/lib/graph/detail";
import { transitiveWalk, type WalkDirection } from "@/lib/graph/maths";
import type { AnalysisGraph } from "./loader";

export const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_analysis_summary",
      description:
        "Get an overview summary of the repository analysis, including framework detected, total files, total imports, total routes, starting points (files nothing imports), and most depended-on files.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files_by_path",
      description: "Search repository files by path substring (case-insensitive).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Path substring to search for (e.g. 'auth', 'components/ui', 'api')",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files_by_role",
      description:
        "List files classified under a specific architectural role (e.g. 'route', 'entry', 'component', 'config', 'util', 'lib', 'model', 'middleware', 'hook', 'style', 'test', 'script').",
      parameters: {
        type: "object",
        properties: {
          role: {
            type: "string",
            description: "The architectural role name to filter by",
          },
        },
        required: ["role"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_neighbors",
      description: "Get direct imports (dependencies) and direct dependents for a file.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Exact repository path of the file",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transitive_walk",
      description:
        "Transitive dependency walk in either direction: 'blast-radius' (everything that breaks if this file changes) or 'dependency-chain' (everything this file directly or transitively requires).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Exact repository path of the starting file",
          },
          direction: {
            type: "string",
            enum: ["blast-radius", "dependency-chain"],
            description: "Direction to walk",
          },
          maxDepth: {
            type: "integer",
            description: "Maximum depth to traverse (1-10, default 2)",
          },
        },
        required: ["path", "direction"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_route_table",
      description: "Complete table of declared HTTP routes, methods, and handling files.",
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            description: "Optional HTTP method filter (e.g. GET, POST)",
          },
        },
        additionalProperties: false,
      },
    },
  },
];

export function executeAgentTool(
  graph: AnalysisGraph,
  toolName: string,
  rawArgs: Record<string, unknown>
): unknown {
  switch (toolName) {
    case "get_analysis_summary": {
      return buildRepoSummary(graph.files, graph.edges, {
        repoName: graph.repoName,
        adapter: graph.adapter,
        routeCount: graph.routes.length,
      });
    }

    case "search_files_by_path": {
      const query = String(rawArgs.query ?? "").trim();
      if (!query) {
        return { error: "Missing parameter 'query'." };
      }
      const qLower = query.toLowerCase();
      const matches = graph.files.filter((f) => f.path.toLowerCase().includes(qLower));

      matches.sort((a, b) => {
        const aLower = a.path.toLowerCase();
        const bLower = b.path.toLowerCase();
        const aExact = aLower === qLower;
        const bExact = bLower === qLower;
        if (aExact !== bExact) return aExact ? -1 : 1;
        return a.path.length - b.path.length || (a.path < b.path ? -1 : 1);
      });

      return {
        query,
        count: matches.length,
        files: matches.slice(0, 50).map((f) => ({
          path: f.path,
          lines: f.lines,
          role: f.role ?? "unidentified",
          fanIn: f.fanIn,
          fanOut: f.fanOut,
        })),
      };
    }

    case "list_files_by_role": {
      const role = String(rawArgs.role ?? "").trim();
      if (!role) {
        return { error: "Missing parameter 'role'." };
      }
      const roleLower = role.toLowerCase();
      const matches = graph.files.filter((f) => f.role?.toLowerCase() === roleLower);

      matches.sort((a, b) => b.fanIn - a.fanIn || (a.path < b.path ? -1 : 1));

      return {
        role,
        count: matches.length,
        files: matches.map((f) => ({
          path: f.path,
          lines: f.lines,
          role: f.role ?? "unidentified",
          fanIn: f.fanIn,
          fanOut: f.fanOut,
        })),
      };
    }

    case "get_file_neighbors": {
      const path = String(rawArgs.path ?? "").trim();
      if (!path) {
        return { error: "Missing parameter 'path'." };
      }

      const detail = buildFileDetail(path, graph.filesByPath, graph.edges, graph.adapter);
      if (!detail) {
        return { error: `File '${path}' does not exist in the analyzed repository graph.` };
      }

      return {
        path: detail.path,
        kind: detail.kind,
        lines: detail.lines,
        dependsOnCount: detail.dependsOnCount,
        dependedOnCount: detail.dependedOnCount,
        dependencies: detail.dependencies.map((d) => ({
          path: d.path,
          kind: d.kind,
          lines: d.lines,
          fanIn: d.fanIn,
          fanOut: d.fanOut,
        })),
        dependents: detail.dependents.map((d) => ({
          path: d.path,
          kind: d.kind,
          lines: d.lines,
          fanIn: d.fanIn,
          fanOut: d.fanOut,
        })),
      };
    }

    case "transitive_walk": {
      const path = String(rawArgs.path ?? "").trim();
      const directionStr = String(rawArgs.direction ?? "");
      const maxDepthNum = Number(rawArgs.maxDepth);

      if (!path) {
        return { error: "Missing parameter 'path'." };
      }
      if (directionStr !== "blast-radius" && directionStr !== "dependency-chain") {
        return {
          error: "Invalid parameter 'direction'. Must be either 'blast-radius' or 'dependency-chain'.",
        };
      }

      const direction = directionStr as WalkDirection;
      const maxDepth = Math.max(1, Math.min(10, isNaN(maxDepthNum) ? 2 : maxDepthNum));

      if (!graph.filesByPath.has(path)) {
        return { error: `File '${path}' does not exist in the analyzed repository graph.` };
      }

      const items = transitiveWalk(path, graph.edges, direction, maxDepth);

      return {
        startPath: path,
        direction,
        maxDepth,
        count: items.length,
        items,
      };
    }

    case "get_route_table": {
      const method = rawArgs.method ? String(rawArgs.method).trim().toUpperCase() : undefined;
      const routes = method
        ? graph.routes.filter((r) => r.method.toUpperCase() === method)
        : graph.routes;

      return {
        count: routes.length,
        routes: routes.map((r) => ({
          method: r.method,
          path: r.path,
          filePath: r.filePath,
        })),
      };
    }

    default:
      return { error: `Unknown tool '${toolName}'.` };
  }
}
