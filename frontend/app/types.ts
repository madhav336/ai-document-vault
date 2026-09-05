export type BookmarkStatus = "processing" | "completed" | "failed";

export type SourceType = "url" | "pdf" | "txt" | "md" | "docx";

export type Bookmark = {
  id: number;
  title: string;
  url: string | null;
  summary: string;
  key_insight?: string | null;
  category: string;
  created_at: string;
  status?: BookmarkStatus;
  is_archived?: boolean;
  tags?: string[];
  source_type?: SourceType;
  file_name?: string | null;
  file_type?: string | null;
  page_count?: number | null;
  has_file?: boolean;
  error_reason?: string | null;
};

/**
 * A cited item, plus the pages of it that actually contributed a retrieved
 * passage. Empty for URLs and for formats that have no pages (txt/md/docx).
 */
export type ChatSource = Bookmark & {
  cited_pages?: number[];
};

export type ChatMessage = {
  role: 'user' | 'model';
  content: string;
  sources?: ChatSource[];
};

export type VaultStats = {
  total: number;
  archived: number;
  recent_30d: number;
  category_count: number;
  categories: { name: string; count: number }[];
};
