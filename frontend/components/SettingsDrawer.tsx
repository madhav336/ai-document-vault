import React from "react";
import ApiKeysManager from "./ApiKeysManager";
import IconButton from "./ui/IconButton";
import Card from "./ui/Card";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  handleHtmlImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isMobile: boolean;
}

const sectionTitleClass = "mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]";

export default function SettingsDrawer({
  isOpen,
  onClose,
  handleHtmlImport,
  isMobile,
}: SettingsDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-150 flex justify-end backdrop-blur-sm"
      style={{ background: "var(--overlay)", animation: "fadeIn var(--transition-fast) ease-out" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`flex h-full flex-col border-l border-(--border) bg-(--surface-overlay) shadow-(--shadow-lg) ${isMobile ? "w-full" : "w-95"}`}
        style={{ animation: "slideInRight var(--transition-smooth) both" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-(--border) px-5 py-4">
          <span className="text-[11px] font-semibold tracking-wider text-(--text-muted)">SETTINGS</span>
          <IconButton onClick={onClose} aria-label="Close settings" className="rounded-full">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </IconButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-(length:--text-lg) font-bold tracking-[-0.3px] text-(--text)">Vault customization</h2>

          {/* Import Section */}
          <div className="mb-6">
            <h3 className={sectionTitleClass}>Bulk import ingestion</h3>
            <Card className="p-4 text-[13px] leading-normal text-(--text-secondary)">
              <p className="mb-3">
                Import your existing reading lists directly into the vault. We support HTML exports generated from Chrome, Safari, Firefox, or Brave.
              </p>
              <label
                id="import-btn"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border-none px-3.5 py-2.5 text-xs font-semibold text-(--on-accent) transition-opacity duration-150 hover:opacity-90"
                style={{ background: "var(--brand-gradient)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Upload HTML bookmarks file
                <input type="file" accept=".html" onChange={handleHtmlImport} className="hidden" />
              </label>
            </Card>
          </div>

          {/* Browser Extension Section */}
          <div className="mb-6">
            <h3 className={sectionTitleClass}>Browser extension</h3>
            <ApiKeysManager />
          </div>

          {/* Keyboard Shortcuts Section */}
          <div className="mb-6">
            <h3 className={sectionTitleClass}>Keyboard shortcuts</h3>
            <Card className="flex flex-col gap-2 p-4 text-[13px] leading-normal text-(--text-secondary)">
              <div className="flex justify-between">
                <span>Focus search bar</span>
                <kbd className="rounded border border-(--border) bg-(--surface-hover) px-1.5 py-0.5 text-[11px]">/</kbd>
              </div>
              <div className="flex justify-between">
                <span>Close drawer / modal</span>
                <kbd className="rounded border border-(--border) bg-(--surface-hover) px-1.5 py-0.5 text-[11px]">ESC</kbd>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
