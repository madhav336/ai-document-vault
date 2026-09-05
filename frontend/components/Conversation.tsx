"use client";

import React, { useMemo } from "react";
import { ChatMessage } from "../app/types";
import ChatMessages from "./ChatMessages";
import { RankedTag } from "./Composer";

interface ConversationProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSelectSource: (id: number) => void;
  onBackToVault: () => void;
  onNewConversation: () => void;
  onUseSuggestion: (prompt: string) => void;
  rankedTags: RankedTag[];
  categories: string[];
  itemCount: number;
}

export default function Conversation({
  messages,
  isLoading,
  onSelectSource,
  onBackToVault,
  onNewConversation,
  onUseSuggestion,
  rankedTags,
  categories,
  itemCount,
}: ConversationProps) {
  // Suggestions are built from what is actually in this vault, so they never
  // propose a topic the user has nothing saved about.
  const suggestions = useMemo(() => {
    const out: string[] = [];
    const topTag = rankedTags[0]?.tag;
    const realCategories = categories.filter(c => c !== "All");

    if (topTag) out.push(`What have I saved about ${topTag}?`);
    if (realCategories[0]) out.push(`Summarise everything in ${realCategories[0]}`);
    if (rankedTags[1]?.tag) out.push(`How does ${rankedTags[1].tag} relate to ${topTag}?`);
    out.push("What are the main themes across my vault?");

    return out.slice(0, 3);
  }, [rankedTags, categories]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-(--border) pb-3.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-bold tracking-[-0.2px] text-(--text)">Ask your vault</h2>
          <span className="text-[11px] text-(--text-muted)">
            grounded in {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onNewConversation}
              className="focus-ring cursor-pointer rounded-lg border border-(--border) bg-(--surface) px-2.5 py-1 text-[12px] font-medium text-(--text-secondary) outline-none transition-colors duration-150 hover:border-(--border-strong) hover:text-(--text)"
            >
              New conversation
            </button>
          )}
          <button
            type="button"
            onClick={onBackToVault}
            className="focus-ring flex cursor-pointer items-center gap-1.5 rounded-lg border border-(--border) bg-(--surface) px-2.5 py-1 text-[12px] font-medium text-(--text-secondary) outline-none transition-colors duration-150 hover:border-(--border-strong) hover:text-(--text)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to vault
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
        {messages.length === 0 && !isLoading ? (
          <div className="pt-6">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-(--text-muted)">
              Try asking
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onUseSuggestion(prompt)}
                  className="focus-ring w-full cursor-pointer rounded-xl border border-(--border) bg-(--surface) px-4 py-3 text-left text-[13px] text-(--text-secondary) outline-none transition-colors duration-150 hover:border-(--accent)/40 hover:bg-(--surface-hover) hover:text-(--text)"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <p className="mt-5 max-w-140 text-[12px] leading-relaxed text-(--text-muted)">
              Answers are built only from passages retrieved out of your own items — if nothing
              relevant clears the similarity threshold, it says so rather than guessing.
            </p>
          </div>
        ) : (
          <ChatMessages messages={messages} isLoading={isLoading} onSelectSource={onSelectSource} />
        )}
      </div>
    </div>
  );
}
