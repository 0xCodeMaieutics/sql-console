import { useCallback, useEffect, useState } from "react";
import type { Cell, ColumnSort, RowFilter, TableTail, Target } from "../../shared/types";
import { api } from "../api";
import { useAsync } from "../hooks";
import { ContextMenu } from "./ContextMenu";
import { cellText, DataGrid } from "./DataGrid";
import { FilterBar } from "./FilterBar";

const LIVE_INTERVAL_MS = 2000;

function nextSort(current: ColumnSort | undefined, column: string): ColumnSort | undefined {
  if (current?.column !== column) return { column, direction: "asc" };
  return current.direction === "asc" ? { column, direction: "desc" } : undefined;
}

function filterFor(column: string, value: Cell): RowFilter {
  return value === null ? { column, operator: "is null", value: "" } : { column, operator: "=", value: cellText(value) };
}

export function TableView({
  target,
  schema,
  table,
  sort,
  onSortChange,
  filters,
  onFiltersChange,
}: {
  target: Target;
  schema: string;
  table: string;
  sort: ColumnSort | undefined;
  onSortChange: (sort: ColumnSort | undefined) => void;
  filters: RowFilter[];
  onFiltersChange: (filters: RowFilter[]) => void;
}) {
  const filtersKey = JSON.stringify(filters);
  const [first, reloadFirst] = useAsync(
    () => api.rows(target, schema, table, 0, sort, filters),
    [target, schema, table, sort, filtersKey],
  );
  const [more, setMore] = useState<{ rows: Cell[][]; hasMore: boolean }>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number; column: string; value: Cell }>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const [live, setLive] = useState(false);
  const [tail, setTail] = useState<TableTail & { fetchedAt: Date }>();
  const [shape, setShape] = useState<{ columns: string[]; primaryKey: string[] }>();

  useEffect(() => {
    if (first.data) setShape({ columns: first.data.columns, primaryKey: first.data.primaryKey });
  }, [first.data]);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await api.tail(target, schema, table, sort, filters);
        if (stopped) return;
        setTail({ ...next, fetchedAt: new Date() });
        timer = setTimeout(() => void tick(), LIVE_INTERVAL_MS);
      } catch (e) {
        if (stopped) return;
        setError((e as Error).message);
        setLive(false);
        if (sort && filters.length === 0) onSortChange(undefined);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, target, schema, table, sort, filtersKey]);

  useEffect(() => {
    if (first.status !== "error") return;
    setError(first.error.message);
    if (sort && filters.length === 0) onSortChange(undefined);
  }, [first]);

  if (!first.data && !shape) {
    if (first.status === "error" && sort) return <p className="empty">Loading {table}…</p>;
    if (first.status === "error") return <p className="error">{first.error.message}</p>;
    return <p className="empty">Loading {table}…</p>;
  }

  const page = first.data;
  const columns = page?.columns ?? shape?.columns ?? [];
  const primaryKey = page?.primaryKey ?? shape?.primaryKey ?? [];
  const pagedRows = page ? (more ? [...page.rows, ...more.rows] : page.rows) : [];
  const hasMore = more ? more.hasMore : (page?.hasMore ?? false);
  const canGoLive = primaryKey.length > 0;
  const showTail = live && tail !== undefined;
  const filtered = filters.length > 0;

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

  const changeSort = (column: string) => {
    setError(undefined);
    setMore(undefined);
    onSortChange(nextSort(sort, column));
  };

  const changeFilters = (next: RowFilter[]) => {
    setError(undefined);
    setMore(undefined);
    onFiltersChange(next);
  };

  const copyData = async (value: Cell) => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(cellText(value));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const filterByValue = (column: string, value: Cell) => {
    closeMenu();
    changeFilters([...filters, filterFor(column, value)]);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await api.rows(target, schema, table, pagedRows.length, sort, filters);
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
            ? `${sort ? "First" : "Newest"} ${tail.rows.length.toLocaleString()}${filtered ? " matching" : ""} row${tail.rows.length === 1 ? "" : "s"}${sort ? ` by ${sort.column} ${sort.direction}` : ""} · updated ${tail.fetchedAt.toLocaleTimeString()}`
            : live
              ? "Starting live mode…"
              : `${pagedRows.length.toLocaleString()}${filtered ? " matching" : ""} row${pagedRows.length === 1 ? "" : "s"} loaded${hasMore ? ", more available" : ""}`}
        </span>
      </div>
      <FilterBar columns={columns} defaultColumn={primaryKey[0]} filters={filters} onApply={changeFilters} />
      <DataGrid
        columns={showTail ? tail.columns : columns}
        rows={showTail ? tail.rows : pagedRows}
        follow={live ? (sort ? "top" : "bottom") : undefined}
        sort={sort}
        onSort={changeSort}
        onCellContextMenu={(e, column, value) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, column, value });
        }}
      />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          <button onClick={() => void copyData(menu.value)}>Copy data</button>
          <button onClick={() => filterByValue(menu.column, menu.value)}>Filter by this value</button>
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
