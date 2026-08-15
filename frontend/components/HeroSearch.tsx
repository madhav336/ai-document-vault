import React, { useEffect, useRef, useState } from "react";

interface HeroSearchProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  isMobile: boolean;
}

export default function HeroSearch({
  searchQuery,
  setSearchQuery,
  isChatOpen,
  setIsChatOpen,
  isMobile,
}: HeroSearchProps) {
  const [searchMode, setSearchMode] = useState<"search" | "chat">("search");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Wire keyboard shortcut "/" to focus search, and "Escape" to blur
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus on "/" if no inputs/textareas are active
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleToggleMode = () => {
    const nextMode = searchMode === "search" ? "chat" : "search";
    setSearchMode(nextMode);
    if (nextMode === "chat") {
      setIsChatOpen(true);
    }
  };

  // Sync mode if chat is toggled elsewhere
  useEffect(() => {
    requestAnimationFrame(() => {
      if (isChatOpen) {
        setSearchMode("chat");
      } else {
        setSearchMode("search");
      }
    });
  }, [isChatOpen]);

  const placeholderText =
    searchMode === "chat"
      ? "Ask a question across all your bookmarks..."
      : "Search your vault, or type '/' to focus...";

  return (
    <div
      className={`relative mx-auto mb-8 w-full max-w-170 ${isMobile ? "px-4" : "px-0"}`}
    >
      <div className="flex items-center rounded-[14px] border border-(--border) bg-(--surface) px-4 py-3 transition-[border-color,box-shadow] duration-150 focus-within:border-(--accent) focus-within:shadow-(--shadow-glow)">
        {/* Toggle Mode Icon */}
        <button
          onClick={handleToggleMode}
          title={searchMode === "search" ? "Switch to Chat Assistant" : "Switch to Keyword Search"}
          aria-label={searchMode === "search" ? "Switch to chat assistant" : "Switch to keyword search"}
          className="focus-ring flex cursor-pointer items-center justify-center rounded-md p-1 text-(--text-muted) outline-none transition-colors duration-150 hover:text-(--accent)"
        >
          {searchMode === "search" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-(--accent)" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </button>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          aria-label={searchMode === "chat" ? "Ask a question about your vault" : "Search your vault"}
          value={searchMode === "chat" ? "" : searchQuery}
          onChange={e => {
            if (searchMode === "search") {
              setSearchQuery(e.target.value);
            }
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && searchMode === "chat") {
              // Trigger chat drawer with search bar text as message
              setIsChatOpen(true);
            }
          }}
          placeholder={placeholderText}
          className="ml-3 flex-1 border-none bg-transparent text-(length:--text-lg) text-(--text) outline-none"
        />

        {/* Help tooltip badge */}
        {!isMobile && (
          <span
            aria-hidden="true"
            className="ml-2 shrink-0 select-none rounded-sm border border-(--text-muted)/25 bg-(--bg) px-1.5 py-0.5 text-[10px] font-medium text-(--text-muted)"
          >
            /
          </span>
        )}
      </div>
    </div>
  );
}
