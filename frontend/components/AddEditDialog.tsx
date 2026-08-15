import React, { useRef, useState } from "react";
import Button from "./ui/Button";
import IconButton from "./ui/IconButton";
import Card from "./ui/Card";

interface AddEditDialogProps {
  isOpen: boolean;
  editingId: number | null;
  title: string;
  setTitle: (t: string) => void;
  url: string;
  setUrl: (u: string) => void;
  selectedCategory: string | null;
  setSelectedCategory: (c: string | null) => void;
  customCategory: string;
  setCustomCategory: (c: string) => void;
  dialogTags: string;
  setDialogTags: (t: string) => void;
  categories: string[];
  getCategoryColor: (cat: string) => string;
  error: string;
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
  onUploadFiles?: (files: File[]) => void;
}

const ACCEPT_UPLOAD = ".pdf,.txt,.md,.markdown,.docx";

const inputClass =
  "focus-ring w-full rounded-xl border border-(--border) bg-(--surface) px-3.5 py-2.5 text-sm text-(--text) outline-none transition-colors duration-200 font-[inherit] focus:border-(--accent)";
const labelClass = "mb-1.5 block text-[10px] font-bold tracking-[0.08em] text-(--text-muted)";
const hintClass = "mb-0 mt-1 text-[11px] text-(--text-muted)";

export default function AddEditDialog({
  isOpen,
  editingId,
  title,
  setTitle,
  url,
  setUrl,
  selectedCategory,
  setSelectedCategory,
  customCategory,
  setCustomCategory,
  dialogTags,
  setDialogTags,
  categories,
  getCategoryColor,
  error,
  loading,
  onClose,
  onSave,
  onUploadFiles,
}: AddEditDialogProps) {
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [dropActive, setDropActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSave();
    }
  };

  const submitFiles = (files: File[]) => {
    if (files.length && onUploadFiles) onUploadFiles(files);
  };

  const isEditing = editingId !== null;
  const showUpload = !isEditing && mode === "upload";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-999 flex items-center justify-center p-4 backdrop-blur-[6px]"
      style={{ background: "rgba(0, 0, 0, 0.6)", animation: "fadeIn 0.2s ease-out" }}
    >
      <Card
        raised
        onClick={e => e.stopPropagation()}
        className="w-full max-w-115 rounded-[20px] p-7"
        style={{ animation: "dialogSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both" }}
      >
        {/* Dialog header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.3px] text-(--text)">
              {isEditing ? "Edit item" : "Add to your vault"}
            </h2>
            <p className="mt-0.75 text-[13px] text-(--text-muted)">
              {isEditing ? "Update the details below" : "AI summarizes, categorizes, and indexes it for you"}
            </p>
          </div>
          <IconButton
            onClick={onClose}
            aria-label="Close dialog"
            className="h-8 w-8 rounded-lg border border-(--border) bg-(--surface) text-[20px] leading-none"
          >
            ×
          </IconButton>
        </div>

        {/* Mode switch (create only) */}
        {!isEditing && (
          <div className="mb-5 flex gap-1 rounded-xl border border-(--border) bg-(--surface-hover) p-1">
            {(["link", "upload"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`focus-ring flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold outline-none transition-colors duration-150 ${
                  mode === m ? "bg-(--surface) text-(--text) shadow-(--shadow-sm)" : "text-(--text-muted) hover:text-(--text)"
                }`}
              >
                {m === "link" ? "Link" : "Upload"}
              </button>
            ))}
          </div>
        )}

        {showUpload && (
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={e => { e.preventDefault(); setDropActive(true); }}
              onDragOver={e => e.preventDefault()}
              onDragLeave={e => { e.preventDefault(); setDropActive(false); }}
              onDrop={e => {
                e.preventDefault();
                setDropActive(false);
                submitFiles(Array.from(e.dataTransfer.files || []));
              }}
              className={`focus-ring flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center outline-none transition-colors duration-150 ${
                dropActive ? "border-(--accent) bg-(--accent)/10" : "border-(--border) bg-(--surface-hover) hover:border-(--accent)/50"
              }`}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              <div className="text-sm font-semibold text-(--text)">Drop a file here, or click to choose</div>
              <div className="text-[12px] text-(--text-muted)">PDF, TXT, Markdown, or Word (.docx)</div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_UPLOAD}
              multiple
              className="hidden"
              onChange={e => {
                submitFiles(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            {error && <p className="mt-3 text-[13px] text-(--danger)" role="alert">{error}</p>}
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {!showUpload && (
        <>
        {/* Title field */}
        <div className="mb-4">
          <label htmlFor="bookmark-title" className={labelClass}>TITLE</label>
          <input
            id="bookmark-title"
            placeholder="e.g. OpenAI Documentation"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className={inputClass}
          />
        </div>

        {/* URL field */}
        <div className="mb-4">
          <label htmlFor="bookmark-url" className={labelClass}>URL</label>
          <input
            id="bookmark-url"
            placeholder="https://..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className={inputClass}
          />
        </div>

        {/* Category override */}
        <div className="mb-5">
          <label htmlFor="bookmark-category" className={labelClass}>CATEGORY</label>
          <div className="relative">
            <select
              id="bookmark-category"
              value={selectedCategory ?? ""}
              onChange={e => {
                const val = e.target.value;
                setSelectedCategory(val || null);
                if (val !== "custom") setCustomCategory("");
              }}
              className={`${inputClass} cursor-pointer appearance-none pr-9`}
              style={{ color: selectedCategory ? getCategoryColor(selectedCategory === "custom" ? customCategory : selectedCategory) : "var(--text-muted)" }}
            >
              <option value="">Auto (AI picks)</option>
              {categories.filter(c => c !== "All").map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="custom">+ Add custom category...</option>
            </select>
            {/* Chevron icon */}
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted)"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {selectedCategory === "custom" && (
            <div className="mt-2.5">
              <label htmlFor="bookmark-custom-category" className="sr-only">Custom category name</label>
              <input
                id="bookmark-custom-category"
                placeholder="Enter custom category name (e.g. Cooking, Finance)"
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          {!selectedCategory && (
            <p className={hintClass}>Gemini will assign a category automatically.</p>
          )}
        </div>

        {/* Tags field */}
        <div className="mb-5">
          <label htmlFor="bookmark-tags" className={labelClass}>TAGS</label>
          <input
            id="bookmark-tags"
            placeholder="e.g. nextjs, react, baking (comma-separated)"
            value={dialogTags}
            onChange={e => setDialogTags(e.target.value)}
            className={inputClass}
          />
          <p className={hintClass}>Separate tags with commas. Gemini will generate tags automatically if left empty.</p>
        </div>

        {error && (
          <p className="-mt-1 mb-4 text-[13px] text-(--danger)" role="alert">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={loading}>
            {loading && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                style={{ animation: "spin 0.7s linear infinite" }} aria-hidden="true">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            )}
            {loading ? (editingId ? "Saving..." : "Generating summary...") : editingId ? "Save changes" : "Add link"}
          </Button>
        </div>
        </>
        )}
      </Card>
    </div>
  );
}
