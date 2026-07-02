"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Show, SignInButton, UserButton, useAuth } from "@clerk/nextjs";

type Bookmark = {
  id: number;
  title: string;
  url: string;
  summary: string;
  category: string;
  created_at: string;
  status?: string;
  is_archived?: boolean;
};

type ChatMessage = {
  role: 'user' | 'model';
  content: string;
  sources?: Bookmark[];
};

const renderFormattedText = (text: string, sources?: Bookmark[]) => {
  if (!text) return null;
  const lines = text.split("\n");
  
  return lines.map((line, lineIdx) => {
    let cleanLine = line;
    let isBullet = false;

    // Detect bullet point: starts with "* " or "- "
    if (cleanLine.trim().startsWith("* ") || cleanLine.trim().startsWith("- ")) {
      isBullet = true;
      // Strip out the bullet marker
      const markerIndex = cleanLine.indexOf(cleanLine.trim().startsWith("* ") ? "*" : "-");
      cleanLine = cleanLine.substring(markerIndex + 2);
    }

    // Parse bold tags "**bold**" and citations "[1]" inside the line
    const elements: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|\[\d+\])/g;
    const tokens = cleanLine.split(regex);

    tokens.forEach((token, tIdx) => {
      if (token.startsWith("**") && token.endsWith("**")) {
        const boldText = token.slice(2, -2);
        elements.push(<strong key={tIdx} style={{ color: "var(--text)", fontWeight: 600 }}>{boldText}</strong>);
      } else if (token.startsWith("[") && token.endsWith("]")) {
        const sourceNum = parseInt(token.slice(1, -1), 10);
        if (sources && sourceNum > 0 && sourceNum <= sources.length) {
          const source = sources[sourceNum - 1];
          elements.push(
            <a 
              key={tIdx}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: "10px",
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: "4px",
                background: "rgba(139,92,246,0.2)",
                color: "#a78bfa",
                textDecoration: "none",
                margin: "0 2px",
                verticalAlign: "super"
              }}
              title={source.title}
            >
              {sourceNum}
            </a>
          );
        } else {
          elements.push(token);
        }
      } else {
        elements.push(token);
      }
    });

    if (isBullet) {
      return (
        <div key={lineIdx} style={{ display: "flex", gap: "8px", marginLeft: "12px", marginBottom: "6px" }}>
          <span style={{ color: "#a78bfa" }}>•</span>
          <div>{elements}</div>
        </div>
      );
    }

    return (
      <div key={lineIdx} style={{ marginBottom: "8px", minHeight: cleanLine.trim() === "" ? "8px" : "auto" }}>
        {elements}
      </div>
    );
  });
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  
  // If the ISO date string has no timezone suffix, force it to be treated as UTC
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

const VALID_CATEGORIES = [
  "Backend", "Frontend", "AI/ML", "DevOps", "Database",
  "Mobile", "Security", "Cloud", "Productivity", "Programming", "Other",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Backend":     "#3b82f6",
  "Frontend":    "#f43f5e",
  "AI/ML":       "#8b5cf6",
  "DevOps":      "#f59e0b",
  "Database":    "#10b981",
  "Mobile":      "#ec4899",
  "Security":    "#ef4444",
  "Cloud":       "#06b6d4",
  "Productivity":"#84cc16",
  "Programming": "#a78bfa",
  "Other":       "#6b7280",
};

