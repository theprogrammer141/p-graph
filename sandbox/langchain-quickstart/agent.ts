// LangChain JS quickstart "Build a basic agent", OpenRouter variant.
// https://docs.langchain.com/oss/javascript/langchain/quickstart
import "dotenv/config";
import { createAgent, tool } from "langchain";
import { ChatOpenRouter } from "@langchain/openrouter";
import * as z from "zod";

const getWeather = tool(
  (input) => `It's always sunny in ${input.city}!`,
  {
    name: "get_weather",
    description: "Get the weather for a given city",
    schema: z.object({
      city: z.string().describe("The city to get the weather for"),
    }),
  }
);

const agent = createAgent({
  // The docs use the string "openrouter:anthropic/claude-sonnet-4-6", but
  // langchain 1.5.16 can't resolve the "openrouter" prefix yet. Reads
  // OPENROUTER_API_KEY from the environment.
  model: new ChatOpenRouter({ model: "anthropic/claude-sonnet-4-6" }),
  tools: [getWeather],
  systemPrompt: "You are a helpful assistant. Use tools when they help.",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "What's the weather in San Francisco?" }],
});

console.log(result.messages.at(-1)?.content);
