import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { allTools } from "./tools/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 2024;
const instructionsPath = path.join(__dirname, "instructions.md");
const systemPrompt = fs.readFileSync(instructionsPath, "utf-8");

const model = new ChatOpenAI({
  apiKey: process.env.GROQ_API_KEY,
  configuration: {
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  },
  model: process.env.MODEL_NAME || "openai/gpt-oss-120b",
  maxTokens: 1000,
});

const agent = createAgent({
  model,
  tools: allTools,
  systemPrompt,
});

// In-memory conversation state per thread
const threadStores = new Map<string, Array<{ role: string; content: string }>>();

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-PGraph-Token");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  if (url.pathname === "/health" || (url.pathname === "/" && req.method === "GET")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", agent: "p-graph-agent" }));
    return;
  }

  // Handle threads creation (LangGraph API compat)
  if (url.pathname === "/threads" && req.method === "POST") {
    const threadId = crypto.randomUUID();
    threadStores.set(threadId, []);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ thread_id: threadId }));
    return;
  }

  // Handle streaming runs
  const isStreamRoute =
    url.pathname === "/runs/stream" ||
    url.pathname === "/chat" ||
    /^\/threads\/[^/]+\/runs\/stream$/.test(url.pathname);

  if (isStreamRoute && req.method === "POST") {
    let bodyText = "";
    req.on("data", (chunk) => {
      bodyText += chunk;
    });

    req.on("end", async () => {
      try {
        const body = JSON.parse(bodyText || "{}");
        const threadMatch = url.pathname.match(/^\/threads\/([^/]+)\/runs\/stream$/);
        const threadId = threadMatch ? threadMatch[1] : body.threadId || crypto.randomUUID();

        // Extract user messages
        let messages = body.input?.messages || body.messages || [];
        if (body.message) {
          messages = [{ role: "user", content: body.message }];
        }

        const credential =
          body.config?.configurable?.credential ||
          body.credential ||
          process.env.PGRAPH_CREDENTIAL;

        const history = threadStores.get(threadId) || [];
        const fullMessages = [...history, ...messages];

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        const sendEvent = (event: string, data: unknown) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        sendEvent("thread", { threadId });

        const eventStream = agent.streamEvents(
          { messages: fullMessages },
          {
            version: "v2",
            configurable: {
              credential,
            },
          }
        );

        let accumulatedContent = "";

        for await (const event of eventStream) {
          if (event.event === "on_tool_start") {
            sendEvent("tool_start", {
              id: event.run_id,
              name: event.name,
              args: event.data?.input,
            });
          } else if (event.event === "on_tool_end") {
            sendEvent("tool_end", {
              id: event.run_id,
              name: event.name,
              output: event.data?.output,
            });
          } else if (event.event === "on_chat_model_stream") {
            const chunk = event.data?.chunk;
            const text =
              typeof chunk?.content === "string"
                ? chunk.content
                : Array.isArray(chunk?.content)
                ? chunk.content.map((c: { text?: string }) => c.text || "").join("")
                : "";

            if (text) {
              accumulatedContent += text;
              sendEvent("text_chunk", { text });
            }
          }
        }

        // Save conversation to thread history
        fullMessages.push({ role: "assistant", content: accumulatedContent });
        threadStores.set(threadId, fullMessages);

        sendEvent("done", { threadId, fullText: accumulatedContent });
        res.end();
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.write(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`p-graph-agent service listening on http://localhost:${PORT}`);
});

export default server;

