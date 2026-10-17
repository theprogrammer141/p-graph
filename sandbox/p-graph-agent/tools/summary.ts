import { tool } from "langchain";
import { z } from "zod";
import { callPGraphApi } from "./client.ts";

export const getAnalysisSummary = tool(
  async (_input, config) => {
    return await callPGraphApi("/api/agent/summary", undefined, config);
  },
  {
    name: "get_analysis_summary",
    description:
      "Get an overview summary of the repository analysis, including framework detected, total files, total imports, total routes, starting points (files nothing imports), and most depended-on files.",
    schema: z.object({}),
  }
);
