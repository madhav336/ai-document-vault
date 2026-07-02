"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function BookmarkletContent() {
  const searchParams = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<"loading" | "saving" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const url = searchParams.get("url") || "";
  const title = searchParams.get("title") || "";

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("error");
      setErrorMsg("Please sign in to your vault first.");
      return;
    }
    if (!url) {
      setStatus("error");
      setErrorMsg("No URL provided to save.");
      return;
    }
    saveLink();
  }, [isLoaded, isSignedIn, url]);

  async function saveLink() {
    setStatus("saving");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ title, url, category: null })
      });

      if (!res.ok) {
        throw new Error("Failed to save link");
      }

      setStatus("success");
      try {
        const bc = new BroadcastChannel("bookmark_vault_sync");
        bc.postMessage({ type: "BOOKMARK_ADDED" });
        bc.close();
      } catch (err) {
        console.error("Broadcast failed:", err);
      }
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "An error occurred while saving.");
    }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "#07070a", color: "#f1f0f5", fontFamily: "system-ui, sans-serif",
      padding: "24px", textAlign: "center"
    }}>
      {status === "loading" && <p style={{ color: "#6b6880" }}>Initializing session...</p>}
      {status === "saving" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div className="spinner" style={{ width: "32px", height: "32px", border: "3px solid rgba(139,92,246,0.2)", borderTopColor: "#8b5cf6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
          <p style={{ fontWeight: 500 }}>Saving page to your vault...</p>
          <p style={{ fontSize: "12px", color: "#6b6880", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "340px" }}>{url}</p>
        </div>
      )}
      {status === "success" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "48px", height: "48px", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p style={{ fontWeight: 600, fontSize: "16px" }}>Saved successfully!</p>
          <p style={{ fontSize: "12px", color: "#6b6880" }}>This window will close shortly.</p>
        </div>
      )}
      {status === "error" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "48px", height: "48px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <p style={{ fontWeight: 600, color: "#f87171" }}>Failed to save</p>
          <p style={{ fontSize: "13px", color: "#6b6880" }}>{errorMsg}</p>
          {!isSignedIn && (
            <p style={{ fontSize: "12px", color: "#8b5cf6", marginTop: "12px" }}>Please sign in to the main dashboard tab and try again.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function BookmarkletPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", height: "100vh",
        background: "#07070a", color: "#6b6880", fontFamily: "system-ui, sans-serif"
      }}>
        Loading...
      </div>
    }>
      <BookmarkletContent />
    </Suspense>
  );
}
