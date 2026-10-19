import "dotenv/config";
import { defineDeepAgent } from "managed-deepagents";
import { ChatOpenRouter } from "@langchain/openrouter";
import { allTools } from "./tools/index.ts";

const model = new ChatOpenRouter({
  model: process.env.MODEL_NAME || "minimax/minimax-m3.1-flash:free",
  maxTokens: 1000,
});

export const agent = defineDeepAgent({
  name: "p-graph-agent",
  model,
  tools: allTools,
});
