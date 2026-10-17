import { tool } from "langchain";
import { z } from "zod";
import { callPGraphApi } from "./client.ts";

export const transitiveWalk = tool(
  async ({ path, direction, maxDepth }, config) => {
    return await callPGraphApi(
      "/api/agent/walk",
      { path, direction, maxDepth: maxDepth ?? 2 },
      config
    );
  },
  {
    name: "transitive_walk",
    description:
      "Perform a transitive graph walk from a start file. 'blast-radius' walks reverse dependencies (everything that breaks if this file changes); 'dependency-chain' walks forward dependencies (everything this file directly or transitively needs).",
    schema: z.object({
      path: z
        .string()
        .describe("The relative path of the file to start walking from"),
      direction: z
        .enum(["blast-radius", "dependency-chain"])
        .describe("Walk direction: 'blast-radius' (reverse dependents) or 'dependency-chain' (forward imports)"),
      maxDepth: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum walk depth (default 2)"),
    }),
  }
);
