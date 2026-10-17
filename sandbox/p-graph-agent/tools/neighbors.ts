import { tool } from "langchain";
import { z } from "zod";
import { callPGraphApi } from "./client.ts";

export const getFileNeighbors = tool(
  async ({ path }, config) => {
    return await callPGraphApi("/api/agent/neighbors", { path }, config);
  },
  {
    name: "get_file_neighbors",
    description:
      "Get direct imports and direct dependents for a file. Returns 'dependencies' (files this file directly imports) and 'dependents' (files that directly import this file).",
    schema: z.object({
      path: z
        .string()
        .describe("The exact relative file path in the repository (e.g. 'app/api/auth.ts')"),
    }),
  }
);
