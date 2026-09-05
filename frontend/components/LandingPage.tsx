"use client";

import React from "react";
import { SignInButton } from "@clerk/nextjs";
import Button from "./ui/Button";
import Card from "./ui/Card";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "./ThemeProvider";
import { clerkAppearance } from "./clerkAppearance";

const FEATURES = [
  {
    title: "Semantic search",
    description: "Find what you saved by concept, not just keyword — powered by vector embeddings.",
    icon: (
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>
    ),
  },
  {
    title: "Chat with your vault",
    description: "Ask a question across everything you've saved and get an answer citing the source page.",
    icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  },
  {
    title: "Links and documents",
    description: "Save a URL or drop in a PDF, Word, Markdown, or text file — all of it becomes searchable.",
    icon: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </>
    ),
  },
  {
    title: "Auto-summarized and tagged",
    description: "Every item is read, summarized, and categorized automatically the moment you add it.",
    icon: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" opacity="0" />
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    title: "One-click capture",
    description: "Save any page from any tab with the browser extension — no popups, no friction.",
    icon: (
      <>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
  },
];

export default function LandingPage() {
  const { resolved } = useTheme();

  return (
    <div className="relative min-h-screen bg-[var(--bg)]">
      {/* Signed-out visitors have no sidebar, so the theme control lives here */}
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex max-w-[900px] flex-col items-center px-6 py-24 text-center">
        <div
          className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "var(--brand-gradient)" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </div>

        <h1 className="mb-4 max-w-[640px] text-[40px] font-bold leading-[1.15] tracking-[-0.8px] text-[var(--text)]">
          An AI-searchable, chat-able document vault
        </h1>
        <p className="mb-10 max-w-[540px] text-base leading-[1.7] text-[var(--text-secondary)]">
          Save a link or drop in a document and it reads itself: summarized, tagged, and embedded
          automatically — so you can search by meaning and ask questions across everything you&rsquo;ve
          saved, instead of scrolling through folders.
        </p>

        <SignInButton mode="modal" appearance={clerkAppearance(resolved)}>
          <Button className="px-8 py-3 text-[15px]">Sign in to your vault</Button>
        </SignInButton>

        <div className="mt-20 grid w-full grid-cols-1 gap-5 text-left sm:grid-cols-2">
          {FEATURES.map(feature => (
            <Card key={feature.title} className="p-6">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--accent)]/10 text-[var(--accent)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {feature.icon}
                </svg>
              </div>
              <h3 className="mb-1.5 text-sm font-semibold text-[var(--text)]">{feature.title}</h3>
              <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)]">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
