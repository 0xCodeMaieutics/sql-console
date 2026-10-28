import { useEffect, useRef, useState } from "react";
import type { Cell } from "../../shared/types";
import { cellText } from "./DataGrid";

type Parsed = { ok: true; text: string } | { ok: false; error: string };

function formatJson(value: Cell): Parsed {
  try {
    return { ok: true, text: JSON.stringify(JSON.parse(cellText(value)), null, 2) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function JsonViewer({ column, value, onClose }: { column: string; value: Cell; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [parsed] = useState(() => formatJson(value));
  const [copyState, setCopyState] = useState<"idle" | "copied" | string>("idle");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const copy = async () => {
    if (!parsed.ok) return;
    try {
      await navigator.clipboard.writeText(parsed.text);
      setCopyState("copied");
    } catch (e) {
      setCopyState((e as Error).message);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="json-viewer"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
    >
      <div className="json-viewer-header">
        <h3 className="mono">{column}</h3>
        {parsed.ok && (
          <button className="secondary" onClick={() => void copy()}>
            {copyState === "copied" ? "Copied" : "Copy JSON"}
          </button>
        )}
        <button className="secondary" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </div>
      {copyState !== "idle" && copyState !== "copied" && <p className="error">{copyState}</p>}
      {parsed.ok ? (
        <pre className="json-viewer-body mono">{parsed.text}</pre>
      ) : (
        <p className="error json-viewer-error">This value is not valid JSON: {parsed.error}</p>
      )}
    </dialog>
  );
}
