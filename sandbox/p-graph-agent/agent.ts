import "dotenv/config";
import { defineDeepAgent } from "managed-deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { allTools } from "./tools/index.ts";

const model = new ChatOpenAI({
  apiKey: process.env.GROQ_API_KEY,
  configuration: {
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  },
  model: process.env.MODEL_NAME || "openai/gpt-oss-120b",
  maxTokens: 1000,
});

export const agent = defineDeepAgent({
  name: "p-graph-agent",
  model,
  tools: allTools,
});
