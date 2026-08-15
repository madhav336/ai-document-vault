import React from "react";
import { Bookmark } from "../app/types";
import IconButton from "./ui/IconButton";

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
  allTags: string[];
  isMobile: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isMounted: boolean;
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
  allTags,
  isMobile,
  isMobileOpen,
  onCloseMobile,
  isMounted,
}: SidebarProps) {
  const isExpanded = !isCollapsed;
  const sidebarWidth = isExpanded ? "220px" : "52px";

  // Layout (width/position) is per-render dynamic, so it stays inline —
  // Tailwind classes are static strings and can't express this.
  const asideStyle: React.CSSProperties = {
    width: isMobile ? "220px" : sidebarWidth,
    left: isMounted ? (isMobile ? (isMobileOpen ? 0 : "-220px") : 0) : 0,
    transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1), left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  const getCategoryCount = (cat: string) => {
    if (cat === "All") return bookmarks.length;
    return bookmarks.filter(b => b.category === cat).length;
  };

  return (
    <>
      {/* Sidebar background overlay on mobile */}
      {isMobile && isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-99 backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.5)" }}
        />
      )}

      <aside
        style={asideStyle}
        className="fixed top-15 bottom-0 z-100 flex min-h-screen flex-col border-r border-(--border) bg-(--sidebar-bg)"
      >
        {/* Toggle Collapse Icon (Not shown on mobile) */}
        {!isMobile && (
          <div className={`flex px-3.5 pb-1 pt-2.5 ${isExpanded ? "justify-end" : "justify-center"}`}>
            <IconButton
              onClick={onToggleCollapse}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="p-1"
            >
              {isCollapsed ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              )}
            </IconButton>
          </div>
        )}

        {/* Categories Section */}
        <div className="shrink-0 px-2 pb-4 pt-3">
          <div className={`px-2 pb-2.5 text-[10px] font-bold uppercase tracking-widest text-(--text-muted) ${isExpanded ? "flex items-center justify-between" : "hidden"}`}>
            <span>Categories</span>
            <button
              onClick={() => setShowArchived(!showArchived)}
              aria-pressed={showArchived}
              className={`focus-ring rounded-md border px-1.5 py-0.5 text-[9px] font-semibold outline-none transition-colors duration-150 ${
                showArchived
                  ? "border-(--accent)/30 bg-(--accent)/15 text-(--accent)"
                  : "border-(--border) bg-(--surface-hover) text-(--text-muted)"
              }`}
            >
              {showArchived ? "Archived" : "Archive"}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {categories.map(cat => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    if (isMobile) onCloseMobile();
                  }}
                  aria-current={active ? "true" : undefined}
                  title={cat}
                  className={`focus-ring flex w-full items-center gap-2.5 rounded-[10px] border-none text-left text-[13px] outline-none transition-colors duration-150 ${
                    isExpanded ? "justify-start px-3 py-2" : "justify-center p-2.5"
                  } ${active ? "bg-(--accent)/10 font-semibold text-(--accent)" : "font-normal text-(--text-secondary) hover:bg-(--surface-hover)"}`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: cat === "All" ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : getCategoryColor(cat),
                    }}
                  />
                  {isExpanded && (
                    <>
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{cat}</span>
                      <span
                        className={`rounded-[20px] px-1.5 py-0.5 text-[10px] font-medium ${
                          active ? "bg-(--accent)/15 text-(--accent)" : "bg-(--surface-hover) text-(--text-muted)"
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
        </div>

        <div className={`h-px bg-(--border) ${isExpanded ? "mx-4 mb-3" : "mx-2.5 mb-3"}`} />

        {/* Scrollable Tags List (Only shown when expanded) */}
        {isExpanded && allTags.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-5">
            <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">
              <span>Tags</span>
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {allTags.map(tag => {
                const active = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      setSelectedTag(active ? null : tag);
                      if (isMobile) onCloseMobile();
                    }}
                    aria-pressed={active}
                    className={`focus-ring flex w-full items-center gap-2 rounded-lg border-none px-2.5 py-2 text-left text-xs outline-none transition-colors duration-150 ${
                      active ? "bg-(--accent)/10 font-semibold text-(--accent)" : "font-normal text-(--text-secondary) hover:bg-(--surface-hover)"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-(--accent)" : "text-(--text-muted)"} aria-hidden="true">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
