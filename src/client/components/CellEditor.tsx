import { useState } from "react";
import type { Cell } from "../../shared/types";
import { cellText } from "./DataGrid";

export function CellEditor({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: Cell;
  saving: boolean;
  error: string | undefined;
  onSave: (value: string | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial === null ? "" : cellText(initial));

  return (
    <div className="cell-editor">
      <div className="cell-editor-row">
        <input
          autoFocus
          onFocus={(e) => e.target.select()}
          value={text}
          disabled={saving}
          aria-label="New value"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(text);
            if (e.key === "Escape") onCancel();
          }}
        />
        <button onClick={() => onSave(text)} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="secondary" onClick={() => onSave(null)} disabled={saving} title="Set to NULL">
          NULL
        </button>
        <button className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
      {error && <p className="error cell-editor-error">{error}</p>}
    </div>
  );
}
