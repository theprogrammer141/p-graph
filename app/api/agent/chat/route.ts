import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase";
import { mintAgentCredential } from "@/lib/agent/credential";
import { agentErrorResponse, handleOptions, CORS_HEADERS } from "@/lib/agent/http";
import { loadAnalysisGraph } from "@/lib/agent/loader";
import { runAgentStream, type ChatHistoryItem } from "@/lib/agent/runner";

export async function OPTIONS() {
  return handleOptions();
}

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Transforms native LangGraph dev server SSE events (values, messages/partial, metadata, error)
 * into standard events consumed by the Ask panel:
 * - event: thread
 * - event: tool_start
 * - event: tool_end
 * - event: text_chunk
 * - event: done
 * - event: error
 */
function createLangGraphTransformer(activeThreadId: string) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  const seenToolStarts = new Set<string>();
  const seenToolEnds = new Set<string>();
  let latestAiContent = "";

  return new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      if (activeThreadId) {
        controller.enqueue(
          encoder.encode(`event: thread\ndata: ${JSON.stringify({ threadId: activeThreadId })}\n\n`)
        );
      }
    },
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;

        let eventType = "";
        let dataStr = "";

        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6).trim();
          }
        }

        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr);

          // 1. messages/partial: token streaming & tool call chunks
          if (eventType === "messages/partial") {
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              if (item?.tool_call_chunks && Array.isArray(item.tool_call_chunks)) {
                for (const tc of item.tool_call_chunks) {
                  const callId = tc.id || tc.name;
                  if (tc?.name && !seenToolStarts.has(callId)) {
                    seenToolStarts.add(callId);
                    controller.enqueue(
                      encoder.encode(
                        `event: tool_start\ndata: ${JSON.stringify({
                          id: callId,
                          name: tc.name,
                          args: tc.args ? (typeof tc.args === "string" ? tryParseJson(tc.args) : tc.args) : {},
                        })}\n\n`
                      )
                    );
                  }
                }
              }
              if (item?.content && typeof item.content === "string") {
                latestAiContent += item.content;
                controller.enqueue(
                  encoder.encode(`event: text_chunk\ndata: ${JSON.stringify({ text: item.content })}\n\n`)
                );
              }
            }
          }

          // 2. values: full state snapshot of graph
          else if (eventType === "values" && data?.messages && Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              // Tool calls requested by assistant
              if (msg.type === "ai" && Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                  const callId = tc.id || tc.name;
                  if (!seenToolStarts.has(callId)) {
                    seenToolStarts.add(callId);
                    controller.enqueue(
                      encoder.encode(
                        `event: tool_start\ndata: ${JSON.stringify({
                          id: callId,
                          name: tc.name,
                          args: tc.args || {},
                        })}\n\n`
                      )
                    );
                  }
                }
              }

              // Tool execution output
              if (msg.type === "tool") {
                const callId = msg.tool_call_id || msg.id || msg.name;
                if (!seenToolEnds.has(callId)) {
                  seenToolEnds.add(callId);
                  controller.enqueue(
                    encoder.encode(
                      `event: tool_end\ndata: ${JSON.stringify({
                        id: callId,
                        name: msg.name,
                        output: msg.content,
                      })}\n\n`
                    )
                  );
                }
              }

              // Final/current AI text content
              if (msg.type === "ai" && msg.content && typeof msg.content === "string" && msg.content.length > 0) {
                latestAiContent = msg.content;
              }
            }
          }

          // 3. Pass through already normalized events
          else if (
            eventType === "tool_start" ||
            eventType === "tool_end" ||
            eventType === "text_chunk" ||
            eventType === "reasoning" ||
            eventType === "done"
          ) {
            controller.enqueue(encoder.encode(`${block}\n\n`));
          }

          // 4. Error events
          else if (eventType === "error") {
            const errMsg = data.message || data.error || "Agent execution error";
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`)
            );
          }
        } catch {
          // Ignore unparseable or partial lines
        }
      }
    },
    flush(controller) {
      controller.enqueue(
        encoder.encode(`event: done\ndata: ${JSON.stringify({ fullText: latestAiContent })}\n\n`)
      );
    },
  });
}

/**
 * Entry point for the Ask chat panel.
 * 1. Proves the caller owns the analysis via Clerk and Supabase RLS.
 * 2. Mints a short-lived signed credential naming that analysis and organization.
 * 3. Opens or continues a conversation with the agent service and relays the stream back.
 */
export async function POST(req: Request) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return agentErrorResponse(
        new Error("Unauthorized: Active organization required to ask questions."),
        401
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      analysisId?: string;
      message?: string;
      threadId?: string;
      selected?: { kind: string; path?: string; dir?: string } | null;
      history?: ChatHistoryItem[];
    };

    const analysisId = body?.analysisId?.trim();
    const userMessage = body?.message?.trim();
    const threadId = body?.threadId?.trim();
    const selected = body?.selected;
    const history = body?.history;

    if (!analysisId) {
      return agentErrorResponse(new Error("Missing parameter 'analysisId'."), 400);
    }
    if (!userMessage) {
      return agentErrorResponse(new Error("Missing parameter 'message'."), 400);
    }

    // Verify ownership through Supabase RLS with Clerk client
    const supabase = await createClerkSupabaseClient();
    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .select("id, org_id")
      .eq("id", analysisId)
      .maybeSingle();

    if (analysisError || !analysis) {
      return agentErrorResponse(
        new Error("Analysis not found or not accessible within your organization."),
        404
      );
    }

    const agentUrl = process.env.AGENT_URL;

    // If an external agent service is configured and reachable, attempt forwarding to it
    if (agentUrl && agentUrl !== "http://127.0.0.1:2024") {
      const agentBase = agentUrl.endsWith("/") ? agentUrl : `${agentUrl}/`;
      const credential = mintAgentCredential({
        analysisId: analysis.id,
        orgId: analysis.org_id,
        expiresInSeconds: 600,
      });

      let contextualMessage = userMessage;
      if (selected?.path) {
        contextualMessage = `[Context: currently selected file is '${selected.path}']\n${userMessage}`;
      } else if (selected?.dir) {
        contextualMessage = `[Context: currently selected directory is '${selected.dir}']\n${userMessage}`;
      }

      let activeThreadId = threadId;
      try {
        if (!activeThreadId) {
          const threadEndpoint = new URL("threads", agentBase);
          const threadRes = await fetch(threadEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${credential}`,
            },
            body: JSON.stringify({}),
          });
          if (threadRes.ok) {
            const threadData = (await threadRes.json()) as { thread_id?: string; id?: string };
            activeThreadId = threadData.thread_id || threadData.id;
          }
        }

        const targetEndpoint = activeThreadId
          ? new URL(`threads/${encodeURIComponent(activeThreadId)}/runs/stream`, agentBase)
          : new URL("runs/stream", agentBase);

        const agentResponse = await fetch(targetEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${credential}`,
            "X-PGraph-Token": credential,
          },
          body: JSON.stringify({
            assistant_id: "p-graph-agent",
            stream_mode: ["messages", "values"],
            input: {
              messages: [{ role: "user", content: contextualMessage }],
            },
            config: {
              configurable: {
                credential,
                selectedPath: selected?.path,
              },
            },
          }),
        });

        if (agentResponse.ok && agentResponse.body) {
          const transformedStream = agentResponse.body.pipeThrough(
            createLangGraphTransformer(activeThreadId || "")
          );

          return new Response(transformedStream, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
        }
      } catch {
        // Fall back to in-process execution below when external agent is unreachable
      }
    }

    // Run the Ask agent directly in-process on Vercel
    const graph = await loadAnalysisGraph(analysis.id, analysis.org_id);
    const stream = runAgentStream({
      graph,
      userMessage,
      history,
      threadId,
      selected,
      signal: req.signal,
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
