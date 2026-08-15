import React from "react";
import { UserButton } from "@clerk/nextjs";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";

interface TopbarProps {
  onOpenAddDialog: () => void;
  onOpenSettings: () => void;
  onOpenChat: () => void;
  isMobile: boolean;
  onToggleSidebar: () => void;
}

export default function Topbar({
  onOpenAddDialog,
  onOpenSettings,
  onOpenChat,
  isMobile,
  onToggleSidebar,
}: TopbarProps) {
  return (
    <header
      className="sticky top-0 z-99 flex h-15 items-center justify-between border-b border-(--border) px-7 backdrop-blur-[14px]"
      style={{ background: "rgba(255, 255, 255, 0.85)" }}
    >
      <div className="flex items-center gap-3">
        {isMobile && (
          <IconButton aria-label="Toggle sidebar" onClick={onToggleSidebar} className="text-(--text)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </IconButton>
        )}
        <div className="flex items-center gap-2 text-(length:--text-lg) font-bold tracking-[-0.5px]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="url(#topbar-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <defs>
              <linearGradient id="topbar-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
            </defs>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}
          >
            Vault
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* RAG Chat Entry Point */}
        <button
          id="ask-ai-btn"
          onClick={onOpenChat}
          className="focus-ring flex cursor-pointer items-center gap-2 rounded-xl border border-(--accent)/30 bg-(--accent)/10 px-3.5 py-2 text-(length:--text-sm) font-semibold text-(--accent) outline-none transition-colors duration-150 hover:bg-(--accent)/15"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Ask your vault
        </button>

        {/* Manual Ingestion */}
        <Button id="add-btn" onClick={onOpenAddDialog} className="text-(length:--text-sm)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </Button>

        {/* Settings Button */}
        <IconButton id="settings-btn" aria-label="Open settings" onClick={onOpenSettings}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </IconButton>

        {/* User Button */}
        <UserButton appearance={{ elements: { userButtonAvatarBox: { width: "28px", height: "28px" } } }} />
      </div>
    </header>
  );
}
