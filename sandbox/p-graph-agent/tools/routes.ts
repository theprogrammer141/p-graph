import { tool } from "langchain";
import { z } from "zod";
import { callPGraphApi } from "./client.ts";

export const getRouteTable = tool(
  async ({ method }, config) => {
    return await callPGraphApi("/api/agent/routes", { method }, config);
  },
  {
    name: "get_route_table",
    description:
      "Get the repository route table listing all HTTP routes, their methods, URL paths, and handling file paths.",
    schema: z.object({
      method: z
        .string()
        .optional()
        .describe("Optional HTTP method filter (e.g. 'GET', 'POST', 'DELETE')"),
    }),
  }
);
