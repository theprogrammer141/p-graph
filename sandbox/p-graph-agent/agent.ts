import "dotenv/config";
import { defineDeepAgent } from "managed-deepagents";
import { ChatOpenRouter } from "@langchain/openrouter";
import { allTools } from "./tools/index.ts";

const model = new ChatOpenRouter({
  model: process.env.MODEL_NAME || "nvidia/nemotron-3.5-super-vl:free",
  maxTokens: 1000,
});

export const agent = defineDeepAgent({
  name: "p-graph-agent",
  model,
  tools: allTools,
});
