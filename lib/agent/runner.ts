import type { OpenAI } from "openai";
import { getAIClient, PINNED_MODEL } from "@/lib/ai/client";
import type { AnalysisGraph } from "./loader";
import { AGENT_SYSTEM_PROMPT } from "./prompt";
import { AGENT_TOOLS, executeAgentTool } from "./tools";

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface RunAgentParams {
  graph: AnalysisGraph;
  userMessage: string;
  history?: ChatHistoryItem[];
  threadId?: string;
  selected?: { kind: string; path?: string; dir?: string } | null;
  signal?: AbortSignal;
}

// In-memory conversation state for requests sharing a process instance
export const inMemoryThreadStore = new Map<string, ChatHistoryItem[]>();

/**
 * Runs the Ask agent in-process, executing real graph lookups and streaming SSE chunks directly.
 */
export function runAgentStream(params: RunAgentParams): ReadableStream<Uint8Array> {
  const { graph, userMessage, history, threadId, selected, signal } = params;
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const activeThreadId = threadId || crypto.randomUUID();
      emit("thread", { threadId: activeThreadId });

      try {
        const client = getAIClient();
        const model =
          process.env.AGENT_MODEL ||
          process.env.MODEL_NAME ||
          process.env.AI_MODEL ||
          PINNED_MODEL;

        let contextualMessage = userMessage;
        if (selected?.path) {
          contextualMessage = `[Context: currently selected file is '${selected.path}']\n${userMessage}`;
        } else if (selected?.dir) {
          contextualMessage = `[Context: currently selected directory is '${selected.dir}']\n${userMessage}`;
        }

        const priorTurns = history ?? inMemoryThreadStore.get(activeThreadId) ?? [];

        const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: AGENT_SYSTEM_PROMPT },
          ...priorTurns.map((turn) => ({
            role: turn.role,
            content: turn.content,
          })),
          { role: "user", content: contextualMessage },
        ];

        let fullText = "";
        const MAX_TOOL_ROUNDS = 5;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (signal?.aborted) break;

          const responseStream = await client.chat.completions.create({
            model,
            messages: conversation,
            tools: AGENT_TOOLS,
            stream: true,
          });

          let roundContent = "";
          interface PendingToolCall {
            id: string;
            name: string;
            arguments: string;
          }
          const callsByIndex = new Map<number, PendingToolCall>();

          for await (const chunk of responseStream) {
            if (signal?.aborted) break;
            const choice = chunk.choices[0];
            const delta = choice?.delta;

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                let pending = callsByIndex.get(idx);
                if (!pending) {
                  pending = {
                    id: tc.id || `call_${Date.now()}_${idx}`,
                    name: tc.function?.name || "",
                    arguments: "",
                  };
                  callsByIndex.set(idx, pending);
                }
                if (tc.id) pending.id = tc.id;
                if (tc.function?.name) pending.name = tc.function.name;
                if (tc.function?.arguments) pending.arguments += tc.function.arguments;
              }
            }

            if (delta?.content) {
              roundContent += delta.content;
              fullText += delta.content;
              emit("text_chunk", { text: delta.content });
            }
          }

          const toolCalls = Array.from(callsByIndex.values()).filter((c) => Boolean(c.name));

          if (toolCalls.length === 0) {
            break;
          }

          conversation.push({
            role: "assistant",
            content: roundContent || null,
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: "function",
              function: {
                name: c.name,
                arguments: c.arguments,
              },
            })),
          });

          for (const call of toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(call.arguments || "{}");
            } catch {
              args = {};
            }

            emit("tool_start", {
              id: call.id,
              name: call.name,
              args,
            });

            let output: unknown;
            try {
              output = executeAgentTool(graph, call.name, args);
            } catch (err) {
              output = {
                error: err instanceof Error ? err.message : String(err),
              };
            }

            emit("tool_end", {
              id: call.id,
              name: call.name,
              output,
            });

            conversation.push({
              role: "tool",
              tool_call_id: call.id,
              content: typeof output === "string" ? output : JSON.stringify(output),
            });
          }
        }

        // Persist history for subsequent turns
        inMemoryThreadStore.set(activeThreadId, [
          ...priorTurns,
          { role: "user", content: userMessage },
          { role: "assistant", content: fullText },
        ]);

        emit("done", { threadId: activeThreadId, fullText });
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        emit("error", { error: errorMsg });
        controller.close();
      }
    },
  });
}
