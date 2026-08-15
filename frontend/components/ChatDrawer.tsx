import React, { useEffect, useRef } from "react";
import { Bookmark, ChatMessage } from "../app/types";
import IconButton from "./ui/IconButton";

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (val: string) => void;
  isChatLoading: boolean;
  isMobile: boolean;
  sendChatMessage: () => void;
}

export default function ChatDrawer({
  isOpen,
  onClose,
  chatMessages,
  chatInput,
  setChatInput,
  isChatLoading,
  isMobile,
  sendChatMessage,
}: ChatDrawerProps) {
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isChatLoading]);

  if (!isOpen) return null;

  const renderFormattedText = (text: string, sources?: Bookmark[]) => {
    if (!text) return null;
    const lines = text.split("\n");

    return lines.map((line, lineIdx) => {
      let cleanLine = line;
      let isBullet = false;

      // Detect bullet point: starts with "* " or "- "
      if (cleanLine.trim().startsWith("* ") || cleanLine.trim().startsWith("- ")) {
        isBullet = true;
        // Strip out the bullet marker
        const markerIndex = cleanLine.indexOf(cleanLine.trim().startsWith("* ") ? "*" : "-");
        cleanLine = cleanLine.substring(markerIndex + 2);
      }

      // Parse bold tags "**bold**" and citations "[1]" inside the line
      const elements: React.ReactNode[] = [];
      const regex = /(\*\*.*?\*\*|\[\d+\])/g;
      const tokens = cleanLine.split(regex);

      tokens.forEach((token, tIdx) => {
        if (token.startsWith("**") && token.endsWith("**")) {
          const boldText = token.slice(2, -2);
          elements.push(
            <strong key={tIdx} className="font-semibold text-(--text)">
              {boldText}
            </strong>
          );
        } else if (token.startsWith("[") && token.endsWith("]")) {
          const sourceNum = parseInt(token.slice(1, -1), 10);
          if (sources && sourceNum > 0 && sourceNum <= sources.length) {
            const source = sources[sourceNum - 1];
            const citeClass = "mx-0.5 inline-flex items-center rounded align-super text-[10px] font-bold no-underline";
            const citeStyle = { background: "color-mix(in srgb, var(--accent) 20%, transparent)", color: "var(--accent)", padding: "1px 5px" };
            const citeTitle = source.title || source.file_name || "Source";
            elements.push(
              source.url ? (
                <a key={tIdx} href={source.url} target="_blank" rel="noreferrer" title={citeTitle} className={citeClass} style={citeStyle}>
                  {sourceNum}
                </a>
              ) : (
                <span key={tIdx} title={citeTitle} className={citeClass} style={citeStyle}>
                  {sourceNum}
                </span>
              )
            );
          } else {
            elements.push(token);
          }
        } else {
          elements.push(token);
        }
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
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-200 flex justify-end backdrop-blur-sm"
      style={{ background: "rgba(0, 0, 0, 0.4)", animation: "fadeIn 0.2s ease-out" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`flex h-full flex-col border-l border-(--border) bg-(--surface-overlay) shadow-(--shadow-lg) ${isMobile ? "w-full" : "w-105"}`}
        style={{ animation: "slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-(--border) px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-(--accent)/18">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="m-0 text-base font-bold text-(--text)">AI Assistant</h3>
              <p className="m-0 mt-0.5 text-[11px] text-(--text-muted)">Ask about your vault</p>
            </div>
          </div>
          <IconButton onClick={onClose} aria-label="Close chat" className="rounded-full">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </IconButton>
        </div>

        {/* Message History area */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
          {chatMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-5 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] border border-(--accent)/20 bg-(--accent)/10 text-(--accent)">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h4 className="mb-1.5 text-sm font-semibold text-(--text)">Start a conversation</h4>
              <p className="mb-5 max-w-65 text-xs leading-[1.6] text-(--text-muted)">
                Ask questions using information across all your saved bookmark pages.
              </p>

              {/* Suggestions */}
              <div className="flex w-full flex-col gap-2">
                {[
                  "What tech stack references do I have?",
                  "Summarize my DevOps bookmarks",
                  "Find any resources about database designs",
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => {
                      setChatInput(prompt);
                    }}
                    className="focus-ring w-full rounded-[10px] border border-(--border) bg-(--surface) px-3.5 py-2.5 text-left text-xs text-(--text-secondary) outline-none transition-colors duration-150 hover:border-(--accent)/30 hover:bg-(--surface-hover)"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex max-w-[85%] flex-col ${msg.role === "user" ? "items-end self-end" : "items-start self-start"}`}
                >
                  {/* Bubble */}
                  <div
                    className={`whitespace-pre-wrap rounded-[14px] px-4 py-3 text-[13px] leading-[1.6] text-(--text) ${
                      msg.role === "user"
                        ? "border border-(--border) bg-(--surface)"
                        : "border border-(--accent)/25 bg-(--accent)/12"
                    }`}
                  >
                    {msg.role === "model" ? renderFormattedText(msg.content, msg.sources) : msg.content}
                  </div>

                  {/* References / Sources list */}
                  {msg.sources && msg.sources.length > 0 && (() => {
                    const citedIndices = new Set(
                      Array.from(msg.content.matchAll(/\[(\d+)\]/g)).map(match => parseInt(match[1], 10))
                    );

                    const citedSources = msg.sources
                      .map((src, sIdx) => ({ src, originalIdx: sIdx + 1 }))
                      .filter(item => citedIndices.has(item.originalIdx));

                    if (citedSources.length === 0) return null;

                    return (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
                        <span className="mr-1 self-center text-[10px] text-(--text-muted)">SOURCES:</span>
                        {citedSources.map(({ src, originalIdx }) => {
                          const label = src.title || src.file_name || "Source";
                          const chipClass = "inline-flex items-center gap-1 rounded-md border border-(--border) bg-(--surface) px-2 py-0.5 text-[10px] text-(--text-secondary) no-underline transition-colors duration-150 hover:border-(--accent)/40 hover:bg-(--surface-hover)";
                          const inner = (
                            <>
                              <span className="font-bold text-(--accent)">{originalIdx}</span>
                              <span className="max-w-32 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
                            </>
                          );
                          return src.url ? (
                            <a key={src.id} href={src.url} target="_blank" rel="noreferrer" className={`focus-ring outline-none ${chipClass}`}>
                              {inner}
                            </a>
                          ) : (
                            <span key={src.id} className={chipClass} title={label}>{inner}</span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ))}

              {isChatLoading && (
                <div className="flex items-center gap-2 self-start rounded-xl border border-(--accent)/15 bg-(--accent)/6 px-3.5 py-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" style={{ animation: "spin 0.8s linear infinite" }} aria-hidden="true">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span className="text-xs text-(--text-muted)">Analyzing context...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* Input Bar */}
        <div className="flex items-center gap-2.5 border-t border-(--border) px-6 py-5">
          <label htmlFor="chat-input" className="sr-only">Ask a question about your bookmarks</label>
          <input
            id="chat-input"
            placeholder="Ask a question about your bookmarks..."
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            disabled={isChatLoading}
            onKeyDown={e => {
              if (e.key === "Enter" && chatInput.trim() && !isChatLoading) {
                sendChatMessage();
              }
            }}
            className="focus-ring flex-1 rounded-xl border border-(--border) bg-(--surface) px-3.5 py-2.5 text-[13px] text-(--text) outline-none"
          />
          <button
            onClick={sendChatMessage}
            disabled={!chatInput.trim() || isChatLoading}
            aria-label="Send message"
            className={`focus-ring flex h-9 w-9 items-center justify-center rounded-[10px] border outline-none transition-colors duration-150 disabled:cursor-not-allowed ${
              chatInput.trim() && !isChatLoading
                ? "cursor-pointer border-transparent text-white"
                : "cursor-not-allowed border-(--border) bg-(--surface) text-(--text-muted)"
            }`}
            style={chatInput.trim() && !isChatLoading ? { background: "linear-gradient(135deg, #8b5cf6, #6366f1)" } : undefined}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