function getCategoryColor(cat: string) {
  return CATEGORY_COLORS[cat] || "#6b7280";
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function Home() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  // null = "Auto (AI)" — let backend Gemini decide
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // RAG Chat States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  
  const { getToken } = useAuth();

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);
  
  const [isMounted, setIsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 0);
    function checkRes() {
      setIsMobile(window.innerWidth <= 768);
    }
    checkRes();
    window.addEventListener("resize", checkRes);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkRes);
    };
  }, []);

  const showMobileUI = isMounted && isMobile;
  
  // ── Swipe-to-refresh Touch Gesture Hooks ─────────────────────────────────
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  function handleTouchStart(e: React.TouchEvent) {
    if (window.scrollY === 0 && !isRefreshing) {
      setTouchStart(e.touches[0].clientY);
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStart === null || isRefreshing) return;
    const rawDistance = e.touches[0].clientY - touchStart;
    if (rawDistance > 0) {
      // Damped pull math to make the pull feel premium and resistive
      const pull = Math.min(80, Math.pow(rawDistance, 0.85));
      setPullOffset(pull);
      // Prevent browser default pull-to-refresh if we are handling it
      if (e.cancelable) e.preventDefault();
    }
  }

  async function handleTouchEnd() {
    if (touchStart === null || isRefreshing) return;
    setTouchStart(null);

    if (pullOffset >= 55) {
      setIsRefreshing(true);
      setPullOffset(55); // Hold indicator at nice spinning offset
      try {
        await fetchBookmarks();
      } catch {
        // silently catch
      } finally {
        // Smoothly animate retraction
        setTimeout(() => {
          setIsRefreshing(false);
          setPullOffset(0);
        }, 600);
      }
    } else {
      setPullOffset(0);
    }
  }

  const fetchBookmarks = useCallback(async (archivedOverride?: boolean) => {
    try {
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
    }
  }, [getToken, showArchived]);

  const searchBookmarks = useCallback(async (query: string) => {
    if (!query.trim()) { fetchBookmarks(); return; }
    try {
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
    }
  }, [getToken, fetchBookmarks]);

  async function addBookmark() {
    if (!title.trim() || !url.trim()) { setError("Please enter both title and URL."); return; }
    
    let normalizedUrl = url.trim();
    if (!normalizedUrl.includes("://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    
    try { new URL(normalizedUrl); } catch { setError("Please enter a valid URL (e.g. https://example.com)."); return; }
    
    const originalTitle = title;
    const originalUrl = normalizedUrl;
    const originalCategory = selectedCategory;
    const optimisticId = -Date.now();

    const optimisticBookmark: Bookmark = {
      id: optimisticId,
      title: originalTitle || "New Bookmark",
      url: originalUrl,
      summary: "AI is analyzing...",
      category: originalCategory || "Other",
      created_at: new Date().toISOString(),
      status: "processing"
    };

    // Close dialog and clear inputs instantly
    setIsDialogOpen(false);
    setTitle(""); 
    setUrl("");
    setSelectedCategory(null);
    setError("");

    // Optimistically prepend to list
    setBookmarks(prev => [optimisticBookmark, ...prev]);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ title: originalTitle, url: originalUrl, category: originalCategory }),
      });
      
      if (!res.ok) {
        throw new Error("failed");
      }
      
      const resData = await res.json();
      if (resData && resData.data) {
        setBookmarks(prev => 
          prev.map(b => b.id === optimisticId ? resData.data : b)
        );
      } else {
        fetchBookmarks();
      }
    } catch (err) {
      // Revert optimistic insert on failure
      setBookmarks(prev => prev.filter(b => b.id !== optimisticId));
      setError("Failed to connect to the server. Bookmark could not be saved.");
    }
  }

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
    const originalCategory = selectedCategory;

    const currentBookmark = bookmarks.find(b => b.id === targetId);
    const urlChanged = currentBookmark ? currentBookmark.url !== originalUrl : true;

    // Close dialog and reset state instantly
    setIsDialogOpen(false);
    setEditingId(null);
    setTitle(""); 
    setUrl("");
    setSelectedCategory(null);
    setError("");

    // Optimistically update list card styling and state
    setBookmarks(prev => 
      prev.map(b => b.id === targetId ? {
        ...b,
        title: originalTitle,
        url: originalUrl,
        category: originalCategory || b.category,
        status: urlChanged || !originalCategory ? "processing" : b.status,
        summary: urlChanged || !originalCategory ? "AI is re-analyzing..." : b.summary
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
        body: JSON.stringify({ title: originalTitle, url: originalUrl, category: originalCategory }),
      });
      
      if (!res.ok) {
        throw new Error("failed");
      }
      
      const resData = await res.json();
      if (resData && resData.data) {
        setBookmarks(prev => 
          prev.map(b => b.id === targetId ? resData.data : b)
        );
      } else {
        fetchBookmarks();
      }
    } catch (err) {
      // Revert optimistic changes on failure
      fetchBookmarks();
      setError("Failed to update bookmark. Reverted to previous state.");
    }
  }

  async function confirmDelete() {
    if (deleteTargetId === null) return;
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks/${deleteTargetId}`, { 
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      setDeleteTargetId(null);
      fetchBookmarks();
    } catch {
      setDeleteTargetId(null);
      setError("Delete failed. The server might be waking up; please try again shortly.");
    }
  }

  async function toggleArchive(bookmarkId: number) {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks/${bookmarkId}/archive`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
      } else {
        setError("Failed to archive/unarchive bookmark.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    }
  }

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
          history: currentHistory.map(m => ({ role: m.role, content: m.content }))
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
        content: "Failed to connect to the assistant. Please verify your connection."
      }]);
    } finally {
      setIsChatLoading(false);
    }
  }

  function openEdit(bookmark: Bookmark) {
    setTitle(bookmark.title);
    setUrl(bookmark.url);
    setEditingId(bookmark.id);
    // Pre-select the current category so the user can see and optionally change it
    setSelectedCategory(bookmark.category || null);
    setError("");
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setIsDialogOpen(false);
    setEditingId(null);
    setTitle(""); setUrl(""); setError("");
    setSelectedCategory(null);
  }

  useEffect(() => {
    fetchBookmarks();
  }, [showArchived, fetchBookmarks]);

  // Debounce search — wait 300ms after the user stops typing before hitting the backend
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

  // Poll backend for updates if there are any bookmarks currently in a 'processing' state
  useEffect(() => {
    const hasProcessing = bookmarks.some(b => b.status === "processing");
    if (hasProcessing) {
      const timer = setTimeout(() => {
        fetchBookmarks();
      }, 1500); // Poll every 1.5s for faster responsive updates
      return () => clearTimeout(timer);
    }
  }, [bookmarks, fetchBookmarks]);

  // Close dialog on ESC key
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeDialog(); }
    if (isDialogOpen) { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }
  }, [isDialogOpen]);

  const safeBookmarks = Array.isArray(bookmarks) ? bookmarks : [];

  const categories = ["All", ...Array.from(new Set(safeBookmarks.map(b => b.category).filter(Boolean)))];

  const visible = safeBookmarks.filter(b =>
    (activeCategory === "All" || b.category === activeCategory || b.status === "processing")
  );

  // ─── Styles ────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px",
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "12px", color: "var(--text)", fontSize: "14px",
    outline: "none", fontFamily: "inherit", transition: "border-color 0.2s",
  };

  const btnSecondary: React.CSSProperties = {
    padding: "10px 20px", background: "var(--surface)",
    border: "1px solid var(--border)", borderRadius: "12px",
    color: "var(--text-secondary)", fontSize: "14px", fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 24px",
    background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
    border: "none", borderRadius: "12px", color: "white",
    fontSize: "14px", fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px",
    transition: "opacity 0.2s",
  };

  const iconBtn: React.CSSProperties = {
    width: "30px", height: "30px", background: "var(--surface)",
    border: "1px solid var(--border)", borderRadius: "8px",
    color: "var(--text-muted)", display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "pointer", transition: "background 0.15s, color 0.15s, border-color 0.15s",
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(6px)", zIndex: 100,
    display: "flex", alignItems: "center", justifyContent: "center",
    animation: "overlayFadeIn 0.2s ease",
  };

  const dialogStyle: React.CSSProperties = {
    background: "#111118", border: "1px solid rgba(139,92,246,0.25)",
    borderRadius: "20px", padding: isMounted ? (isMobile ? "20px" : "32px") : "32px", width: "90%", maxWidth: "460px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.08)",
    animation: "dialogSlideIn 0.25s ease",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
    display: "block", marginBottom: "6px", letterSpacing: "0.06em",
  };

  return (
    <>
      {/* ══════════════════════════════ LOGIN SCREEN ══════════════════════════ */}
      <Show when="signed-out">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
          <div style={{ textAlign: "center", background: "var(--surface)", padding: "48px", borderRadius: "20px", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
            <div style={{
              width: "56px", height: "56px", margin: "0 auto 20px",
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "var(--text)", marginBottom: "12px", letterSpacing: "-0.5px" }}>AI Bookmark Vault</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "32px", fontSize: "15px" }}>Sign in to manage your private bookmarks.</p>
            <SignInButton mode="modal">
              <button style={{...btnPrimary, margin: "0 auto", padding: "12px 32px", fontSize: "15px"}}>
                Sign In to Vault
              </button>
            </SignInButton>
          </div>
        </div>
      </Show>

      {/* ══════════════════════════════ APP SHELL ═════════════════════════════ */}
      <Show when="signed-in">
        <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>

          {/* Mobile sidebar overlay back-drop */}
          {showMobileUI && isSidebarOpen && (
            <div 
              onClick={() => setIsSidebarOpen(false)}
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(4px)", zIndex: 99,
              }}
            />
          )}

          {/* ══════════════════════════════ SIDEBAR ══════════════════════════════ */}
          <aside style={{
            width: "260px", minHeight: "100vh",
            background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            position: "fixed", top: 0, 
            left: isMounted ? (isMobile ? (isSidebarOpen ? 0 : "-260px") : 0) : 0, 
            bottom: 0, zIndex: 100,
            transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          }}>

            {/* Logo and User Profile */}
            <div style={{ padding: "28px 24px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "36px", height: "36px",
                    background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                    borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>AI Bookmark Vault</div>
                  </div>
                </div>
                {/* Clerk User Button */}
                <UserButton appearance={{ elements: { userButtonAvatarBox: { width: "32px", height: "32px" } } }} />
              </div>
            </div>

        {/* Add button and Chat button */}
        <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            onClick={() => { setEditingId(null); setTitle(""); setUrl(""); setError(""); setIsDialogOpen(true); }}
            style={{
              width: "100%", padding: "10px 16px",
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              border: "none", borderRadius: "12px", color: "white",
              fontSize: "14px", fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              transition: "opacity 0.2s, transform 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Bookmark
          </button>
          
          <button
            onClick={() => { setIsChatOpen(true); if (isMobile) setIsSidebarOpen(false); }}
            style={{
              width: "100%", padding: "10px 16px",
              background: "rgba(139,92,246,0.12)",
              border: "1px solid rgba(139,92,246,0.3)",
              borderRadius: "12px", color: "#a78bfa",
              fontSize: "14px", fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.18)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.12)"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat Assistant
          </button>
        </div>

        <div style={{ height: "1px", background: "var(--border)", margin: "0 16px 16px" }} />

        {/* Categories */}
        <div style={{ padding: "0 12px", flex: 1, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px 10px" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Categories
            </span>
            <button
              onClick={() => setShowArchived(prev => !prev)}
              style={{
                background: showArchived ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.05)",
                border: showArchived ? "1px solid rgba(139,92,246,0.3)" : "1px solid var(--border)",
                borderRadius: "6px",
                color: showArchived ? "#a78bfa" : "var(--text-muted)",
                fontSize: "10px",
                fontWeight: 600,
                padding: "2px 8px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {showArchived ? "Showing Archived" : "View Archive"}
            </button>
          </div>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); if (isMobile) setIsSidebarOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: "10px", border: "none",
                background: activeCategory === cat ? "rgba(139,92,246,0.12)" : "transparent",
                color: activeCategory === cat ? "#8b5cf6" : "var(--text-secondary)",
                fontSize: "13.5px", fontWeight: activeCategory === cat ? 600 : 400,
                cursor: "pointer", textAlign: "left",
                transition: "background 0.15s, color 0.15s", marginBottom: "2px",
              }}
            >
              <span style={{
                width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                background: cat === "All" ? "linear-gradient(135deg, #8b5cf6, #6366f1)" : getCategoryColor(cat),
              }} />
              {cat}
              <span style={{
                marginLeft: "auto", fontSize: "11px", padding: "1px 8px", borderRadius: "20px",
                background: activeCategory === cat ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.05)",
                color: activeCategory === cat ? "#a78bfa" : "var(--text-muted)", fontWeight: 500,
              }}>
                {cat === "All" ? safeBookmarks.length : safeBookmarks.filter(b => b.category === cat).length}
              </span>
            </button>
          ))}
        </div>

        {/* Stats footer */}
        <div style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 600, letterSpacing: "0.05em" }}>VAULT STATS</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ flex: 1, background: "var(--surface)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>{safeBookmarks.length}</div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", fontWeight: 500 }}>Saved</div>
            </div>
            <div style={{ flex: 1, background: "var(--surface)", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)" }}>{categories.length - 1}</div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", fontWeight: 500 }}>Topics</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════ MAIN ══════════════════════════════════ */}
      <main 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          marginLeft: isMounted ? (isMobile ? 0 : "260px") : "260px", 
          flex: 1, 
          display: "flex", 
          flexDirection: "column", 
          minHeight: "100vh",
          position: "relative",
          width: isMounted ? (isMobile ? "100%" : "calc(100% - 260px)") : "calc(100% - 260px)"
        }}
      >
        {/* Swipe-to-refresh premium visual spinner */}
        <div style={{
          position: "absolute",
          top: `${pullOffset - 40}px`,
          left: "50%",
          transform: "translateX(-50%)",
          width: "36px",
          height: "36px",
          borderRadius: "50%",
          background: "#161622",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5), 0 0 12px rgba(139, 92, 246, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 99,
          opacity: pullOffset > 10 ? Math.min(1, (pullOffset - 10) / 30) : 0,
          transition: isRefreshing ? "top 0.15s ease" : "none",
          pointerEvents: "none",
        }}>
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#8b5cf6" 
            strokeWidth="3" 
            strokeLinecap="round" 
            style={{
              transform: `rotate(${pullOffset * 6}deg)`,
              animation: isRefreshing ? "spin 0.8s linear infinite" : "none",
              transition: isRefreshing ? "none" : "transform 0.05s linear",
            }}
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </div>

        {/* Sticky top bar */}
        <div style={{
          position: "sticky", top: 0, zIndex: 9,
          background: "rgba(7,7,10,0.85)", backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--border)",
          padding: isMounted ? (isMobile ? "10px 16px" : "14px 32px") : "14px 32px", 
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          {showMobileUI && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              style={{
                background: "none", border: "none", color: "var(--text)", 
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                padding: "6px", marginRight: "4px"
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          <div style={{ position: "relative", flex: 1, maxWidth: "460px" }}>
            <svg style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, paddingLeft: "40px", padding: "10px 14px 10px 40px" }}
              onFocus={e => e.target.style.borderColor = "var(--accent)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
          </div>
          {/*<div style={{ marginLeft: "auto", fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {visible.length} bookmark{visible.length !== 1 ? "s" : ""}
          </div>*/}
        </div>

        {/* Page content */}
        <div style={{ padding: isMounted ? (isMobile ? "16px" : "32px") : "32px", flex: 1 }}>

          {/* Heading */}
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>
              {activeCategory === "All" ? "All Bookmarks" : activeCategory}
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
              {searchQuery
                ? `Showing results for "${searchQuery}"`
                : `${visible.length} bookmark${visible.length !== 1 ? "s" : ""} saved`}
            </p>
          </div>

          {/* Empty state */}
          {visible.length === 0 && (
            <div style={{ textAlign: "center", paddingTop: "80px", color: "var(--text-muted)" }}>
              <div style={{
                width: "72px", height: "72px", background: "var(--surface)",
                borderRadius: "20px", display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px",
              }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
                {searchQuery ? `No results for "${searchQuery}"` : "No bookmarks yet"}
              </p>
              <p style={{ fontSize: "13px" }}>
                {searchQuery ? "Try a different search term" : "Click 'Add Bookmark' to save your first link"}
              </p>
            </div>
          )}

          {/* Bookmark grid */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: isMounted ? (isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))") : "repeat(auto-fill, minmax(340px, 1fr))", 
            gap: "16px" 
          }}>
            {visible.map((bookmark, index) => (
              <div
                key={bookmark.id}
                style={{
                  background: "rgba(255,255,255,0.025)", border: "1px solid var(--border)",
                  borderRadius: "16px", padding: "20px",
                  transition: "transform 0.2s, border-color 0.3s ease, box-shadow 0.2s, background-color 0.3s ease",
                  animation: "fadeInUp 0.4s ease both",
                  animationDelay: `${index * 0.05}s`,
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = "translateY(-3px)";
                  el.style.borderColor = "rgba(139,92,246,0.3)";
                  el.style.boxShadow = "0 10px 36px rgba(139,92,246,0.1)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = "translateY(0)";
                  el.style.borderColor = "var(--border)";
                  el.style.boxShadow = "none";
                }}
              >
                {/* Card header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px",
                      background: bookmark.status === "processing" ? "rgba(255, 255, 255, 0.05)" : `${getCategoryColor(bookmark.category)}1a`,
                      color: bookmark.status === "processing" ? "var(--text-muted)" : getCategoryColor(bookmark.category),
                      border: `1px solid ${bookmark.status === "processing" ? "var(--border)" : `${getCategoryColor(bookmark.category)}33`}`,
                      letterSpacing: "0.03em",
                      transition: "background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease",
                    }}>
                      {bookmark.status === "processing" ? "Analyzing..." : (bookmark.category || "Uncategorized")}
                    </span>
                    {bookmark.is_archived && (
                      <span style={{
                        fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                        background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", marginLeft: "6px"
                      }}>
                        ARCHIVED
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => toggleArchive(bookmark.id)}
                      title={showArchived ? "Unarchive" : "Archive"}
                      style={iconBtn}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(139,92,246,0.1)"; b.style.color = "#8b5cf6"; b.style.borderColor = "rgba(139,92,246,0.3)"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--surface)"; b.style.color = "var(--text-muted)"; b.style.borderColor = "var(--border)"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    </button>
                    <button
                      onClick={() => { if (bookmark.status !== "processing") openEdit(bookmark); }}
                      disabled={bookmark.status === "processing"}
                      title={bookmark.status === "processing" ? "AI is analyzing this bookmark" : "Edit"}
                      style={{ ...iconBtn, opacity: bookmark.status === "processing" ? 0.4 : 1, cursor: bookmark.status === "processing" ? "not-allowed" : "pointer" }}
                      onMouseEnter={e => {
                        if (bookmark.status !== "processing") {
                          const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--surface-hover)"; b.style.color = "var(--accent)";
                        }
                      }}
                      onMouseLeave={e => {
                        if (bookmark.status !== "processing") {
                          const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--surface)"; b.style.color = "var(--text-muted)";
                        }
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTargetId(bookmark.id)}
                      title="Delete"
                      style={iconBtn}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(239,68,68,0.1)"; b.style.color = "#ef4444"; b.style.borderColor = "rgba(239,68,68,0.3)"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "var(--surface)"; b.style.color = "var(--text-muted)"; b.style.borderColor = "var(--border)"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "8px", letterSpacing: "-0.2px", lineHeight: 1.4 }}>
                  {bookmark.title || "Analyzing Title..."}
                </h3>

                {/* URL + date row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <a
                    href={bookmark.url} target="_blank" rel="noreferrer"
                    style={{
                      fontSize: "12px", color: "var(--accent)", display: "flex",
                      alignItems: "center", gap: "5px",
                      textDecoration: "none", overflow: "hidden",
                      whiteSpace: "nowrap", textOverflow: "ellipsis",
                      flex: 1, minWidth: 0,
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline"}
                    onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none"}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    {bookmark.url}
                  </a>
                  {bookmark.created_at && (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0, marginLeft: "10px" }}>
                      {timeAgo(bookmark.created_at)}
                    </span>
                  )}
                </div>

                {/* AI Summary */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px" }}>
                  <div style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: bookmark.status === "processing" ? "var(--text-muted)" : "var(--accent)",
                    marginBottom: "6px",
                    letterSpacing: "0.08em",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}>
                    {bookmark.status === "processing" && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                        style={{ animation: "spin 1s linear infinite" }}
                      >
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                    )}
                    {bookmark.status === "processing" ? "✦ AI ANALYZING..." : "✦ AI SUMMARY"}
                  </div>
                  <p style={{
                    fontSize: "12.5px",
                    color: bookmark.status === "processing" ? "var(--text-muted)" : "var(--text-secondary)",
                    lineHeight: 1.65,
                    margin: 0,
                    animation: bookmark.status === "processing" ? "pulse 1.5s infinite ease-in-out" : "none",
                    transition: "color 0.3s ease",
                  }}>
                    {bookmark.summary}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ══════════════════════════ ADD / EDIT DIALOG ════════════════════════ */}
      {isDialogOpen && (
        <div onClick={closeDialog} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={dialogStyle}>

            {/* Dialog header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
                  {editingId ? "Edit Bookmark" : "Add New Bookmark"}
                </h2>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "3px" }}>
                  {editingId ? "Update the details below" : "AI will generate a summary automatically"}
                </p>
              </div>
              <button
                onClick={closeDialog}
                style={{ width: "32px", height: "32px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Title field */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>TITLE</label>
              <input
                placeholder="e.g. OpenAI Documentation"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (editingId) {
                      updateBookmark();
                    } else {
                      addBookmark();
                    }
                  }
                }}
                autoFocus
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            {/* URL field */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>URL</label>
              <input
                placeholder="https://..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (editingId) {
                      updateBookmark();
                    } else {
                      addBookmark();
                    }
                  }
                }}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            {/* Category override */}
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>CATEGORY</label>
              <div style={{ position: "relative" }}>
                <select
                  value={selectedCategory ?? ""}
                  onChange={e => setSelectedCategory(e.target.value || null)}
                  style={{
                    ...inputStyle,
                    appearance: "none",
                    paddingRight: "36px",
                    cursor: "pointer",
                    color: selectedCategory ? getCategoryColor(selectedCategory) : "var(--text-muted)",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                >
                  <option value="">✦ Auto (AI picks)</option>
                  {VALID_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {/* Chevron icon */}
                <svg
                  style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {!selectedCategory && (
                <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "5px", marginBottom: 0 }}>
                  Gemini will assign a category automatically.
                </p>
              )}
            </div>

            {error && (
              <p style={{ fontSize: "13px", color: "#f87171", marginBottom: "16px", marginTop: "-4px" }}>
                ⚠ {error}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={closeDialog}
                style={btnSecondary}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)"}
              >
                Cancel
              </button>
              <button
                onClick={editingId ? updateBookmark : addBookmark}
                disabled={loading}
                style={{ ...btnPrimary, opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    style={{ animation: "spin 0.7s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                )}
                {loading ? (editingId ? "Saving..." : "Generating Summary...") : editingId ? "Save Changes" : "Add Bookmark"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ DELETE CONFIRM ════════════════════════════ */}
      {deleteTargetId !== null && (
        <div onClick={() => setDeleteTargetId(null)} style={overlayStyle}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...dialogStyle, maxWidth: "380px", border: "1px solid rgba(239,68,68,0.2)", textAlign: "center" }}
          >
            <div style={{
              width: "52px", height: "52px",
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
              </svg>
            </div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>Delete Bookmark?</h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "24px", lineHeight: 1.65 }}>
              This action cannot be undone. The bookmark and its AI summary will be permanently removed.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setDeleteTargetId(null)}
                style={{ ...btnSecondary, flex: 1, padding: "10px" }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)"}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: "10px", background: "#ef4444", border: "none", borderRadius: "12px", color: "white", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "#dc2626"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "#ef4444"}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════ AI CHAT DRAWER ════════════════════════════ */}
      {isChatOpen && (
        <div 
          onClick={() => setIsChatOpen(false)} 
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(4px)",
            zIndex: 200, display: "flex", justifyContent: "flex-end",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: isMobile ? "100%" : "420px", height: "100%",
              background: "#0d0d15", borderLeft: "1px solid var(--border)",
              display: "flex", flexDirection: "column",
              boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
              animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Drawer Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "30px", height: "30px",
                  background: "rgba(139,92,246,0.18)",
                  borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text)", margin: 0 }}>AI Assistant</h3>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0" }}>Ask about your vault</p>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                style={{
                  background: "none", border: "none", color: "var(--text-muted)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "6px", borderRadius: "50%",
                  transition: "background 0.15s, color 0.15s"
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Message History area */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {chatMessages.length === 0 ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "20px" }}>
                  <div style={{
                    width: "48px", height: "48px",
                    background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
                    borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: "16px", color: "#a78bfa"
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>Start a Conversation</h4>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6, maxWidth: "260px", marginBottom: "20px" }}>
                    Ask questions using information across all your saved bookmark pages.
                  </p>
                  
                  {/* Suggestions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                    {[
                      "What tech stack references do I have?",
                      "Summarize my DevOps bookmarks",
                      "Find any resources about database designs"
                    ].map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => { setChatInput(prompt); }}
                        style={{
                          width: "100%", padding: "10px 14px",
                          background: "var(--surface)", border: "1px solid var(--border)",
                          borderRadius: "10px", color: "var(--text-secondary)",
                          fontSize: "12px", textAlign: "left", cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.3)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)"; }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {chatMessages.map((msg, idx) => (
                    <div 
                      key={idx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      {/* Bubble */}
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: "14px",
                          fontSize: "13px",
                          lineHeight: 1.6,
                          background: msg.role === "user" ? "var(--surface)" : "rgba(139,92,246,0.12)",
                          border: msg.role === "user" ? "1px solid var(--border)" : "1px solid rgba(139,92,246,0.25)",
                          color: "var(--text)",
                          whiteSpace: "pre-wrap"
                        }}
                      >
                        {msg.role === "model" 
                          ? renderFormattedText(msg.content, msg.sources) 
                          : msg.content
                        }
                      </div>

                      {/* References / Sources list */}
                      {msg.sources && msg.sources.length > 0 && (() => {
                        // Extract referenced indices from msg.content (e.g. [2] -> index 2)
                        const citedIndices = new Set(
                          Array.from(msg.content.matchAll(/\[(\d+)\]/g)).map(match => parseInt(match[1], 10))
                        );
                        
                        // Filter the sources array to only include cited ones
                        const citedSources = msg.sources
                          .map((src, sIdx) => ({ src, originalIdx: sIdx + 1 }))
                          .filter(item => citedIndices.has(item.originalIdx));
                        
                        if (citedSources.length === 0) return null;

                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px", paddingLeft: "4px" }}>
                            <span style={{ fontSize: "10px", color: "var(--text-muted)", alignSelf: "center", marginRight: "4px" }}>
                              SOURCES:
                            </span>
                            {citedSources.map(({ src, originalIdx }) => (
                              <a
                                key={src.id}
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontSize: "10px",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  color: "var(--text-secondary)",
                                  textDecoration: "none",
                                  transition: "all 0.15s"
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#a78bfa"; (e.currentTarget as HTMLAnchorElement).style.background = "var(--surface-hover)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLAnchorElement).style.background = "var(--surface)"; }}
                              >
                                <span style={{ fontWeight: 700, color: "#a78bfa" }}>{originalIdx}</span>
                                <span style={{ maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {src.title || "Source"}
                                </span>
                              </a>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                  
                  {isChatLoading && (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", alignSelf: "flex-start", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: "12px", padding: "10px 14px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="3"
                        style={{ animation: "spin 0.8s linear infinite" }}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Analyzing context...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            <div style={{ padding: "20px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: "10px" }}>
              <input
                placeholder="Ask your vault..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendChatMessage(); }}
                disabled={isChatLoading}
                style={{ ...inputStyle, flex: 1, padding: "10px 14px" }}
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
              <button
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || isChatLoading}
                style={{
                  padding: "10px 14px",
                  background: (!chatInput.trim() || isChatLoading) ? "var(--surface)" : "linear-gradient(135deg, #8b5cf6, #6366f1)",
                  border: "none", borderRadius: "12px",
                  color: (!chatInput.trim() || isChatLoading) ? "var(--text-muted)" : "white",
                  cursor: (!chatInput.trim() || isChatLoading) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "opacity 0.2s"
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </Show>
    </>
  );
}