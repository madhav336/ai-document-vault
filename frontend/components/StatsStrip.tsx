import React from "react";
import { VaultStats } from "../app/types";

interface StatsStripProps {
  stats: VaultStats | null;
}

export default function StatsStrip({ stats }: StatsStripProps) {
  if (!stats) return null;

  const totalText = `${stats.total} link${stats.total !== 1 ? "s" : ""}`;
  const topicText = `${stats.category_count} topic${stats.category_count !== 1 ? "s" : ""}`;
  const recentText = `${stats.recent_30d} saved this month`;

  return (
    <div
      className="mb-4 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-(--text-muted)"
      style={{ animation: "fadeIn var(--transition-smooth) both" }}
    >
      <span>{totalText}</span>
      <span aria-hidden="true">·</span>
      <span>{topicText}</span>
      <span aria-hidden="true">·</span>
      <span>{recentText}</span>
    </div>
  );
}
