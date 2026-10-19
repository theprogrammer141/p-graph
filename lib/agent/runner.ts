import type { OpenAI } from "openai";
import { getAIClient, PINNED_MODEL } from "@/lib/ai/client";
import type { AnalysisGraph } from "./loader";
import { AGENT_SYSTEM_PROMPT } from "./prompt";
import { AGENT_TOOLS, executeAgentTool } from "./tools";
import { toUserFacingMessage } from "@/lib/errors";

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

function extractThinkTags(text: string): { cleanText: string; thinkText: string } {
  const thinkMatches = text.match(/<think>([\s\S]*?)<\/think>/gi);
  let thinkText = "";
  if (thinkMatches) {
    thinkText = thinkMatches
      .map((m) => m.replace(/<\/?think>/gi, "").trim())
      .filter(Boolean)
      .join("\n");
  }
  const cleanText = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { cleanText, thinkText };
}

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

        // Rounds 0..MAX_TOOL_ROUNDS-1 may call tools. The pinned model can keep
        // re-searching forever, so the extra last round offers no tools and tells it
        // to answer from the tool results it already has. tool_choice "none" was
        // tried first: this model then writes a fake tool call out as plain text.
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          if (signal?.aborted) break;
          const isFinalRound = round === MAX_TOOL_ROUNDS;

          const responseStream = await client.chat.completions.create(
            isFinalRound
              ? {
                  model,
                  messages: [
                    ...conversation,
                    {
                      role: "system",
                      content:
                        "Lookup budget exhausted. Answer the user now in plain prose using only the tool results above. If they do not answer the question, say what could not be found. Do not call or write out any tool calls.",
                    },
                  ],
                  stream: true,
                }
              : {
                  model,
                  messages: conversation,
                  tools: AGENT_TOOLS,
                  stream: true,
                }
          );

          let roundContent = "";
          let finishReason: string | null = null;
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
            if (choice?.finish_reason) finishReason = choice.finish_reason;

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

            const reasoningDelta = (delta as { reasoning?: string })?.reasoning;
            if (reasoningDelta) {
              emit("reasoning", { text: reasoningDelta });
            }

            if (delta?.content) {
              roundContent += delta.content;
            }
          }

          if (finishReason === "length") {
            throw new Error("Agent response was cut off by the token limit.");
          }

          const toolCalls = Array.from(callsByIndex.values()).filter((c) => Boolean(c.name));

          if (toolCalls.length === 0) {
            // Final round with no tool calls: this is the real response.
            const { cleanText, thinkText } = extractThinkTags(roundContent);
            if (thinkText) {
              emit("reasoning", { text: thinkText });
            }
            if (cleanText) {
              fullText = cleanText;
              emit("text_chunk", { text: cleanText });
            }
            break;
          }

          // If this round made tool calls, any text produced before/during the calls
          // is intermediate reasoning/commentary, NOT the final response.
          if (roundContent.trim()) {
            emit("reasoning", { text: roundContent.trim() });
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

        if (!signal?.aborted && fullText.trim().length === 0) {
          throw new Error("The model returned no answer text. Try asking again.");
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
        const userFacing = toUserFacingMessage(
          err,
          "The AI agent encountered an issue while generating an answer. Please try again.",
          "agent.runner.stream",
        );
        emit("error", { error: userFacing.message });
        controller.close();
      }
    },
  });
}
