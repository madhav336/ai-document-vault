"use client";

import React, { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "vault_theme";

/* ── external store ───────────────────────────────────────────────────────
   The theme lives in localStorage and the OS, not in React. Reading it with
   useSyncExternalStore (rather than an effect that setStates on mount) gives
   a correct server snapshot, correct hydration, and cross-tab sync for free.
   ─────────────────────────────────────────────────────────────────────── */

const listeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach(fn => fn());
}

function readPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") return raw;
  } catch {
    /* private mode / storage disabled */
  }
  return "dark";
}

function applyToDocument(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") {
    // No attribute at all — globals.css falls back to `color-scheme: light dark`,
    // which is what makes light-dark() follow the OS.
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
}

function subscribePreference(onChange: () => void) {
  // A write from another tab fires `storage` here but not our in-process
  // listeners, so this tab also has to re-apply the attribute itself.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== THEME_STORAGE_KEY) return;
    applyToDocument(readPreference());
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// Must match the inline no-flash script's default and the server render.
const serverPreference = (): ThemePreference => "dark";

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readSystem(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

const serverSystem = (): ResolvedTheme => "dark";

const noopSubscribe = () => () => {};

/* ── context ──────────────────────────────────────────────────────────── */

interface ThemeContextValue {
  /** What the user picked. "system" defers to the OS. */
  preference: ThemePreference;
  /** What is actually on screen right now. */
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  /** False during SSR and hydration, so UI that would otherwise render a
      wrong active state can wait one tick. */
  isReady: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "dark",
  resolved: "dark",
  setPreference: () => {},
  isReady: false,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(subscribePreference, readPreference, serverPreference);
  const systemPreference = useSyncExternalStore(subscribeSystem, readSystem, serverSystem);
  const isReady = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const resolved: ResolvedTheme = preference === "system" ? systemPreference : preference;

  const setPreference = useCallback((pref: ThemePreference) => {
    applyToDocument(pref);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      /* preference just won't survive a reload */
    }
    notifyAll();
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, isReady }}>
      {children}
    </ThemeContext.Provider>
  );
}
