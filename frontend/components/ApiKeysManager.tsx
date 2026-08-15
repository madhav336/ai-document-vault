import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Button from "./ui/Button";
import Card from "./ui/Card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type ApiKey = {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

export default function ApiKeysManager() {
  const { getToken } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchKeys = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setKeys(await res.json());
    } catch {
      // Silent: settings drawer is non-critical UI
    }
  }, [getToken]);

  useEffect(() => {
    Promise.resolve().then(() => fetchKeys());
  }, [fetchKeys]);

  const handleCreate = async () => {
    const name = newKeyName.trim() || "Browser Extension";
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      const data = await res.json();
      setCreatedKey(data.key);
      setNewKeyName("");
      await fetchKeys();
    } catch {
      setError("Failed to create API key. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: number) => {
    try {
      const token = await getToken();
      await fetch(`${API_BASE}/api-keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchKeys();
    } catch {
      setError("Failed to revoke key. Please try again.");
    }
  };

  return (
    <Card className="p-4 text-[13px] leading-normal text-(--text-secondary)">
      <p className="mb-3">
        Generate a personal API key to connect the browser extension. It saves pages directly
        from any tab without needing the web app open.
      </p>

      {createdKey && (
        <div className="mb-3 rounded-[10px] border border-dashed border-(--accent)/30 bg-(--accent)/10 p-3 text-xs">
          <p className="mb-1.5 font-semibold text-(--accent)">
            Copy this key now — it won&apos;t be shown again:
          </p>
          <code className="block break-all rounded-md bg-(--surface-hover) p-2 text-[11px]">
            {createdKey}
          </code>
          <Button
            fullWidth
            className="mt-2"
            onClick={() => {
              navigator.clipboard.writeText(createdKey);
              setCreatedKey(null);
            }}
          >
            Copy & dismiss
          </Button>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        <label htmlFor="api-key-name" className="sr-only">Key name</label>
        <input
          id="api-key-name"
          type="text"
          placeholder="Key name (e.g. Chrome Extension)"
          value={newKeyName}
          onChange={e => setNewKeyName(e.target.value)}
          className="focus-ring flex-1 rounded-lg border border-(--border) bg-(--surface-hover) px-2.5 py-2 text-xs text-(--text) outline-none"
        />
        <Button onClick={handleCreate} disabled={loading}>
          {loading ? "Creating..." : "Generate"}
        </Button>
      </div>

      {error && <p className="mb-2.5 text-[11px] text-(--danger)" role="alert">{error}</p>}

      {keys.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {keys.map(k => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-lg bg-(--surface-hover) px-2.5 py-2 text-xs"
            >
              <div>
                <div className="font-medium text-(--text)">{k.name}</div>
                <div className="text-[11px] text-(--text-muted)">{k.key_prefix}…</div>
              </div>
              <button
                onClick={() => handleRevoke(k.id)}
                className="focus-ring rounded-md border border-(--danger)/30 px-2 py-1 text-[11px] text-(--danger) outline-none"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
