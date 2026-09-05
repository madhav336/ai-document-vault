"use client";

import React, { useEffect, useRef } from "react";
import { ChatMessage, ChatSource } from "../app/types";

/** "p. 6" for one page, "pp. 5–6" for a contiguous span, "pp. 5, 9" otherwise. */
function formatPages(pages: number[] | undefined): string | null {
  if (!pages || pages.length === 0) return null;
  if (pages.length === 1) return `p. ${pages[0]}`;
  const isContiguous = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  if (isContiguous) return `pp. ${pages[0]}–${pages[pages.length - 1]}`;
  return `pp. ${pages.join(", ")}`;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
  /** Opens a cited item in the detail panel. */
  onSelectSource: (id: number) => void;
}

/**
 * Renders the transcript itself — deliberately separate from whatever surface
 * hosts it, so the message/citation markup has exactly one definition.
 */
export default function ChatMessages({ messages, isLoading, onSelectSource }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col gap-7">
      {messages.map((msg, idx) =>
        msg.role === "user" ? (
          <UserMessage key={idx} content={msg.content} />
        ) : (
          <AssistantMessage
            key={idx}
            content={msg.content}
            sources={msg.sources}
            onSelectSource={onSelectSource}
          />
        )
      )}

      {isLoading && (
        <div className="flex items-start gap-3">
          <AssistantAvatar />
          <div className="flex items-center gap-2 pt-1.5 text-[13px] text-(--text-muted)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" style={{ animation: "spin 0.8s linear infinite" }} aria-hidden="true">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Searching your vault…
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/15" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl border border-(--border) bg-(--surface) px-4 py-2.5 text-[14px] leading-relaxed text-(--text)">
        {content}
      </div>
    </div>
  );
}

function AssistantMessage({
  content,
  sources,
  onSelectSource,
}: {
  content: string;
  sources?: ChatSource[];
  onSelectSource: (id: number) => void;
}) {
  // Only surface the sources the model actually cited, not everything retrieval
  // happened to return.
  const citedIndices = new Set(
    Array.from(content.matchAll(/\[(\d+)\]/g)).map(m => parseInt(m[1], 10))
  );
  const citedSources = (sources || [])
    .map((src, i) => ({ src, index: i + 1 }))
    .filter(item => citedIndices.has(item.index));

  return (
    <div className="flex items-start gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-[1.75] text-(--text)">
          {renderFormattedText(content, sources, onSelectSource)}
        </div>

        {citedSources.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-(--text-muted)">
              Sources
            </span>
            {citedSources.map(({ src, index }) => {
              const label = src.title || src.file_name || "Source";
              const pageLabel = formatPages(src.cited_pages);
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => onSelectSource(src.id)}
                  title={pageLabel ? `${label} — ${pageLabel}` : label}
                  className="focus-ring inline-flex max-w-60 cursor-pointer items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface) px-2 py-1 text-[11px] text-(--text-secondary) outline-none transition-colors duration-150 hover:border-(--accent)/40 hover:text-(--text)"
                >
                  <span className="font-bold text-(--accent)">{index}</span>
                  <span className="truncate">{label}</span>
                  {pageLabel && (
                    <span className="shrink-0 font-medium text-(--text-muted)">{pageLabel}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Minimal markdown: bold, bullets, and [n] citations wired back to their source.
 */
function renderFormattedText(
  text: string,
  sources: ChatSource[] | undefined,
  onSelectSource: (id: number) => void
) {
  if (!text) return null;

  return text.split("\n").map((line, lineIdx) => {
    let cleanLine = line;
    let isBullet = false;

    const trimmed = cleanLine.trim();
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      isBullet = true;
      const markerIndex = cleanLine.indexOf(trimmed.startsWith("* ") ? "*" : "-");
      cleanLine = cleanLine.substring(markerIndex + 2);
    }

    const elements: React.ReactNode[] = [];
    const tokens = cleanLine.split(/(\*\*.*?\*\*|\[\d+\])/g);

    tokens.forEach((token, tIdx) => {
      if (token.startsWith("**") && token.endsWith("**")) {
        elements.push(
          <strong key={tIdx} className="font-semibold text-(--text)">
            {token.slice(2, -2)}
          </strong>
        );
        return;
      }

      if (token.startsWith("[") && token.endsWith("]")) {
        const num = parseInt(token.slice(1, -1), 10);
        const source = sources && num > 0 && num <= sources.length ? sources[num - 1] : null;
        if (source) {
          const srcLabel = source.title || source.file_name || "Source";
          const srcPages = formatPages(source.cited_pages);
          elements.push(
            <button
              key={tIdx}
              type="button"
              onClick={() => onSelectSource(source.id)}
              title={srcPages ? `${srcLabel} — ${srcPages}` : srcLabel}
              className="focus-ring mx-0.5 inline-flex cursor-pointer items-center rounded border-none bg-(--accent)/20 px-[5px] align-super text-[10px] font-bold text-(--accent) outline-none hover:bg-(--accent)/35"
            >
              {num}
            </button>
          );
        } else {
          elements.push(token);
        }
        return;
      }

      elements.push(token);
    });

    if (isBullet) {
      return (
        <div key={lineIdx} className="mb-1.5 ml-3 flex gap-2">
          <span className="text-(--accent)" aria-hidden="true">•</span>
          <div>{elements}</div>
        </div>
      );
    }

    return (
      <div key={lineIdx} className={`mb-2 ${cleanLine.trim() === "" ? "min-h-2" : ""}`}>
        {elements}
      </div>
    );
  });
}
