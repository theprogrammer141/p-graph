"use client";

import React, { useMemo } from "react";

interface ExplanationRendererProps {
  readonly content: string;
  readonly knownFiles: ReadonlySet<string>;
  readonly onSelectFile: (path: string) => void;
}

type InlineSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "bold"; text: string };

type Block =
  | { kind: "paragraph"; segments: InlineSegment[] }
  | { kind: "bullet"; segments: InlineSegment[] };

/**
 * Parses inline formatting for bold (**...**) and inline code (`...`).
 * Strictly removes any stray unclosed backticks, asterisks, or hash symbols.
 */
function parseInline(raw: string): InlineSegment[] {
  // Strip any stray hash symbols first
  const sanitized = raw.replace(/#/g, "");
  const segments: InlineSegment[] = [];

  // Match either `code` or **bold**
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sanitized)) !== null) {
    if (match.index > lastIndex) {
      const plainText = sanitized
        .slice(lastIndex, match.index)
        .replace(/[`*]/g, ""); // Strip any stray backticks or asterisks
      if (plainText) {
        segments.push({ kind: "text", text: plainText });
      }
    }

    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      segments.push({ kind: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**") && token.endsWith("**")) {
      segments.push({ kind: "bold", text: token.slice(2, -2) });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < sanitized.length) {
    const trailing = sanitized.slice(lastIndex).replace(/[`*]/g, "");
    if (trailing) {
      segments.push({ kind: "text", text: trailing });
    }
  }

  return segments;
}

/**
 * Renders an inline text segment, turning any known repository file paths into interactive links.
 */
function RenderSegment({
  segment,
  knownFiles,
  onSelectFile,
}: {
  segment: InlineSegment;
  knownFiles: ReadonlySet<string>;
  onSelectFile: (path: string) => void;
}) {
  const parts = useMemo(() => {
    const text = segment.text;
    // Match potential file paths (alphanumeric, slashes, dashes, dots)
    const pathRegex = /[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+/g;
    const items: Array<{ isPath: boolean; text: string }> = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = pathRegex.exec(text)) !== null) {
      const candidate = m[0].replace(/^[.,:;()]+|[.,:;()]+$/g, "");
      const index = text.indexOf(candidate, last);

      if (knownFiles.has(candidate)) {
        if (index > last) {
          items.push({ isPath: false, text: text.slice(last, index) });
        }
        items.push({ isPath: true, text: candidate });
        last = index + candidate.length;
        pathRegex.lastIndex = last;
      }
    }

    if (last < text.length) {
      items.push({ isPath: false, text: text.slice(last) });
    }

    return items.length > 0 ? items : [{ isPath: false, text }];
  }, [segment.text, knownFiles]);

  const renderedContent = parts.map((p, idx) => {
    if (p.isPath) {
      return (
        <button
          key={idx}
          type="button"
          onClick={() => onSelectFile(p.text)}
          title={`Select ${p.text} in graph`}
          className="font-mono text-(--pg-accent) hover:underline cursor-pointer font-medium inline-block text-left"
        >
          {p.text}
        </button>
      );
    }
    return <React.Fragment key={idx}>{p.text}</React.Fragment>;
  });

  if (segment.kind === "code") {
    return (
      <code className="px-1 py-0.5 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 font-mono text-[10.5px] text-zinc-900 dark:text-zinc-100">
        {renderedContent}
      </code>
    );
  }

  if (segment.kind === "bold") {
    return (
      <strong className="font-semibold text-zinc-950 dark:text-zinc-50">
        {renderedContent}
      </strong>
    );
  }

  return <>{renderedContent}</>;
}

/**
 * Renders explanation prose with strictly permitted formatting: inline code, bullets, and bold.
 * Headings are stripped. Known repo paths become links that move the map.
 * Stray backticks, asterisks, and hash symbols are purged.
 */
export function ExplanationRenderer({
  content,
  knownFiles,
  onSelectFile,
}: ExplanationRendererProps) {
  const blocks = useMemo(() => {
    const rawLines = content.split(/\r?\n/);
    const result: Block[] = [];

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // Strip headings (#, ##, ###)
      const lineWithoutHeadings = trimmed.replace(/^#+\s*/, "");

      // Check for bullet list item
      const bulletMatch = lineWithoutHeadings.match(/^[-*•]\s+(.*)$/);
      if (bulletMatch) {
        result.push({
          kind: "bullet",
          segments: parseInline(bulletMatch[1]),
        });
      } else {
        result.push({
          kind: "paragraph",
          segments: parseInline(lineWithoutHeadings),
        });
      }
    }

    return result;
  }, [content]);

  return (
    <div className="space-y-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
      {blocks.map((block, idx) => {
        if (block.kind === "bullet") {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-zinc-400 dark:text-zinc-500 select-none shrink-0 leading-normal">
                •
              </span>
              <div className="flex-1 min-w-0">
                {block.segments.map((seg, sIdx) => (
                  <RenderSegment
                    key={sIdx}
                    segment={seg}
                    knownFiles={knownFiles}
                    onSelectFile={onSelectFile}
                  />
                ))}
              </div>
            </div>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {block.segments.map((seg, sIdx) => (
              <RenderSegment
                key={sIdx}
                segment={seg}
                knownFiles={knownFiles}
                onSelectFile={onSelectFile}
              />
            ))}
          </p>
        );
      })}
    </div>
  );
}
