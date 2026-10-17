import { tool } from "langchain";
import { z } from "zod";
import { callPGraphApi } from "./client.ts";

export const listFilesByRole = tool(
  async ({ role }, config) => {
    return await callPGraphApi("/api/agent/roles", { role }, config);
  },
  {
    name: "list_files_by_role",
    description:
      "List all repository files categorized with a specific architectural role (e.g. 'route', 'entry', 'component', 'config', 'util', 'lib', 'model', 'middleware', 'hook', 'style', 'test', 'script').",
    schema: z.object({
      role: z
        .string()
        .describe("Architectural role to filter files by"),
    }),
  }
);
