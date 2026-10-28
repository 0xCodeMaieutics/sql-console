import { useState } from "react";
import type { HistoryEntry } from "../../shared/types";

const openKey = "sql-console:history-open";

function formatRanAt(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function RunHistory({
  entries,
  error,
  onChoose,
  onRemove,
  onClear,
}: {
  entries: HistoryEntry[];
  error?: string;
  onChoose: (entry: HistoryEntry) => void;
  onRemove: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(() => localStorage.getItem(openKey) !== "false");
  const toggle = () => {
    localStorage.setItem(openKey, String(!open));
    setOpen(!open);
  };

  if (!open) {
    return (
      <button className="secondary history-expand" onClick={toggle} title="Show run history">
        History ›
      </button>
    );
  }

  return (
    <aside className="history">
      <header className="history-header">
        <strong>History</strong>
        <button
          className="link"
          disabled={entries.length === 0}
          onClick={() => window.confirm("Clear the run history for this database?") && onClear()}
        >
          Clear
        </button>
        <button className="secondary history-toggle" onClick={toggle} title="Hide run history">
          ‹
        </button>
      </header>
      {error && <p className="error history-error">{error}</p>}
      {entries.length === 0 ? (
        <p className="empty small">No runs yet.</p>
      ) : (
        <ul className="history-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button className="history-entry" title={entry.sql} onClick={() => onChoose(entry)}>
                <code className="history-sql">{entry.sql.replace(/\s+/g, " ").trim()}</code>
                <span className="history-time">{formatRanAt(entry.ranAt)}</span>
              </button>
              <button className="icon history-remove" title="Remove from history" onClick={() => onRemove(entry)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
