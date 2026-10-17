import { tool } from "langchain";
import { z } from "zod";
import { callPGraphApi } from "./client.ts";

export const searchFilesByPath = tool(
  async ({ query }, config) => {
    return await callPGraphApi("/api/agent/search", { query }, config);
  },
  {
    name: "search_files_by_path",
    description:
      "Search for files in the repository whose relative path contains the given substring (case-insensitive).",
    schema: z.object({
      query: z
        .string()
        .describe("Substring of the file path to search for (e.g. 'auth', 'components/sidebar', 'api')"),
    }),
  }
);
