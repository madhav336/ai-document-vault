"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Show, useAuth, useUser } from "@clerk/nextjs";
import { Bookmark, ChatMessage, VaultStats } from "./types";

// Import modular components
import MobileBar, { MOBILE_BAR_HEIGHT } from "../components/MobileBar";
import Sidebar, { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from "../components/Sidebar";
import StatsStrip from "../components/StatsStrip";
import DetailPanel from "../components/DetailPanel";
import SettingsDrawer from "../components/SettingsDrawer";
import Composer, { ComposerMode, RankedTag, SEARCH_INPUT_ID } from "../components/Composer";
import BookmarkCard from "../components/BookmarkCard";
import Conversation from "../components/Conversation";
import AddEditDialog from "../components/AddEditDialog";
import LandingPage from "../components/LandingPage";
import Button from "../components/ui/Button";
import { useTheme } from "../components/ThemeProvider";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const SIDEBAR_COLLAPSED_KEY = "vault_sidebar_collapsed";
// How long to keep polling an item stuck in "processing" before assuming the
// background job died (e.g. the host slept mid-enrichment) and standing down.
const POLL_GIVE_UP_MS = 180_000;

// Category colors are drawn as foreground (icon strokes, chip text) on the page
// surface, so each needs a darker variant for the light theme and a lighter one
// for dark — a single mid-tone would be washed out on one of them.
const CATEGORY_COLORS: Record<string, { light: string; dark: string }> = {
  "Backend":      { light: "#2563eb", dark: "#60a5fa" },
  "Frontend":     { light: "#e11d48", dark: "#fb7185" },
  "AI/ML":        { light: "#7c3aed", dark: "#a78bfa" },
  "DevOps":       { light: "#d97706", dark: "#fbbf24" },
  "Database":     { light: "#059669", dark: "#34d399" },
  "Mobile":       { light: "#db2777", dark: "#f472b6" },
  "Security":     { light: "#dc2626", dark: "#f87171" },
  "Cloud":        { light: "#0891b2", dark: "#22d3ee" },
  "Productivity": { light: "#65a30d", dark: "#a3e635" },
  "Programming":  { light: "#7c3aed", dark: "#c4b5fd" },
  "Other":        { light: "#52525b", dark: "#a1a1aa" },
};

function buildCategoryColor(isDark: boolean) {
  return function getCategoryColor(cat: string) {
    const fallback = isDark ? "#a1a1aa" : "#52525b";
    if (!cat) return fallback;
    const known = CATEGORY_COLORS[cat];
    if (known) return isDark ? known.dark : known.light;

    // Generate deterministic HSL color based on string hash
    let hash = 0;
    for (let i = 0; i < cat.length; i++) {
      hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    // Same hue either way, flipped in lightness so it stays legible against
    // whichever surface it lands on.
    return isDark ? `hsl(${hue}, 70%, 68%)` : `hsl(${hue}, 65%, 42%)`;
  };
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  
  let formattedStr = dateStr;
  if (!dateStr.endsWith("Z") && !dateStr.includes("+") && !/-\d{2}:\d{2}$/.test(dateStr)) {
    formattedStr = `${dateStr}Z`;
  }

  const now = Date.now();
  const then = new Date(formattedStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function Home() {
  // --- Global App State ---
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<number | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");

  // --- Add/Edit Form State ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [dialogTags, setDialogTags] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Search & Filters State ---
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // --- RAG Chat State ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("browse");

  // --- Related Bookmarks State ---
  const [relatedBookmarks, setRelatedBookmarks] = useState<Bookmark[]>([]);
  const [isRelatedLoading, setIsRelatedLoading] = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState<number | null>(null);

  // --- Deletion State ---
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // --- Enrichment polling ---
  const [pollTick, setPollTick] = useState(0);
  const pollStartedAtRef = useRef<{ key: string; startedAt: number } | null>(null);



  // --- UI Context / Mounted State ---
  const [isBookmarksLoading, setIsBookmarksLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile sidebar drawer state

  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { resolved: resolvedTheme } = useTheme();

  // Rebuilt on theme change so every consumer keeps the same
  // `(cat) => color` signature and none of them need to know about theming.
  const getCategoryColor = useMemo(
    () => buildCategoryColor(resolvedTheme === "dark"),
    [resolvedTheme]
  );

  // --- Layout Responsiveness & Mounting ---
  useEffect(() => {
    const checkRes = () => {
      const isMobileVal = window.innerWidth <= 768;
      requestAnimationFrame(() => {
        setIsMobile(isMobileVal);
      });
    };
    checkRes();
    window.addEventListener("resize", checkRes);

    const frame = requestAnimationFrame(() => {
      setIsMounted(true);
    });

    return () => {
      window.removeEventListener("resize", checkRes);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Hydrate desktop sidebar collapse state
  useEffect(() => {
    if (typeof window !== "undefined") {
      const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
      requestAnimationFrame(() => {
        setIsSidebarCollapsed(collapsed);
      });
    }
  }, []);



  const handleToggleSidebarCollapse = () => {
    const nextVal = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextVal);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextVal));
  };

  // --- API Call: Fetch Bookmarks ---
  const fetchBookmarks = useCallback(async (archivedOverride?: boolean) => {
    try {
      setIsBookmarksLoading(true);
      const targetArchived = archivedOverride !== undefined ? archivedOverride : showArchived;
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/bookmarks?archived=${targetArchived}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setBookmarks(data);
      } else {
        setBookmarks([]);
      }
    } catch {
      setBookmarks([]);
    } finally {
      setIsBookmarksLoading(false);
    }
  }, [getToken, showArchived]);

  // --- API Call: Search Bookmarks ---
  const searchBookmarks = useCallback(async (query: string) => {
    if (!query.trim()) { fetchBookmarks(); return; }
    try {
      setIsBookmarksLoading(true);
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/search?q=${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setBookmarks(data);
      } else {
        setBookmarks([]);
      }
    } catch {
      setBookmarks([]);
    } finally {
      setIsBookmarksLoading(false);
    }
  }, [getToken, fetchBookmarks]);

  // --- API Call: Fetch Stats ---
  const fetchStats = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVaultStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch vault stats:", err);
    }
  }, [getToken]);

  // Fetch related bookmarks for detail panel
  useEffect(() => {
    async function fetchRelated() {
      if (selectedBookmarkId === null) {
        setRelatedBookmarks([]);
        return;
      }
      setIsRelatedLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE}/bookmarks/${selectedBookmarkId}/related`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setRelatedBookmarks(data);
        }
      } catch (err) {
        console.error("Failed to fetch related bookmarks:", err);
      } finally {
        setIsRelatedLoading(false);
      }
    }
    Promise.resolve().then(() => fetchRelated());
  }, [selectedBookmarkId, getToken]);

  // Fetch stats reactive to bookmark list modifications
  useEffect(() => {
    if (isLoaded && user) {
      Promise.resolve().then(() => fetchStats());
    }
  }, [isLoaded, user, bookmarks, fetchStats]);

  useEffect(() => {
    Promise.resolve().then(() => fetchBookmarks());
  }, [showArchived, fetchBookmarks]);

  // Debounce search input changes (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchBookmarks(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, searchBookmarks]);

  // Poll only the specific bookmark(s) still enriching, and patch them in
  // place — avoids refetching/re-rendering the whole list while a background
  // enrichment (create, edit, or reanalyze) is in flight.
  //
  // pollTick exists because `processingIds` alone cannot re-arm this effect: if
  // an item is *still* processing after a poll, the derived string is identical,
  // the dependency compares equal, and polling would stop after a single attempt
  // — leaving the card stuck on "analyzing" until a manual refresh.
  const processingIds = bookmarks.filter(b => b.status === "processing").map(b => b.id).join(",");
  useEffect(() => {
    if (!processingIds) {
      pollStartedAtRef.current = null;
      return;
    }

    // Restart the clock whenever the set of in-flight items changes.
    if (pollStartedAtRef.current?.key !== processingIds) {
      pollStartedAtRef.current = { key: processingIds, startedAt: Date.now() };
    }
    const elapsed = Date.now() - pollStartedAtRef.current.startedAt;

    // Stop chasing an item the server has evidently abandoned, rather than
    // polling a dead job forever and burning the rate limit.
    if (elapsed > POLL_GIVE_UP_MS) return;

    // Back off as the wait grows: quick feedback for a short scrape, easier on
    // the API for a long multi-page document.
    const delay =
      elapsed < 15_000 ? 1_500 : elapsed < 60_000 ? 3_000 : 6_000;

    const ids = processingIds.split(",").map(Number);
    const timer = setTimeout(async () => {
      const token = await getToken();
      if (!token) return;
      const results = await Promise.all(
        ids.map(async id => {
          try {
            const res = await fetch(`${API_BASE}/bookmarks/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return null;
            return await res.json();
          } catch {
            return null;
          }
        })
      );
      setBookmarks(prev => {
        const byId = new Map(results.filter(Boolean).map(b => [b.id, b]));
        return prev.map(b => byId.get(b.id) ?? b);
      });
      // Re-arms the effect even when nothing about the item changed.
      setPollTick(tick => tick + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [processingIds, pollTick, getToken]);

  // Real-time tab synchronizer channel
  useEffect(() => {
    try {
      const bc = new BroadcastChannel("bookmark_vault_sync");
      bc.onmessage = (event) => {
        if (event.data?.type === "BOOKMARK_ADDED") {
          fetchBookmarks();
        }
      };
      return () => bc.close();
    } catch (err) {
      console.error("Failed to initialize BroadcastChannel sync:", err);
    }
  }, [fetchBookmarks]);

  // --- Bookmark Add Actions ---
  async function addBookmark() {
    if (!title.trim() || !url.trim()) { setError("Please enter both title and URL."); return; }
    
    let normalizedUrl = url.trim();
    if (!normalizedUrl.includes("://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    
    try { new URL(normalizedUrl); } catch { setError("Please enter a valid URL (e.g. https://example.com)."); return; }
    
    const originalTitle = title;
    const originalUrl = normalizedUrl;
    const finalCategory = selectedCategory === "custom" ? customCategory.trim() : (selectedCategory || null);
    const tagsArray = dialogTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    const optimisticId = -Date.now();

    const optimisticBookmark: Bookmark = {
      id: optimisticId,
      title: originalTitle || "New Bookmark",
      url: originalUrl,
      summary: "AI is analyzing...",
      category: finalCategory || "Other",
      created_at: new Date().toISOString(),
      status: "processing",
      tags: tagsArray
    };

    setIsDialogOpen(false);
    setTitle(""); setUrl(""); setSelectedCategory(null); setDialogTags(""); setCustomCategory(""); setError("");
    setBookmarks(prev => [optimisticBookmark, ...prev]);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          title: originalTitle, 
          url: originalUrl, 
          category: finalCategory,
          tags: tagsArray
        }),
      });
      
      if (!res.ok) throw new Error();
      
      const resData = await res.json();
      if (resData && resData.data) {
        setBookmarks(prev => 
          prev.map(b => b.id === optimisticId ? resData.data : b)
        );
      } else {
        fetchBookmarks();
      }
    } catch {
      setBookmarks(prev => prev.filter(b => b.id !== optimisticId));
      setError("Failed to save bookmark.");
    }
  }

  // --- Bookmark Edit Actions ---
  async function updateBookmark() {
    if (!title.trim() || !url.trim()) { setError("Please enter both title and URL."); return; }
    
    let normalizedUrl = url.trim();
    if (!normalizedUrl.includes("://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    
    try { new URL(normalizedUrl); } catch { setError("Please enter a valid URL (e.g. https://example.com)."); return; }
    if (editingId === null) return;

    const targetId = editingId;
    const originalTitle = title;
    const originalUrl = normalizedUrl;
    const finalCategory = selectedCategory === "custom" ? customCategory.trim() : (selectedCategory || null);
    const tagsArray = dialogTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    const currentBookmark = bookmarks.find(b => b.id === targetId);
    const urlChanged = currentBookmark ? currentBookmark.url !== originalUrl : true;

    setIsDialogOpen(false);
    setEditingId(null);
    setTitle(""); setUrl(""); setSelectedCategory(null); setDialogTags(""); setCustomCategory(""); setError("");

    setBookmarks(prev => 
      prev.map(b => b.id === targetId ? {
        ...b,
        title: originalTitle,
        url: originalUrl,
        category: finalCategory || b.category,
        tags: tagsArray,
        status: urlChanged || !finalCategory ? "processing" : b.status,
        summary: urlChanged || !finalCategory ? "AI is re-analyzing..." : b.summary
      } : b)
    );

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks/${targetId}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ 
          title: originalTitle, 
          url: originalUrl, 
          category: finalCategory,
          tags: tagsArray
        }),
      });
      
      if (!res.ok) throw new Error();
      
      const resData = await res.json();
      if (resData && resData.data) {
        setBookmarks(prev => 
          prev.map(b => b.id === targetId ? resData.data : b)
        );
        // Sync selected details panel if active
        if (selectedBookmarkId === targetId) {
          setSelectedBookmarkId(null);
          // Small delay for panel slide out prior to state update
          setTimeout(() => setSelectedBookmarkId(targetId), 200);
        }
      } else {
        fetchBookmarks();
      }
    } catch {
      fetchBookmarks();
      setError("Failed to update bookmark.");
    }
  }

  // --- Bookmark Re-analyze ---
  const handleReanalyze = async (id: number) => {
    setReanalyzingId(id);
    try {
      const token = await getToken();
      const target = bookmarks.find(b => b.id === id);
      if (!target) return;

      const res = await fetch(`${API_BASE}/bookmarks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: target.title,
          url: target.url,
          category: target.category,
          tags: target.tags || []
        })
      });

      if (res.ok) {
        fetchBookmarks();
      }
    } catch (err) {
      console.error("Failed to reanalyze bookmark:", err);
    } finally {
      setReanalyzingId(null);
    }
  };

  // --- Bookmark Delete ---
  async function confirmDelete() {
    if (deleteTargetId === null) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks/${deleteTargetId}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      if (selectedBookmarkId === deleteTargetId) {
        setSelectedBookmarkId(null);
      }
      setDeleteTargetId(null);
      fetchBookmarks();
    } catch {
      setDeleteTargetId(null);
      setError("Delete failed.");
    }
  }

  // --- Bookmark Archive ---
  async function toggleArchive(bookmarkId: number) {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks/${bookmarkId}/archive`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
        if (selectedBookmarkId === bookmarkId) {
          setSelectedBookmarkId(null);
        }
      } else {
        setError("Failed to archive/unarchive bookmark.");
      }
    } catch {
      setError("An error occurred.");
    }
  }

  // --- RAG Chat Assistant ---
  async function sendChatMessage() {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    
    const newUserMessage: ChatMessage = { role: 'user', content: userMsg };
    const currentHistory = [...chatMessages];
    setChatMessages(prev => [...prev, newUserMessage]);
    setIsChatLoading(true);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMsg,
          history: currentHistory.slice(-20).map(m => ({ role: m.role, content: m.content }))
        })
      });
      
      if (!res.ok) throw new Error();
      
      const data = await res.json();
      if (data) {
        setChatMessages(prev => [...prev, {
          role: 'model',
          content: data.response,
          sources: data.sources
        }]);
      }
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'model',
        content: "Failed to connect to the assistant. Please try again."
      }]);
    } finally {
      setIsChatLoading(false);
    }
  }

  function handleSubmitAsk() {
    sendChatMessage();
  }

  // Every "ask" entry point flips the composer rather than opening a separate
  // surface, so there is exactly one place a question gets typed.
  const enterAskMode = useCallback(() => {
    setComposerMode("ask");
    requestAnimationFrame(() => {
      document.getElementById(SEARCH_INPUT_ID)?.focus();
    });
  }, []);

  const handleAskAboutThis = (targetTitle: string) => {
    setChatInput(`Tell me more about the resource: "${targetTitle}"`);
    setSelectedBookmarkId(null);
    enterAskMode();
  };

  // --- HTML Bookmarks HTML Import File Upload ---
  async function handleHtmlImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.name.endsWith(".html")) {
      setError("Please select a valid exported HTML bookmark file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Import file exceeds the 2MB size limit.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/bookmarks/import`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Bulk import failed.");
      }

      const resData = await res.json();
      fetchBookmarks();
      alert(resData.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse and import bookmark file.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // --- Document upload (PDF / text / markdown / docx) ---
  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploadNotice("");
    const token = await getToken();
    let failures = 0;
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${API_BASE}/documents/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          failures++;
          setUploadNotice(errData.detail || `Couldn't upload ${file.name}.`);
          continue;
        }
        const resData = await res.json();
        if (resData.data) {
          // Optimistic: show the new item immediately; per-item polling finishes it.
          setBookmarks(prev => [resData.data, ...prev.filter(b => b.id !== resData.data.id)]);
        }
      } catch {
        failures++;
        setUploadNotice(`Couldn't upload ${file.name}.`);
      }
    }
    if (!failures && files.length > 1) {
      setUploadNotice(`Uploading ${files.length} documents…`);
    }
  }, [getToken]);

  const dragDepth = useRef(0);
  const handleDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsDragging(false);
      }
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) uploadFiles(files);
  };

  // --- Modal Helpers ---
  function openEdit(bookmark: Bookmark) {
    setTitle(bookmark.title);
    setUrl(bookmark.url ?? "");
    setEditingId(bookmark.id);
    setSelectedCategory(bookmark.category || null);
    setDialogTags(bookmark.tags ? bookmark.tags.join(", ") : "");
    setCustomCategory("");
    setError("");
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setIsDialogOpen(false);
    setEditingId(null);
    setTitle(""); setUrl(""); setError("");
    setSelectedCategory(null); setDialogTags(""); setCustomCategory("");
  }

  // Close modal dialogs on ESC key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { 
      if (e.key === "Escape") {
        closeDialog();
        setDeleteTargetId(null);
      }
    }
    if (isDialogOpen || deleteTargetId !== null) { 
      window.addEventListener("keydown", onKey); 
      return () => window.removeEventListener("keydown", onKey); 
    }
  }, [isDialogOpen, deleteTargetId]);

  // --- Data Selectors ---
  const safeBookmarks = useMemo(() => Array.isArray(bookmarks) ? bookmarks : [], [bookmarks]);

  const categories = useMemo(() => {
    return ["All", ...Array.from(new Set(safeBookmarks.map(b => b.category).filter(Boolean)))];
  }, [safeBookmarks]);

  // Ranked by how much of the vault each tag actually covers, so the sidebar
  // and the composer chips agree on which tags matter and in what order.
  const rankedTags = useMemo<RankedTag[]>(() => {
    const counts = new Map<string, number>();
    safeBookmarks.forEach(b => {
      if (Array.isArray(b.tags)) {
        b.tags.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
      }
    });
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [safeBookmarks]);

  const visible = useMemo(() => {
    return safeBookmarks.filter(b => {
      const matchesCategory = (activeCategory === "All" || b.category === activeCategory || b.status === "processing");
      const matchesTag = (!selectedTag || (b.tags && b.tags.includes(selectedTag)));
      return matchesCategory && matchesTag;
    });
  }, [safeBookmarks, activeCategory, selectedTag]);

  const selectedBookmark = useMemo(() => {
    if (selectedBookmarkId === null) return null;
    return safeBookmarks.find(b => b.id === selectedBookmarkId) || null;
  }, [safeBookmarks, selectedBookmarkId]);

  // --- Dynamic Layout Calculations ---
  const isAskMode = composerMode === "ask";
  // An empty Ask view keeps the hero composer and scrolls like the vault does;
  // once there is a transcript the column switches to a fixed-height chat
  // layout with the composer docked at the bottom.
  const isConversationView = isAskMode && (chatMessages.length > 0 || isChatLoading);
  const desktopSidebarWidth = isSidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const showDetailRightPanel = !isMobile && selectedBookmarkId !== null;
  const rightPanelPadding = showDetailRightPanel ? 420 : 0;

  // The sidebar's search affordance focuses the one input the page already owns
  // rather than duplicating search state up here.
  const focusSearchInput = useCallback(() => {
    const el = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
    el?.focus();
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const openAddDialog = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setUrl("");
    setError("");
    setIsDialogOpen(true);
  }, []);

  return (
    <>
      {/* ══════════════════════════════ LANDING PAGE ══════════════════════════ */}
      <Show when="signed-out">
        <LandingPage />
      </Show>

      {/* ══════════════════════════════ APP SHELL ═════════════════════════════ */}
      <Show when="signed-in">
        <div
          style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg)" }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Global drag-and-drop overlay */}
          {isDragging && (
            <div
              className="pointer-events-none fixed inset-0 z-[500] flex items-center justify-center"
              style={{ background: "color-mix(in srgb, var(--accent) 12%, rgba(0,0,0,0.35))", backdropFilter: "blur(2px)" }}
            >
              <div className="rounded-2xl border-2 border-dashed border-white/70 bg-black/30 px-10 py-8 text-center text-white">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <div className="text-base font-semibold">Drop to add to your vault</div>
                <div className="mt-1 text-xs opacity-80">PDF, text, Markdown, or Word documents</div>
              </div>
            </div>
          )}

          {/* Mobile-only chrome — the desktop shell has no top bar at all */}
          {isMounted && isMobile && (
            <MobileBar
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              onOpenChat={enterAskMode}
            />
          )}

          <div style={{ display: "flex", flex: 1, position: "relative" }}>

            {/* Sidebar Menu Drawer */}
            <Sidebar
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={handleToggleSidebarCollapse}
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              categories={categories}
              bookmarks={safeBookmarks}
              getCategoryColor={getCategoryColor}
              showArchived={showArchived}
              setShowArchived={setShowArchived}
              selectedTag={selectedTag}
              setSelectedTag={setSelectedTag}
              rankedTags={rankedTags}
              isMobile={isMobile}
              isMobileOpen={isSidebarOpen}
              onCloseMobile={() => setIsSidebarOpen(false)}
              isMounted={isMounted}
              onOpenChat={enterAskMode}
              onOpenAdd={openAddDialog}
              onUploadFiles={uploadFiles}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onFocusSearch={focusSearchInput}
            />

            {/* Main Application Feed Column */}
            <main
              style={{
                marginLeft: isMounted ? (isMobile ? 0 : `${desktopSidebarWidth}px`) : `${SIDEBAR_WIDTH_EXPANDED}px`,
                marginRight: isMounted ? `${rightPanelPadding}px` : 0,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                // A running conversation pins the composer to the bottom, so the
                // column takes a definite height and scrolls internally instead
                // of letting the whole page grow.
                height: isConversationView
                  ? (isMobile ? `calc(100vh - ${MOBILE_BAR_HEIGHT}px)` : "100vh")
                  : undefined,
                overflow: isConversationView ? "hidden" : undefined,
                minHeight: isMounted && isMobile ? `calc(100vh - ${MOBILE_BAR_HEIGHT}px)` : "100vh",
                position: "relative",
                transition: "margin-left 0.2s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                padding: isMounted ? (isMobile ? "24px 20px" : "40px 48px") : "40px 48px",
              }}
            >
            <div
              style={{
                width: "100%",
                // Prose wants a narrower measure than a card grid does.
                maxWidth: isAskMode ? "880px" : "1360px",
                margin: "0 auto",
                // Only the conversation needs a constrained flex column. Making
                // the browse column a flex item with `flex-basis: 0` would let
                // a tall card grid overflow instead of extending the page.
                ...(isConversationView
                  ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }
                  : {}),
              }}
            >
              {/* One input for both jobs: semantic search and RAG chat */}
              {!isConversationView && (
                <Composer
                  mode={composerMode}
                  setMode={setComposerMode}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  onSubmitAsk={handleSubmitAsk}
                  isChatLoading={isChatLoading}
                  rankedTags={rankedTags}
                  selectedTag={selectedTag}
                  setSelectedTag={setSelectedTag}
                  onOpenAdd={openAddDialog}
                  onUploadFiles={uploadFiles}
                  isMobile={isMobile}
                  itemCount={safeBookmarks.length}
                />
              )}

              {/* Upload notice (multi-file / errors) */}
              {uploadNotice && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-(--border) bg-(--surface) px-3.5 py-2 text-[13px] text-(--text-secondary)">
                  <span>{uploadNotice}</span>
                  <button
                    onClick={() => setUploadNotice("")}
                    aria-label="Dismiss"
                    className="focus-ring rounded-md px-1.5 text-(--text-muted) outline-none hover:text-(--text)"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* ── Ask mode: the conversation replaces the grid entirely ── */}
              {isAskMode && (
                <>
                  <Conversation
                    messages={chatMessages}
                    isLoading={isChatLoading}
                    onSelectSource={setSelectedBookmarkId}
                    onBackToVault={() => setComposerMode("browse")}
                    onNewConversation={() => setChatMessages([])}
                    onUseSuggestion={prompt => {
                      setChatInput(prompt);
                      focusSearchInput();
                    }}
                    rankedTags={rankedTags}
                    categories={categories}
                    itemCount={safeBookmarks.length}
                  />

                  {isConversationView && (
                    <Composer
                      variant="docked"
                      mode={composerMode}
                      setMode={setComposerMode}
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      chatInput={chatInput}
                      setChatInput={setChatInput}
                      onSubmitAsk={handleSubmitAsk}
                      isChatLoading={isChatLoading}
                      rankedTags={rankedTags}
                      selectedTag={selectedTag}
                      setSelectedTag={setSelectedTag}
                      onOpenAdd={openAddDialog}
                      onUploadFiles={uploadFiles}
                      isMobile={isMobile}
                      itemCount={safeBookmarks.length}
                    />
                  )}
                </>
              )}

              {/* Section heading — the stats line rides along on the right
                  instead of floating on its own row above the composer. */}
              {!isAskMode && (
              <div style={{ marginBottom: "24px" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                  <h2 className="text-[20px] font-bold tracking-[-0.4px] text-(--text)">
                    {showArchived
                      ? "Archive"
                      : searchQuery
                        ? `Results for "${searchQuery}"`
                        : activeCategory === "All"
                          ? "All items"
                          : activeCategory}
                  </h2>
                  <StatsStrip stats={vaultStats} />
                </div>
                {selectedTag && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.05em" }}>FILTERING BY TAG:</span>
                    <button
                      onClick={() => setSelectedTag(null)}
                      aria-label={`Clear tag filter: ${selectedTag}`}
                      className="focus-ring inline-flex items-center gap-1 rounded-[20px] border px-2.5 py-0.75 text-[11px] font-semibold outline-none"
                      style={{
                        background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                        borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
                        color: "var(--accent)",
                      }}
                    >
                      {selectedTag}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              )}

              {/* Skeleton Loader Overlay */}
              {!isAskMode && isBookmarksLoading && visible.length === 0 && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMounted ? (isMobile ? "1fr" : "repeat(auto-fill, minmax(380px, 1fr))") : "repeat(auto-fill, minmax(380px, 1fr))",
                  gap: "16px"
                }}>
                  {[1, 2, 3].map(i => (
                    <div
                      key={i}
                      style={{
                        background: "var(--surface-hover)",
                        border: "1px solid var(--border)",
                        borderRadius: "16px",
                        padding: "20px",
                        height: "140px",
                        animation: "pulse 1.5s infinite ease-in-out"
                      }}
                    />
                  ))}
                </div>
              )}

              {/* In-app empty states */}
              {!isAskMode && !isBookmarksLoading && visible.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: "80px", color: "var(--text-muted)" }}>
                  <div style={{
                    width: "64px", height: "64px", background: "var(--surface)",
                    borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 16px",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  
                  {searchQuery ? (
                    <>
                      <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                        Nothing found for &ldquo;{searchQuery}&rdquo;.
                      </p>
                      <p style={{ fontSize: "13px", maxWidth: "420px", margin: "0 auto", lineHeight: 1.5 }}>
                        This search understands concepts, not just keywords. Try asking a question, such as: &ldquo;what did I save about Python?&rdquo; or &ldquo;anything about caching&rdquo;.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                        Your vault is empty.
                      </p>
                      <p style={{ fontSize: "13px", maxWidth: "440px", margin: "0 auto 20px", lineHeight: 1.5 }}>
                        Save a link or drop in a PDF, Word, or text document — the AI reads it, summarizes it, and makes it searchable and chat-able.
                      </p>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                        <Button
                          onClick={() => { setEditingId(null); setTitle(""); setUrl(""); setError(""); setIsDialogOpen(true); }}
                        >
                          Add your first item
                        </Button>
                        <Button variant="secondary" onClick={() => setIsSettingsOpen(true)}>
                          Import bookmarks
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Bookmark Grid Layout */}
              {!isAskMode && !isBookmarksLoading && visible.length > 0 && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMounted ? (isMobile ? "1fr" : "repeat(auto-fill, minmax(380px, 1fr))") : "repeat(auto-fill, minmax(380px, 1fr))",
                  gap: "20px",
                  alignItems: "start",
                  paddingBottom: "40px"
                }}>
                  {visible.map((bookmark, idx) => (
                    <BookmarkCard
                      key={bookmark.id}
                      bookmark={bookmark}
                      index={idx}
                      selectedTag={selectedTag}
                      setSelectedTag={setSelectedTag}
                      toggleArchive={toggleArchive}
                      openEdit={openEdit}
                      setDeleteTargetId={setDeleteTargetId}
                      getCategoryColor={getCategoryColor}
                      timeAgo={timeAgo}
                      onClick={() => setSelectedBookmarkId(bookmark.id)}
                    />
                  ))}
                </div>
              )}
            </div>
            </main>

            {/* Right Sliding Detail Panel */}
            <DetailPanel
              isOpen={selectedBookmarkId !== null}
              bookmark={selectedBookmark}
              onClose={() => setSelectedBookmarkId(null)}
              onOpenEdit={openEdit}
              onToggleArchive={toggleArchive}
              onDelete={setDeleteTargetId}
              onAskAboutThis={handleAskAboutThis}
              getCategoryColor={getCategoryColor}
              isMobile={isMobile}
              relatedBookmarks={relatedBookmarks}
              isRelatedLoading={isRelatedLoading}
              onSelectBookmark={setSelectedBookmarkId}
              onReanalyze={handleReanalyze}
              reanalyzingId={reanalyzingId}
            />

            {/* Settings & Tools Drawer */}
            <SettingsDrawer
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              handleHtmlImport={handleHtmlImport}
              isMobile={isMobile}
            />
          </div>
        </div>
      </Show>

      {/* ══════════════════════════ ADD / EDIT DIALOG ════════════════════════ */}
      <AddEditDialog
        isOpen={isDialogOpen}
        editingId={editingId}
        title={title}
        setTitle={setTitle}
        url={url}
        setUrl={setUrl}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        customCategory={customCategory}
        setCustomCategory={setCustomCategory}
        dialogTags={dialogTags}
        setDialogTags={setDialogTags}
        categories={categories}
        getCategoryColor={getCategoryColor}
        error={error}
        loading={loading}
        onClose={closeDialog}
        onSave={editingId ? updateBookmark : addBookmark}
        onUploadFiles={(files) => { uploadFiles(files); closeDialog(); }}
      />

      {/* ══════════════════════════ DELETE CONFIRM ════════════════════════════ */}
      {deleteTargetId !== null && (
        <div onClick={() => setDeleteTargetId(null)} style={{
          position: "fixed", inset: 0, background: "var(--overlay)",
          backdropFilter: "blur(6px)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 999, padding: "16px",
          animation: "fadeIn 0.2s ease-out",
        }}>
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-95 rounded-[20px] border p-7 text-center"
            style={{
              background: "var(--surface)",
              borderColor: "color-mix(in srgb, var(--danger) 20%, transparent)",
              boxShadow: "var(--shadow-lg)",
              animation: "dialogSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            <div
              className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-[14px] border"
              style={{ background: "var(--danger-bg)", borderColor: "color-mix(in srgb, var(--danger) 20%, transparent)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            </div>
            <h2 className="mb-2 text-[17px] font-bold text-(--text)">Delete this item?</h2>
            <p className="mb-6 text-[13px] leading-[1.65] text-(--text-muted)">
              This action cannot be undone. The item, its AI summary, and any uploaded file will be permanently removed.
            </p>
            <div className="flex gap-2.5">
              <Button variant="secondary" fullWidth onClick={() => setDeleteTargetId(null)}>
                Cancel
              </Button>
              <button
                onClick={confirmDelete}
                className="focus-ring flex-1 rounded-xl border-none px-3 py-2.5 text-sm font-semibold text-(--on-danger) outline-none"
                style={{ background: "var(--danger)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}