"use client";

import React, { useState, useRef, useEffect } from "react";
import type { SelectionTarget } from "./workspace-shell";
import { ClickSpark } from "@/app/components/ui/click-spark";
import { BorderTrail } from "@/app/components/ui/border-trail";

export interface ToolCallItem {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "done" | "error";
  output?: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallItem[];
  isStreaming?: boolean;
  error?: string;
}

interface AskPanelProps {
  analysisId?: string;
  repoName?: string;
  selection: SelectionTarget;
  onSelectFile?: (path: string) => void;
}

export function AskPanel({
  analysisId,
  repoName = "repository",
  selection,
  onSelectFile,
}: AskPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll on new messages or streaming chunks
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text || isLoading || !analysisId) return;

    setGeneralError(null);
    setInputValue("");

    const userMessageId = `user_${Date.now()}`;
    const assistantMessageId = `assistant_${Date.now()}`;

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMessageId, role: "user", content: text },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        toolCalls: [],
        isStreaming: true,
      },
    ];

    setMessages(newMessages);
    setIsLoading(true);

    try {
      const previousTurns = messages
        .filter((m) => !m.error && m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          message: text,
          threadId: threadId ?? undefined,
          selected: selection,
          history: previousTurns,
        }),
      });

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => ({}))) as { error?: string };
        const errMsg = errorJson.error || `Request failed with status ${response.status}`;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, isStreaming: false, error: errMsg, content: m.content || errMsg }
              : m
          )
        );
        setIsLoading(false);
        return;
      }

      if (!response.body) {
        throw new Error("No response body received from server.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const block of lines) {
          if (!block.trim()) continue;

          let eventType = "message";
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

            if (eventType === "thread") {
              if (data.threadId) {
                setThreadId(data.threadId);
              }
            } else if (eventType === "tool_start") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMessageId) return m;
                  const existing = m.toolCalls || [];
                  return {
                    ...m,
                    toolCalls: [
                      ...existing,
                      {
                        id: data.id || `call_${Date.now()}`,
                        name: data.name,
                        args: data.args,
                        status: "running",
                      },
                    ],
                  };
                })
              );
            } else if (eventType === "tool_end") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMessageId) return m;
                  const updatedCalls = (m.toolCalls || []).map((c) =>
                    c.id === data.id || c.name === data.name
                      ? { ...c, status: "done" as const, output: data.output }
                      : c
                  );
                  return { ...m, toolCalls: updatedCalls };
                })
              );
            } else if (eventType === "text_chunk") {
              if (data.text) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + data.text }
                      : m
                  )
                );
              }
            } else if (eventType === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        isStreaming: false,
                        content: data.fullText || m.content,
                      }
                    : m
                )
              );
            } else if (eventType === "error") {
              const errMsg = data.error || "An error occurred during agent execution.";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, isStreaming: false, error: errMsg, content: m.content || errMsg }
                    : m
                )
              );
            }
          } catch {
            // Ignore non-JSON chunks
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: false, error: errMsg, content: m.content || errMsg }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: false }
            : m
        )
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setThreadId(null);
    setGeneralError(null);
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50/40 dark:bg-zinc-950 text-xs overflow-hidden">
      {/* Context bar indicating active scope & canvas selection */}
      <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/40 flex items-center justify-between shrink-0 font-mono text-[10px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-zinc-400 dark:text-zinc-500 shrink-0">Repository:</span>
          <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate">
            {repoName}
          </span>
          {selection?.kind === "file" && (
            <span
              title={`Selected file: ${selection.path}`}
              className="ml-1 px-1.5 py-0.5 rounded-xs bg-zinc-200 dark:bg-zinc-800 text-(--pg-accent) truncate max-w-35"
            >
              {selection.path}
            </span>
          )}
          {selection?.kind === "folder" && (
            <span
              title={`Selected directory: ${selection.dir}`}
              className="ml-1 px-1.5 py-0.5 rounded-xs bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 truncate max-w-35"
            >
              {selection.dir}/
            </span>
          )}
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleNewChat}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer shrink-0 ml-2"
          >
            New chat
          </button>
        )}
      </div>

      {generalError && (
        <div className="p-2 mx-3 mt-2 rounded-xs border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-mono text-[11px]">
          {generalError}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-3">
            <div className="font-mono text-zinc-400 dark:text-zinc-500 text-[11px]">
              Ask questions about {repoName}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 max-w-60 leading-relaxed">
              Every answer is verified against the real dependency graph using tools.
            </div>

            <div className="flex flex-col gap-1.5 w-full max-w-65 pt-2">
              <button
                type="button"
                onClick={() => handleSend("Where is authentication handled?")}
                className="w-full text-left p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] transition-colors cursor-pointer"
              >
                Where is authentication handled?
              </button>
              <button
                type="button"
                onClick={() => handleSend("What are the registered routes?")}
                className="w-full text-left p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] transition-colors cursor-pointer"
              >
                What are the registered routes?
              </button>
              <button
                type="button"
                onClick={() => handleSend("What are the key starting points?")}
                className="w-full text-left p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] transition-colors cursor-pointer"
              >
                What are the key starting points?
              </button>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="space-y-1.5 animate-[fadeIn_0.2s_ease-out]">
              {m.role === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] px-2.5 py-1.5 rounded-xs bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-sans text-xs leading-relaxed whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {/* Tool calls rendered visible above the answer */}
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="space-y-1">
                      {m.toolCalls.map((tc, idx) => {
                        const argsStr = tc.args ? JSON.stringify(tc.args) : "";
                        return (
                          <div
                            key={tc.id || idx}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-xs bg-zinc-100/80 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 font-mono text-[10px]"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                tc.status === "running"
                                  ? "bg-amber-500 animate-pulse"
                                  : tc.status === "error"
                                  ? "bg-red-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              {tc.name}
                            </span>
                            {argsStr && (
                              <span className="text-zinc-400 dark:text-zinc-500 truncate max-w-45">
                                {argsStr}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Assistant response body */}
                  {m.content ? (
                    <div className="px-2.5 py-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-zinc-900 dark:text-zinc-100 font-sans text-xs leading-relaxed whitespace-pre-wrap selection:bg-zinc-200 dark:selection:bg-zinc-700">
                      {renderFormattedMessage(m.content, onSelectFile)}
                    </div>
                  ) : m.isStreaming ? (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 text-zinc-400 dark:text-zinc-500 font-mono text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse" />
                      <span>Inspecting graph...</span>
                    </div>
                  ) : !m.error ? (
                    <div className="px-2.5 py-1.5 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-zinc-400 dark:text-zinc-500 font-mono text-[10px]">
                      No response returned by agent.
                    </div>
                  ) : null}

                  {m.error && (
                    <div className="px-2.5 py-1.5 rounded-xs border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-mono text-[10px]">
                      {m.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input box */}
      <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
        <div className="relative flex items-center border border-zinc-300 dark:border-zinc-700 rounded-xs bg-zinc-50/50 dark:bg-zinc-900/60 focus-within:ring-1 focus-within:ring-(--pg-accent) focus-within:border-(--pg-accent)">
          <textarea
            ref={inputRef}
            rows={1}
            value={inputValue}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder={isLoading ? "Agent working..." : "Ask repository question (Enter)..."}
            className="w-full resize-none bg-transparent px-2.5 py-2 text-xs font-sans text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none max-h-24 scrollbar-thin"
          />
          {(isFocused || isLoading) && (
            <BorderTrail size={25} duration={3} color="rgba(37, 99, 235, 0.75)" />
          )}
          <ClickSpark sparkColor="#3b82f6" sparkRadius={16} sparkCount={8}>
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={isLoading || !inputValue.trim()}
              className="mr-1.5 px-2 py-1 rounded-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-mono text-[10px] font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.97] cursor-pointer shrink-0 transition-all"
            >
              Ask
            </button>
          </ClickSpark>
        </div>
      </div>
    </div>
  );
}

/** Formats response text, highlighting monospace file paths and making them clickable */
function renderFormattedMessage(
  text: string,
  onSelectFile?: (path: string) => void
): React.ReactNode {
  // Matches inline code `file/path.ext` or path-like substrings
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      const inner = part.slice(1, -1);
      const isPath = inner.includes("/") || inner.includes(".");
      return (
        <code
          key={i}
          onClick={() => {
            if (isPath && onSelectFile) {
              onSelectFile(inner);
            }
          }}
          className={`font-mono px-1 py-0.5 rounded-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[11px] ${
            isPath && onSelectFile
              ? "cursor-pointer hover:underline hover:text-(--pg-accent)"
              : ""
          }`}
          title={isPath && onSelectFile ? `Select ${inner} on canvas` : undefined}
        >
          {inner}
        </code>
      );
    }
    return part;
  });
}
