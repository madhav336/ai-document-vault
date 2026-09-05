"use client";

import React from "react";
import IconButton from "./ui/IconButton";

export const MOBILE_BAR_HEIGHT = 56;

interface MobileBarProps {
  onToggleSidebar: () => void;
  onOpenChat: () => void;
}

/**
 * The only chrome left above the content, and only on mobile — the desktop
 * shell has no top bar at all, since the sidebar owns navigation there.
 */
export default function MobileBar({ onToggleSidebar, onOpenChat }: MobileBarProps) {
  return (
    <header
      className="sticky top-0 z-98 flex h-14 items-center justify-between border-b border-(--border) px-3 backdrop-blur-[14px]"
      style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}
    >
      <IconButton aria-label="Open menu" onClick={onToggleSidebar} className="text-(--text)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </IconButton>

      <div className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.4px]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="url(#mobilebar-brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <defs>
            <linearGradient id="mobilebar-brand" x1="0%" y1="0%" x2="100%" y2="100%">
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

      <IconButton aria-label="Ask your vault" onClick={onOpenChat} className="text-(--accent)">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </IconButton>
    </header>
  );
}
