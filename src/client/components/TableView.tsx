import { useState } from "react";
import type { Cell, Target } from "../../shared/types";
import { api } from "../api";
import { useAsync } from "../hooks";
import { DataGrid } from "./DataGrid";

export function TableView({ target, schema, table }: { target: Target; schema: string; table: string }) {
  const [first] = useAsync(() => api.rows(target, schema, table, 0), [target, schema, table]);
  const [more, setMore] = useState<{ rows: Cell[][]; hasMore: boolean }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();

  if (first.status === "loading") return <p className="empty">Loading {table}…</p>;
  if (first.status === "error") return <p className="error">{first.error.message}</p>;

  const rows = more ? [...first.data.rows, ...more.rows] : first.data.rows;
  const hasMore = more ? more.hasMore : first.data.hasMore;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await api.rows(target, schema, table, rows.length);
      setMore({ rows: [...(more?.rows ?? []), ...page.rows], hasMore: page.hasMore });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="table-view">
      <div className="toolbar">
        <h2 className="mono">
          {schema}.{table}
        </h2>
        <span className="muted">
          {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"} loaded{hasMore ? ", more available" : ""}
        </span>
      </div>
      <DataGrid columns={first.data.columns} rows={rows} />
      {error && <p className="error">{error}</p>}
      {hasMore && (
        <div className="load-more">
          <button className="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load 500 more"}
          </button>
        </div>
      )}
    </div>
  );
}
