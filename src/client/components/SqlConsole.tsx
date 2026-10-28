import { useState } from "react";
import {
  CONSOLE_ROW_LIMIT,
  type HistoryEntry,
  type RunResult,
  type StatementResult,
  type Target,
} from "../../shared/types";
import { api, targetKey } from "../api";
import { useAsync } from "../hooks";
import { DataGrid } from "./DataGrid";
import { RunHistory } from "./RunHistory";

const draftKey = (target: Target) => `sql-console:draft:${targetKey(target)}`;

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(1)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function SqlConsole({ target }: { target: Target }) {
  const [sql, setSql] = useState(() => localStorage.getItem(draftKey(target)) ?? "");
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunResult>();
  const [error, setError] = useState<string>();

  const updateSql = (value: string) => {
    setSql(value);
    localStorage.setItem(draftKey(target), value);
  };

  const [history, reloadHistory, setHistory] = useAsync(() => api.history(target), [target]);
  const entries = history.data?.entries ?? [];
  const [historyError, setHistoryError] = useState<string>();

  const execute = async () => {
    if (running || sql.trim() === "") return;
    setRunning(true);
    setError(undefined);
    try {
      setRun(await api.run(target, sql));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      reloadHistory();
    }
  };

  const chooseEntry = (entry: HistoryEntry) => {
    const unrun = sql.trim() !== "" && !entries.some((e) => e.sql === sql);
    if (unrun && sql !== entry.sql && !window.confirm("Replace the unrun SQL in the console with this entry?")) return;
    updateSql(entry.sql);
  };

  const changeHistory = async (change: Promise<{ entries: HistoryEntry[] }>) => {
    setHistoryError(undefined);
    try {
      setHistory({ status: "ready", data: await change });
    } catch (e) {
      setHistoryError((e as Error).message);
    }
  };

  return (
    <div className="console-layout">
      <RunHistory
        entries={entries}
        error={historyError ?? (history.status === "error" ? history.error.message : undefined)}
        onChoose={chooseEntry}
        onRemove={(entry) => void changeHistory(api.removeHistoryEntry(target, entry.id))}
        onClear={() => void changeHistory(api.clearHistory(target))}
      />
      <div className="console">
        <textarea
          className="sql-input mono"
          value={sql}
          spellCheck={false}
          placeholder="select * from …;"
          onChange={(e) => updateSql(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void execute();
            }
          }}
        />
        <div className="toolbar">
          <button onClick={() => void execute()} disabled={running || sql.trim() === ""}>
            {running ? "Running…" : "Run"}
          </button>
          <span className="muted">⌘/Ctrl + Enter</span>
          {run && (
            <span className="muted">
              {run.results.length} statement{run.results.length === 1 ? "" : "s"} · {formatMs(run.durationMs)}
            </span>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {run && run.results.length === 0 && <p className="empty small">Nothing to run.</p>}
        <div className="results">
          {run?.results.map((result, i) => <StatementBlock key={i} result={result} />)}
        </div>
      </div>
    </div>
  );
}

function StatementBlock({ result }: { result: StatementResult }) {
  const firstLine = result.sql.split("\n")[0];
  const summary =
    result.kind === "rows"
      ? `${result.rowCount.toLocaleString()} row${result.rowCount === 1 ? "" : "s"}`
      : result.kind === "command"
        ? result.affected === null
          ? result.command
          : `${result.command} · ${result.affected.toLocaleString()} row${result.affected === 1 ? "" : "s"} affected`
        : `Error${result.position ? ` at line ${result.position.line}, column ${result.position.column}` : ""}`;

  return (
    <section className={`statement ${result.kind}`}>
      <header>
        <code className="statement-sql" title={result.sql}>
          {firstLine.length > 120 ? `${firstLine.slice(0, 120)}…` : firstLine}
        </code>
        <span className="statement-meta">
          {summary} · {formatMs(result.durationMs)}
        </span>
      </header>
      {result.kind === "rows" && (
        <>
          {result.truncated && (
            <p className="notice">
              Showing the first {CONSOLE_ROW_LIMIT.toLocaleString()} of {result.rowCount.toLocaleString()} rows.
            </p>
          )}
          <DataGrid columns={result.columns} rows={result.rows} />
        </>
      )}
      {result.kind === "error" && <pre className="error-message">{result.message}</pre>}
    </section>
  );
}
