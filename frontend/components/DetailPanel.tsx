import React from "react";
import { useAuth } from "@clerk/nextjs";
import { Bookmark } from "../app/types";
import IconButton from "./ui/IconButton";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface DetailPanelProps {
  isOpen: boolean;
  bookmark: Bookmark | null;
  onClose: () => void;
  onOpenEdit: (b: Bookmark) => void;
  onToggleArchive: (id: number) => void;
  onDelete: (id: number) => void;
  onAskAboutThis: (title: string) => void;
  getCategoryColor: (cat: string) => string;
  isMobile: boolean;
  relatedBookmarks: Bookmark[];
  isRelatedLoading: boolean;
  onSelectBookmark: (id: number) => void;
  onReanalyze: (id: number) => void;
  reanalyzingId: number | null;
}

const labelClass = "mb-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]";
const dividerClass = "my-5 h-px bg-[var(--border)]";
const actionBtnClass =
  "focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] outline-none transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

export default function DetailPanel({
  isOpen,
  bookmark,
  onClose,
  onOpenEdit,
  onToggleArchive,
  onDelete,
  onAskAboutThis,
  getCategoryColor,
  isMobile,
  relatedBookmarks,
  isRelatedLoading,
  onSelectBookmark,
  onReanalyze,
  reanalyzingId,
}: DetailPanelProps) {
  const { getToken } = useAuth();
  if (!isOpen || !bookmark) return null;

  const isReanalyzing = reanalyzingId === bookmark.id;
  const isProcessing = bookmark.status === "processing";
  const categoryColor = getCategoryColor(bookmark.category);

  const getDomain = (urlStr: string | null) => {
    if (!urlStr) return "";
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname.replace("www.", "");
    } catch {
      return "";
    }
  };

  const isUrl = (bookmark.source_type ?? "url") === "url";
  const domain = getDomain(bookmark.url);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  const openOriginal = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/documents/${bookmark.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      // non-critical
    }
  };

  const content = (
    <div
      onClick={e => e.stopPropagation()}
      className={
        isMobile
          ? "flex h-full w-full flex-col border-l border-(--border) bg-(--surface-overlay) shadow-(--shadow-lg)"
          : "fixed bottom-0 right-0 top-0 z-90 flex w-105 flex-col border-l border-(--border) bg-(--surface-overlay) shadow-(--shadow-lg)"
      }
      style={{ animation: "slideInRight var(--transition-smooth) both", height: "100%" }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-(--border) px-5 py-4">
        <span className="text-[11px] font-semibold tracking-wider text-(--text-muted)">ITEM DETAILS</span>
        <IconButton onClick={onClose} aria-label="Close bookmark details" className="rounded-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </IconButton>
      </div>

      {/* Panel Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Title and Favicon / document icon */}
        <div className="mb-4 flex items-start gap-3">
          {isUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={faviconUrl}
              alt=""
              onError={e => {
                (e.currentTarget as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=example.com&sz=32`;
              }}
              className="mt-0.75 h-6 w-6 shrink-0 rounded border border-(--border) bg-(--surface) p-0.5"
            />
          ) : (
            <div className="mt-0.75 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-(--border) bg-(--surface)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={categoryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="m-0 wrap-break-word text-(length:--text-xl) font-bold leading-[1.3] text-(--text)">
              {bookmark.title || (isUrl ? "Untitled Link" : bookmark.file_name || "Untitled Document")}
            </h2>
            {isUrl && bookmark.url ? (
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring mt-1 inline-flex items-center gap-1 break-all text-xs text-(--accent) outline-none hover:underline"
              >
                {bookmark.url}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
                <span>
                  {[bookmark.source_type?.toUpperCase(), bookmark.page_count ? `${bookmark.page_count} pages` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {bookmark.has_file && (
                  <button
                    onClick={openOriginal}
                    className="focus-ring inline-flex items-center gap-1 rounded-md border border-(--accent)/30 bg-(--accent)/10 px-2 py-0.5 font-semibold text-(--accent) outline-none hover:bg-(--accent)/15"
                  >
                    Open original
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Failure reason */}
        {bookmark.status === "failed" && bookmark.error_reason && (
          <div className="mb-4 rounded-lg border border-(--danger)/30 bg-(--danger-bg) px-3 py-2 text-xs text-(--danger)">
            {bookmark.error_reason}
          </div>
        )}

        {/* Metadata section */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className="rounded-[20px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em]"
            style={
              isProcessing
                ? { background: "var(--surface-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }
                : {
                    background: `color-mix(in srgb, ${categoryColor} 12%, transparent)`,
                    color: categoryColor,
                    border: `1px solid color-mix(in srgb, ${categoryColor} 35%, transparent)`,
                  }
            }
          >
            {isProcessing ? "Analyzing..." : (bookmark.category || "Uncategorized")}
          </span>
          {bookmark.is_archived && (
            <span className="rounded bg-(--danger-bg) px-1.5 py-0.5 text-[9px] font-bold text-(--danger)">
              ARCHIVED
            </span>
          )}
        </div>

        {/* Tag pills */}
        {bookmark.tags && bookmark.tags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-1.5">
            {bookmark.tags.map(tag => (
              <span
                key={tag}
                className="rounded-[20px] border border-(--accent)/20 bg-(--accent)/8 px-2 py-0.5 text-[10px] font-semibold text-(--accent)"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className={dividerClass} />

        {/* AI Key Insight */}
        {bookmark.key_insight && (
          <div className="mb-5">
            <span className={labelClass}>AI key insight</span>
            <div className="rounded-[10px] border border-(--accent)/15 bg-(--accent)/4 px-4 py-3 text-[13px] leading-normal text-(--text)">
              💡 {bookmark.key_insight}
            </div>
          </div>
        )}

        {/* AI Summary */}
        <div className="mb-5">
          <span className={labelClass}>AI summary</span>
          <p className="m-0 text-[13px] leading-[1.6] text-(--text-secondary)">{bookmark.summary || "No summary available."}</p>
        </div>

        {/* On-demand Reanalyze Button */}
        {!bookmark.key_insight && !isProcessing && (
          <button
            onClick={() => onReanalyze(bookmark.id)}
            disabled={isReanalyzing}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-[10px] border border-(--accent)/30 bg-(--accent)/12 px-3 py-2 text-xs font-semibold text-(--accent) outline-none transition-colors duration-150 disabled:cursor-not-allowed enabled:hover:bg-(--accent)/18"
          >
            {isReanalyzing ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: "spin 0.8s linear infinite" }} aria-hidden="true">
                  <path d="M12 2v4M12 18v4" />
                </svg>
                Re-analyzing...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                Re-analyze to generate key insight
              </>
            )}
          </button>
        )}

        <div className={dividerClass} />

        {/* Related Bookmarks */}
        <div className="mb-5">
          <span className={labelClass}>Similar in your vault</span>
          {isRelatedLoading ? (
            <div className="flex items-center gap-2 py-2.5 text-xs text-(--text-muted)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: "spin 0.8s linear infinite" }} aria-hidden="true">
                <path d="M12 2v4M12 18v4" />
              </svg>
              Finding similar links...
            </div>
          ) : relatedBookmarks.length === 0 ? (
            <div className="py-1 text-xs italic text-(--text-muted)">No similar bookmarks found.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {relatedBookmarks.map(rel => {
                const relDomain = getDomain(rel.url);
                const relFavicon = `https://www.google.com/s2/favicons?domain=${relDomain}&sz=16`;
                return (
                  <button
                    key={rel.id}
                    onClick={() => onSelectBookmark(rel.id)}
                    className="focus-ring flex w-full items-center gap-2.5 rounded-[10px] border border-(--border) bg-(--surface) px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:border-(--accent)/25 hover:bg-(--surface-hover)"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={relFavicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-(--text)">
                        {rel.title}
                      </div>
                      <div className="text-[10px] text-(--text-muted)">{relDomain}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={dividerClass} />

        {/* Action button bar */}
        <div>
          <span className={labelClass}>Actions</span>
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2.5">
              <button onClick={() => onOpenEdit(bookmark)} className={actionBtnClass}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>

              <button
                onClick={() => onToggleArchive(bookmark.id)}
                className={`${actionBtnClass} hover:border-(--accent)/30 hover:bg-(--accent)/10 hover:text-(--accent)`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <polyline points="21 8 21 21 3 21 3 8" />
                  <rect x="1" y="3" width="22" height="5" />
                  <line x1="10" y1="12" x2="14" y2="12" />
                </svg>
                {bookmark.is_archived ? "Unarchive" : "Archive"}
              </button>

              <button
                onClick={() => onDelete(bookmark.id)}
                className={`${actionBtnClass} text-(--danger) hover:border-(--danger)/30 hover:bg-(--danger-bg) hover:text-(--danger)`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
                Delete
              </button>
            </div>

            <button
              onClick={() => onAskAboutThis(bookmark.title)}
              className="focus-ring flex items-center justify-center gap-2 rounded-[10px] border border-(--accent)/30 px-3 py-2.5 text-xs font-semibold text-(--accent) outline-none transition-opacity duration-150 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--brand-from) 15%, transparent), color-mix(in srgb, var(--brand-to) 15%, transparent))" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Ask assistant about this resource
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return isMobile ? (
    <div
      onClick={onClose}
      className="fixed inset-0 z-150 flex justify-end backdrop-blur-sm"
      style={{ background: "var(--overlay)", animation: "fadeIn var(--transition-fast) ease-out" }}
    >
      {content}
    </div>
  ) : content;
}
