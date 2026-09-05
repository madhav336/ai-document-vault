import React from "react";
import { Bookmark } from "../app/types";
import IconButton from "./ui/IconButton";

interface BookmarkCardProps {
  bookmark: Bookmark;
  index: number;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  toggleArchive: (id: number) => void;
  openEdit: (bookmark: Bookmark) => void;
  setDeleteTargetId: (id: number) => void;
  getCategoryColor: (cat: string) => string;
  timeAgo: (dateStr: string) => string;
  onClick: () => void;
}

export default function BookmarkCard({
  bookmark,
  index,
  selectedTag,
  setSelectedTag,
  toggleArchive,
  openEdit,
  setDeleteTargetId,
  getCategoryColor,
  timeAgo,
  onClick,
}: BookmarkCardProps) {
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
  const isProcessing = bookmark.status === "processing";
  const categoryColor = getCategoryColor(bookmark.category);

  // Subtitle under the title: domain for links, file info for documents.
  const subtitle = isUrl
    ? domain
    : [bookmark.source_type?.toUpperCase(), bookmark.page_count ? `${bookmark.page_count} pages` : null]
        .filter(Boolean)
        .join(" · ");

  // Render tag pills
  const maxVisibleTags = 3;
  const tags = bookmark.tags || [];
  const visibleTags = tags.slice(0, maxVisibleTags);
  const overflowCount = tags.length - maxVisibleTags;

  return (
    <div
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col gap-4 overflow-hidden rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-(--shadow-sm) transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-(--accent)/30 hover:shadow-(--shadow-glow)"
      style={{ animation: "fadeUp var(--transition-smooth) both", animationDelay: `${index * 30}ms` }}
    >
      {/* Top Row: Favicon, Title, Category, Duration */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Favicon (links) or document-type icon (uploads) */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--border) bg-(--surface-hover)">
            {isUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={faviconUrl}
                  alt=""
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const fallback = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLDivElement;
                    if (fallback) fallback.style.display = "flex";
                  }}
                  className="h-4.5 w-4.5 rounded-[3px]"
                />
                <div
                  className="hidden h-4.5 w-4.5 items-center justify-center rounded-[3px] text-[10px] font-bold text-(--on-accent)"
                  style={{ background: categoryColor }}
                >
                  {bookmark.category ? bookmark.category[0].toUpperCase() : "U"}
                </div>
              </>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={categoryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            )}
          </div>

          {/* Title */}
          <div className="min-w-0 flex-1">
            <h3 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-(length:--text-lg) font-semibold text-(--text)">
              {bookmark.title || (isUrl ? "Untitled Link" : bookmark.file_name || "Untitled Document")}
            </h3>
            <span className="text-(length:--text-xs) text-(--text-muted)">{subtitle}</span>
          </div>
        </div>

        {/* Right side Category + Duration */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.03em]"
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
          <span className="text-[11px] text-(--text-muted)">{timeAgo(bookmark.created_at)}</span>
        </div>
      </div>

      {/* Middle Row: Key Insight (or Shimmer Animation if Processing) */}
      {isProcessing ? (
        <div className="flex w-full flex-col gap-1.5 pr-10">
          <div
            className="h-3.5 w-full rounded"
            style={{
              background: "linear-gradient(90deg, var(--surface-hover) 25%, var(--border) 50%, var(--surface-hover) 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite linear",
            }}
          />
        </div>
      ) : (
        bookmark.key_insight && (
          <p
            className="m-0 overflow-hidden text-ellipsis whitespace-nowrap pr-5 text-(length:--text-sm) leading-normal text-(--text-secondary)"
            title={bookmark.key_insight}
          >
            💡 {bookmark.key_insight}
          </p>
        )
      )}

      {/* Bottom Row: Tags list */}
      <div className="flex flex-wrap items-center gap-2">
        {visibleTags.map(tag => {
          const active = selectedTag === tag;
          return (
            <button
              key={tag}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTag(active ? null : tag);
              }}
              aria-pressed={active}
              className={`focus-ring whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold outline-none transition-colors duration-150 ${
                active
                  ? "border-(--accent) bg-(--accent) text-(--on-accent)"
                  : "border-(--accent)/30 bg-(--accent)/10 text-(--accent)"
              }`}
            >
              {tag}
            </button>
          );
        })}

        {overflowCount > 0 && (
          <span className="whitespace-nowrap rounded-full bg-(--surface-hover) px-2 py-1 text-[11px] font-medium text-(--text-muted)">
            +{overflowCount}
          </span>
        )}

        {bookmark.is_archived && (
          <span className="whitespace-nowrap rounded bg-(--danger-bg) px-1.5 py-0.5 text-[9px] font-bold text-(--danger)">
            ARCHIVED
          </span>
        )}

        {/* Action buttons (fade-in on card hover or keyboard focus) */}
        <div
          className="absolute bottom-5 right-6 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={e => e.stopPropagation()}
        >
          <IconButton
            onClick={() => toggleArchive(bookmark.id)}
            aria-label={bookmark.is_archived ? "Unarchive bookmark" : "Archive bookmark"}
            className="h-7 w-7 rounded-md border border-(--border) bg-(--surface) hover:border-(--accent)/30 hover:bg-(--accent)/10 hover:text-(--accent)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
          </IconButton>

          <IconButton
            onClick={() => {
              if (!isProcessing) openEdit(bookmark);
            }}
            disabled={isProcessing}
            aria-label="Edit bookmark"
            className="h-7 w-7 rounded-md border border-(--border) bg-(--surface) hover:bg-(--surface-hover) hover:text-(--accent)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </IconButton>

          <IconButton
            onClick={() => setDeleteTargetId(bookmark.id)}
            aria-label="Delete item"
            variant="danger"
            className="h-7 w-7 rounded-md border border-(--border) bg-(--surface)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  );
}
