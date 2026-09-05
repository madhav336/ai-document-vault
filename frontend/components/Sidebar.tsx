"use client";

import React, { useRef, useState } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { Bookmark } from "../app/types";
import { RankedTag } from "./Composer";
import IconButton from "./ui/IconButton";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./ThemeProvider";
import { userButtonAppearance } from "./clerkAppearance";

export const SIDEBAR_WIDTH_EXPANDED = 260;
export const SIDEBAR_WIDTH_COLLAPSED = 56;

const ACCEPT_UPLOAD = ".pdf,.txt,.md,.markdown,.docx";
const TAGS_COLLAPSED_LIMIT = 12;

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeCategory: string;
  setActiveCategory: (cat: string) => void;
  categories: string[];
  bookmarks: Bookmark[];
  getCategoryColor: (cat: string) => string;
  showArchived: boolean;
  setShowArchived: (arch: boolean) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  rankedTags: RankedTag[];
  isMobile: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isMounted: boolean;
  onOpenChat: () => void;
  onOpenAdd: () => void;
  onUploadFiles: (files: File[]) => void;
  onOpenSettings: () => void;
  onFocusSearch: () => void;
}

/* ── icons ──────────────────────────────────────────────────────────────── */
const icon = (d: React.ReactNode, size = 16) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="shrink-0"
  >
    {d}
  </svg>
);

const IconAsk = icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
const IconLibrary = icon(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </>
);
const IconLink = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>
);
const IconUpload = icon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </>
);
const IconArchive = icon(
  <>
    <rect x="2" y="4" width="20" height="5" rx="1.5" />
    <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4" />
  </>
);
const IconSettings = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
);
const IconSearch = icon(
  <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </>
);
const IconPanel = icon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </>
);
const IconClose = icon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
);

/* ── a single nav row, shared by every action so collapsed and expanded
      states stay consistent everywhere ─────────────────────────────────── */
