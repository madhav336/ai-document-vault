"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ComposerMode = "browse" | "ask";

export const SEARCH_INPUT_ID = "vault-composer-input";
const ACCEPT_UPLOAD = ".pdf,.txt,.md,.markdown,.docx";
const MAX_INPUT_HEIGHT = 200;
const TAG_CHIP_LIMIT = 8;

export interface RankedTag {
  tag: string;
  count: number;
}

interface ComposerProps {
  mode: ComposerMode;
  setMode: (mode: ComposerMode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  onSubmitAsk: () => void;
  isChatLoading: boolean;
  rankedTags: RankedTag[];
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  onOpenAdd: () => void;
  onUploadFiles: (files: File[]) => void;
  isMobile: boolean;
  itemCount: number;
  /**
   * "hero" is the landing treatment (mode toggle, headline, tag chips).
   * "docked" is the slim bar that sits under a running conversation, where the
   * headline would just be pushing the transcript off screen.
   */
  variant?: "hero" | "docked";
}

export default function Composer({
  mode,
  setMode,
  searchQuery,
  setSearchQuery,
  chatInput,
  setChatInput,
  onSubmitAsk,
  isChatLoading,
  rankedTags,
  selectedTag,
  setSelectedTag,
  onOpenAdd,
  onUploadFiles,
  isMobile,
  itemCount,
  variant = "hero",
}: ComposerProps) {
  const isDocked = variant === "docked";
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const isAsk = mode === "ask";
  // Each mode keeps its own text, so flipping the toggle never destroys what
  // you had typed in the other one.
  const value = isAsk ? chatInput : searchQuery;

  const setValue = (next: string) => {
    if (isAsk) setChatInput(next);
    else setSearchQuery(next);
  };

  /* Auto-grow: the field starts one line tall and expands to fit, capped so a
     pasted paragraph can't push the vault off screen. */
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value, mode]);

  /* "/" focuses the composer from anywhere, matching the old search shortcut. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* Dismiss the "+" menu on outside click or Escape. */
  useEffect(() => {
    if (!isAddMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setIsAddMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isAddMenuOpen]);

  const canSubmit = isAsk && chatInput.trim().length > 0 && !isChatLoading;

  const submit = () => {
    if (!canSubmit) return;
    onSubmitAsk();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      inputRef.current?.blur();
      return;
    }
    // Shift+Enter is a newline; plain Enter sends. In browse mode there is
    // nothing to send — results already update as you type.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isAsk) submit();
    }
  };

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setIsAddMenuOpen(false);
    if (files.length) onUploadFiles(files);
  };

  /* A tag means something different in each mode: a filter when browsing, the
     subject of a question when asking. Same chips, both jobs. */
  const handleTagClick = (tag: string) => {
    if (isAsk) {
      setChatInput(`What have I saved about ${tag}?`);
      inputRef.current?.focus();
    } else {
      setSelectedTag(selectedTag === tag ? null : tag);
    }
  };

  const headline = isAsk
    ? "Ask across everything you've saved"
    : itemCount > 0
      ? "What's in your vault?"
      : "Your vault is ready";

  const subline = isAsk
    ? "Answers are grounded in your own documents, with citations back to the source."
    : "Search by meaning, not just keywords — or drop in a document to add it.";

  const visibleTags = rankedTags.slice(0, TAG_CHIP_LIMIT);

  return (
    <div
      className={
        isDocked
          ? "mx-auto w-full max-w-180 shrink-0 pt-1"
          : `mx-auto mb-9 w-full max-w-180 ${isMobile ? "pt-1" : "pt-4"}`
      }
    >
      {/* ── Mode toggle ─────────────────────────────────────────────────── */}
      <div className={`mb-7 flex justify-center ${isDocked ? "hidden" : ""}`}>
        <div
          role="group"
          aria-label="Composer mode"
          className="inline-flex items-center gap-1 rounded-full border border-(--border) bg-(--surface) p-1"
        >
          {(
            [
              { value: "browse", label: "Browse", hint: "Semantic search across your vault" },
              { value: "ask", label: "Ask", hint: "RAG chat grounded in your documents" },
            ] as const
          ).map(opt => {
            const active = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setMode(opt.value);
                  inputRef.current?.focus();
                }}
                aria-pressed={active}
                title={opt.hint}
                className={`focus-ring cursor-pointer rounded-full px-4 py-1.5 text-[13px] font-semibold outline-none transition-colors duration-150 ${
                  active
                    ? "bg-(--accent) text-(--on-accent)"
                    : "bg-transparent text-(--text-secondary) hover:text-(--text)"
                }`}
              >
                {opt.value === "ask" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mr-1.5 inline-block align-[-1px]">
                    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
                  </svg>
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Headline ────────────────────────────────────────────────────── */}
      {!isDocked && (
        <>
          <h1
            className={`mb-2 text-center font-bold tracking-[-0.8px] text-(--text) ${
              isMobile ? "text-[24px]" : "text-[32px]"
            }`}
          >
            {headline}
          </h1>
          <p className="mx-auto mb-6 max-w-140 text-center text-[13px] leading-relaxed text-(--text-secondary)">
            {subline}
          </p>
        </>
      )}

      {/* ── Composer ────────────────────────────────────────────────────── */}
      <div
        className="flex items-end gap-2 rounded-[22px] border border-(--border) bg-(--composer-bg) px-3 py-2.5 shadow-(--shadow-sm) transition-[border-color,box-shadow] duration-150 focus-within:border-(--accent) focus-within:shadow-(--shadow-glow)"
      >
        {/* "+" — add to the vault without leaving the composer */}
        <div ref={addMenuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsAddMenuOpen(v => !v)}
            aria-label="Add to your vault"
            aria-haspopup="menu"
            aria-expanded={isAddMenuOpen}
            className="focus-ring flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-(--border) bg-(--surface) text-(--text-secondary) outline-none transition-colors duration-150 hover:border-(--border-strong) hover:text-(--text)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {isAddMenuOpen && (
            <div
              role="menu"
              className="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-(--border) bg-(--surface-overlay) py-1 shadow-(--shadow-lg)"
              style={{ animation: "fadeUp var(--transition-fast) both" }}
            >
              <button
                role="menuitem"
                onClick={() => fileInputRef.current?.click()}
                className="focus-ring flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3.5 py-2.5 text-left text-[13px] text-(--text-secondary) outline-none hover:bg-(--surface-hover) hover:text-(--text)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Upload a document
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setIsAddMenuOpen(false);
                  onOpenAdd();
                }}
                className="focus-ring flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3.5 py-2.5 text-left text-[13px] text-(--text-secondary) outline-none hover:bg-(--surface-hover) hover:text-(--text)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Save a link
              </button>
              <div className="border-t border-(--border) px-3.5 pb-1.5 pt-2 text-[10px] leading-snug text-(--text-muted)">
                PDF, TXT, Markdown, or Word — or just drop a file anywhere on the page.
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_UPLOAD}
            onChange={handlePickFiles}
            className="hidden"
          />
        </div>

        {/* The one input for both jobs */}
        <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
          {isAsk ? "Ask a question about your vault" : "Search your vault"}
        </label>
        <textarea
          ref={inputRef}
          id={SEARCH_INPUT_ID}
          rows={1}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isAsk ? "Ask anything about your documents…" : "Search your vault by meaning…"}
          className="max-h-50 flex-1 resize-none self-center border-none bg-transparent py-1.5 text-[15px] leading-6 text-(--text) outline-none placeholder:text-(--text-muted)"
        />

        {/* "/" hint while browsing an untouched field; send button while asking */}
        {isAsk ? (
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            aria-label="Send question"
            className={`focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none outline-none transition-colors duration-150 ${
              canSubmit
                ? "cursor-pointer bg-(--accent) text-(--on-accent)"
                : "cursor-not-allowed bg-(--chip-bg) text-(--text-muted)"
            }`}
          >
            {isChatLoading ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: "spin 0.8s linear infinite" }} aria-hidden="true">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            )}
          </button>
        ) : (
          <div className="flex h-9 shrink-0 items-center gap-1.5 pr-1">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="focus-ring flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-(--text-muted) outline-none hover:bg-(--surface-hover) hover:text-(--text)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            {!isMobile && !searchQuery && (
              <span
                aria-hidden="true"
                className="select-none rounded border border-(--border-strong) bg-(--bg) px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted)"
              >
                /
              </span>
            )}
          </div>
        )}
      </div>

      {isDocked && (
        <p className="mt-2 text-center text-[11px] text-(--text-muted)">
          Enter to send · Shift+Enter for a new line
        </p>
      )}

      {/* ── Tag chips ───────────────────────────────────────────────────── */}
      {!isDocked && visibleTags.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5">
          {visibleTags.map(({ tag, count }) => {
            const active = !isAsk && selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagClick(tag)}
                aria-pressed={isAsk ? undefined : active}
                title={isAsk ? `Ask about ${tag}` : `Filter by ${tag} · ${count} item${count === 1 ? "" : "s"}`}
                className={`focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] outline-none transition-colors duration-150 ${
                  active
                    ? "border-(--accent) bg-(--accent) font-semibold text-(--on-accent)"
                    : "border-(--border) bg-(--surface) font-medium text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text)"
                }`}
              >
                {isAsk && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                )}
                {tag}
                {!isAsk && <span className={active ? "opacity-70" : "text-(--text-muted)"}>{count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
