import { useCallback, useEffect, useState } from "react";
import type { Cell, TableTail, Target } from "../../shared/types";
import { api } from "../api";
import { useAsync } from "../hooks";
import { ContextMenu } from "./ContextMenu";
import { cellText, DataGrid } from "./DataGrid";

const LIVE_INTERVAL_MS = 2000;

export function TableView({ target, schema, table }: { target: Target; schema: string; table: string }) {
  const [first, reloadFirst] = useAsync(() => api.rows(target, schema, table, 0), [target, schema, table]);
  const [more, setMore] = useState<{ rows: Cell[][]; hasMore: boolean }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number; value: Cell }>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const [live, setLive] = useState(false);
  const [tail, setTail] = useState<TableTail & { fetchedAt: Date }>();

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await api.tail(target, schema, table);
        if (stopped) return;
        setTail({ ...next, fetchedAt: new Date() });
        timer = setTimeout(() => void tick(), LIVE_INTERVAL_MS);
      } catch (e) {
        if (stopped) return;
        setError((e as Error).message);
        setLive(false);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, target, schema, table]);

  if (!first.data) {
    if (first.status === "error") return <p className="error">{first.error.message}</p>;
    return <p className="empty">Loading {table}…</p>;
  }

  const page = first.data;
  const pagedRows = more ? [...page.rows, ...more.rows] : page.rows;
  const hasMore = more ? more.hasMore : page.hasMore;
  const canGoLive = page.primaryKey.length > 0;
  const showTail = live && tail !== undefined;

  const toggleLive = () => {
    setError(undefined);
    if (live) {
      setLive(false);
      setTail(undefined);
      setMore(undefined);
      reloadFirst();
    } else {
      setMore(undefined);
      setLive(true);
    }
  };

  const copyData = async (value: Cell) => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(cellText(value));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await api.rows(target, schema, table, pagedRows.length);
      setMore({ rows: [...(more?.rows ?? []), ...next.rows], hasMore: next.hasMore });
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
        <button
          className={live ? "live-toggle on" : "live-toggle secondary"}
          onClick={toggleLive}
          disabled={!canGoLive}
          aria-pressed={live}
          title={canGoLive ? "Re-fetch the newest rows every 2 seconds" : "Live mode needs a table with a primary key"}
        >
          <span className="live-dot" />
          Live
        </button>
        <span className="muted">
          {showTail
            ? `Newest ${tail.rows.length.toLocaleString()} row${tail.rows.length === 1 ? "" : "s"} · updated ${tail.fetchedAt.toLocaleTimeString()}`
            : live
              ? "Starting live mode…"
              : `${pagedRows.length.toLocaleString()} row${pagedRows.length === 1 ? "" : "s"} loaded${hasMore ? ", more available" : ""}`}
        </span>
      </div>
      <DataGrid
        columns={showTail ? tail.columns : page.columns}
        rows={showTail ? tail.rows : pagedRows}
        follow={live}
        onCellContextMenu={(e, value) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, value });
        }}
      />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          <button onClick={() => void copyData(menu.value)}>Copy data</button>
        </ContextMenu>
      )}
      {error && <p className="error">{error}</p>}
      {hasMore && !live && (
        <div className="load-more">
          <button className="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load 500 more"}
          </button>
        </div>
      )}
    </div>
  );
}
