import { useState } from "react";
import { CONSOLE_ROW_LIMIT, type RunResult, type StatementResult, type Target } from "../../shared/types";
import { api, targetKey } from "../api";
import { DataGrid } from "./DataGrid";

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
    }
  };

  return (
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
