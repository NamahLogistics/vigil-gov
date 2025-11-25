// components/PSNotesPanel.tsx

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/authClient";

interface PSNote {
  id: string;
  text: string;
  createdAt: number;
  createdByName?: string;
}

interface Props {
  projectId: string;
}

export const PSNotesPanel: React.FC<Props> = ({ projectId }) => {
  const [notes, setNotes] = useState<PSNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [newText, setNewText] = useState("");
  const [canPost, setCanPost] = useState(false);

  // Load notes
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch(
          `/api/admin/ps-notes?projectId=${encodeURIComponent(
            projectId
          )}`
        );
        const data = await res.json();
        setNotes(data.notes || []);
      } catch (err) {
        console.error("Failed to load PS notes", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  // Check if current user is ADMIN/PS
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/me");
        const data = await res.json();
        const role = data.user?.role || data.role || "";
        setCanPost(role === "ADMIN" || role === "PS");
      } catch (err) {
        console.error("Failed to check role", err);
      }
    })();
  }, []);

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      const res = await apiFetch("/api/admin/ps-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text: newText.trim() }),
      });
      const data = await res.json();
      if (data.note) {
        setNotes((prev) => [data.note, ...prev]);
      }
      setNewText("");
    } catch (err) {
      console.error("Failed to add PS note", err);
    }
  }

  function formatDate(ts: number) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <section className="border rounded p-3 bg-white text-xs space-y-2">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-sm">
          📝 Reviewing Authority Remarks
        </h2>
      </div>

      {loading && (
        <div className="text-[11px] text-gray-500">
          Loading remarks…
        </div>
      )}

      {!loading && notes.length === 0 && (
        <div className="text-[11px] text-gray-500">
          No remarks recorded yet.
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {notes.map((n) => (
            <div
              key={n.id}
              className="border-b last:border-b-0 pb-1 mb-1"
            >
              <div className="text-[11px]">{n.text}</div>
              <div className="text-[10px] text-gray-500 mt-[2px]">
                {n.createdByName ? n.createdByName + " · " : ""}
                {formatDate(n.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {canPost && (
        <form onSubmit={handleAddNote} className="space-y-1">
          <textarea
            className="border rounded w-full px-2 py-1 text-xs"
            rows={2}
            placeholder="Add meeting remark for this project…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-3 py-1 rounded text-xs"
          >
            Add Remark
          </button>
        </form>
      )}
    </section>
  );
};