function NavRow({
  label,
  children,
  onClick,
  isExpanded,
  active = false,
  emphasis = false,
  trailing,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  isExpanded: boolean;
  active?: boolean;
  emphasis?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={isExpanded ? undefined : label}
      aria-pressed={active || undefined}
      className={`focus-ring flex w-full cursor-pointer items-center rounded-[10px] border-none text-left text-[13px] outline-none transition-colors duration-150 ${
        isExpanded ? "gap-2.5 px-2.5 py-2" : "justify-center px-0 py-2.5"
      } ${
        active || emphasis
          ? "bg-(--accent)/12 font-semibold text-(--accent) hover:bg-(--accent)/18"
          : "font-medium text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text)"
      }`}
    >
      {children}
      {isExpanded && <span className="flex-1 truncate">{label}</span>}
      {isExpanded && trailing}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-[0.09em] text-(--text-muted)">
      {children}
    </div>
  );
}

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
  activeCategory,
  setActiveCategory,
  categories,
  bookmarks,
  getCategoryColor,
  showArchived,
  setShowArchived,
  selectedTag,
  setSelectedTag,
  rankedTags,
  isMobile,
  isMobileOpen,
  onCloseMobile,
  isMounted,
  onOpenChat,
  onOpenAdd,
  onUploadFiles,
  onOpenSettings,
  onFocusSearch,
}: SidebarProps) {
  // On mobile the sidebar is a full drawer, never the narrow rail.
  const isExpanded = isMobile || !isCollapsed;
  const [showAllTags, setShowAllTags] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const width = isMobile || !isCollapsed ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED;

  const asideStyle: React.CSSProperties = {
    width: `${width}px`,
    left: isMounted ? (isMobile ? (isMobileOpen ? 0 : `-${SIDEBAR_WIDTH_EXPANDED}px`) : 0) : 0,
    transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1), left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  const getCategoryCount = (cat: string) =>
    cat === "All" ? bookmarks.length : bookmarks.filter(b => b.category === cat).length;

  const visibleTags = showAllTags ? rankedTags : rankedTags.slice(0, TAGS_COLLAPSED_LIMIT);
  const hiddenTagCount = rankedTags.length - visibleTags.length;

  const closeIfMobile = () => {
    if (isMobile) onCloseMobile();
  };

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) {
      onUploadFiles(files);
      closeIfMobile();
    }
  };

  return (
    <>
      {/* Scrim behind the mobile drawer */}
      {isMobile && isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-99 backdrop-blur-sm"
          style={{ background: "var(--overlay)" }}
        />
      )}

      <aside
        style={asideStyle}
        className="fixed bottom-0 top-0 z-100 flex flex-col border-r border-(--border) bg-(--sidebar-bg)"
      >
        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <div
          className={`flex h-14 shrink-0 items-center ${
            isExpanded ? "justify-between px-3" : "justify-center px-0"
          }`}
        >
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.4px]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="url(#sidebar-brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <defs>
                    <linearGradient id="sidebar-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--brand-from)" />
                      <stop offset="100%" stopColor="var(--brand-to)" />
                    </linearGradient>
                  </defs>
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--brand-gradient)" }}>
                  Vault
                </span>
              </div>
              <div className="flex items-center gap-0.5">
                <IconButton aria-label="Search your vault" onClick={() => { onFocusSearch(); closeIfMobile(); }}>
                  {IconSearch}
                </IconButton>
                {isMobile ? (
                  <IconButton aria-label="Close menu" onClick={onCloseMobile}>
                    {IconClose}
                  </IconButton>
                ) : (
                  <IconButton aria-label="Collapse sidebar" onClick={onToggleCollapse}>
                    {IconPanel}
                  </IconButton>
                )}
              </div>
            </>
          ) : (
            <IconButton aria-label="Expand sidebar" onClick={onToggleCollapse}>
              {IconPanel}
            </IconButton>
          )}
        </div>

        {/* ── Primary actions ───────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-col gap-0.5 px-2 pb-3">
          <NavRow label="Ask your vault" isExpanded={isExpanded} emphasis onClick={() => { onOpenChat(); closeIfMobile(); }}>
            {IconAsk}
          </NavRow>
          <NavRow
            label="All items"
            isExpanded={isExpanded}
            active={activeCategory === "All" && !selectedTag && !showArchived}
            onClick={() => {
              setActiveCategory("All");
              setSelectedTag(null);
              setShowArchived(false);
              closeIfMobile();
            }}
            trailing={
              <span className="rounded-full bg-(--chip-bg) px-1.5 py-0.5 text-[10px] font-semibold text-(--text-muted)">
                {bookmarks.length}
              </span>
            }
          >
            {IconLibrary}
          </NavRow>
          <NavRow label="Save a link" isExpanded={isExpanded} onClick={() => { onOpenAdd(); closeIfMobile(); }}>
            {IconLink}
          </NavRow>
          <NavRow label="Upload a document" isExpanded={isExpanded} onClick={() => fileInputRef.current?.click()}>
            {IconUpload}
          </NavRow>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_UPLOAD}
            onChange={handlePickFiles}
            className="hidden"
          />
        </div>

        <div className={`h-px shrink-0 bg-(--border) ${isExpanded ? "mx-3" : "mx-2"}`} />

        {/* ── Scrolling filters: topics, then tags ──────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
          {isExpanded && <SectionLabel>Topics</SectionLabel>}

          <div className="flex shrink-0 flex-col gap-0.5">
            {categories.map(cat => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    closeIfMobile();
                  }}
                  aria-current={active ? "true" : undefined}
                  title={cat}
                  aria-label={isExpanded ? undefined : cat}
                  className={`focus-ring flex w-full cursor-pointer items-center rounded-[10px] border-none text-left text-[13px] outline-none transition-colors duration-150 ${
                    isExpanded ? "gap-2.5 px-2.5 py-2" : "justify-center px-0 py-2.5"
                  } ${
                    active
                      ? "bg-(--accent)/12 font-semibold text-(--accent)"
                      : "font-normal text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text)"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: cat === "All" ? "var(--brand-gradient)" : getCategoryColor(cat) }}
                  />
                  {isExpanded && (
                    <>
                      <span className="flex-1 truncate">{cat}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          active ? "bg-(--accent)/18 text-(--accent)" : "bg-(--chip-bg) text-(--text-muted)"
                        }`}
                      >
                        {getCategoryCount(cat)}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tags render as a chip cloud rather than one row each — a vault with
              40 tags would otherwise turn this column into a scrollbar. */}
          {isExpanded && rankedTags.length > 0 && (
            <div className="mt-5 shrink-0">
              <div className="flex items-center justify-between pr-1">
                <SectionLabel>Tags</SectionLabel>
                {selectedTag && (
                  <button
                    onClick={() => setSelectedTag(null)}
                    className="focus-ring rounded-md px-1 text-[10px] font-semibold text-(--text-muted) outline-none hover:text-(--accent)"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 px-1.5 pt-1">
                {visibleTags.map(({ tag, count }) => {
                  const active = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        setSelectedTag(active ? null : tag);
                        closeIfMobile();
                      }}
                      aria-pressed={active}
                      title={`${tag} · ${count} item${count === 1 ? "" : "s"}`}
                      className={`focus-ring inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] outline-none transition-colors duration-150 ${
                        active
                          ? "border-(--accent) bg-(--accent) font-semibold text-(--on-accent)"
                          : "border-(--border) bg-(--chip-bg) font-medium text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text)"
                      }`}
                    >
                      <span className="truncate">{tag}</span>
                      <span className={active ? "opacity-70" : "text-(--text-muted)"}>{count}</span>
                    </button>
                  );
                })}

                {hiddenTagCount > 0 && (
                  <button
                    onClick={() => setShowAllTags(true)}
                    className="focus-ring inline-flex cursor-pointer items-center rounded-full border border-dashed border-(--border-strong) px-2 py-0.5 text-[11px] font-medium text-(--text-muted) outline-none hover:text-(--text)"
                  >
                    +{hiddenTagCount} more
                  </button>
                )}
                {showAllTags && rankedTags.length > TAGS_COLLAPSED_LIMIT && (
                  <button
                    onClick={() => setShowAllTags(false)}
                    className="focus-ring inline-flex cursor-pointer items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-(--text-muted) outline-none hover:text-(--text)"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer: archive, settings, theme, account ─────────────────── */}
        <div className="shrink-0 border-t border-(--border) px-2 py-2">
          <div className="flex flex-col gap-0.5 pb-2">
            <NavRow
              label={showArchived ? "Viewing archive" : "Archive"}
              isExpanded={isExpanded}
              active={showArchived}
              onClick={() => {
                setShowArchived(!showArchived);
                closeIfMobile();
              }}
            >
              {IconArchive}
            </NavRow>
            <NavRow label="Settings" isExpanded={isExpanded} onClick={() => { onOpenSettings(); closeIfMobile(); }}>
              {IconSettings}
            </NavRow>
          </div>

          {isExpanded ? (
            <>
              <ThemeToggle className="mb-2 flex w-full" />
              <AccountRow />
            </>
          ) : (
            <div className="flex justify-center pb-1">
              <ThemedUserButton />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function ThemedUserButton() {
  const { resolved } = useTheme();
  return <UserButton appearance={userButtonAppearance(resolved)} />;
}

function AccountRow() {
  const { user } = useUser();
  const name = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "Account";
  const secondary = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1.5">
      <ThemedUserButton />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12px] font-semibold text-(--text)">{name}</div>
        {secondary && secondary !== name && (
          <div className="truncate text-[10px] text-(--text-muted)">{secondary}</div>
        )}
      </div>
    </div>
  );
}
