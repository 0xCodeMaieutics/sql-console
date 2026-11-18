import { useCallback, useEffect, useState } from "react";
import type { Cell, ColumnSort, RowFilter, TableTail, Target } from "../../shared/types";
import { api } from "../api";
import { useAsync } from "../hooks";
import { CellEditor } from "./CellEditor";
import { ContextMenu } from "./ContextMenu";
import { cellText, DataGrid } from "./DataGrid";
import { FilterBar } from "./FilterBar";
import { JsonViewer } from "./JsonViewer";
import { Toast } from "./Toast";

const LIVE_INTERVAL_MS = 2000;

function nextSort(current: ColumnSort | undefined, column: string): ColumnSort | undefined {
  if (current?.column !== column) return { column, direction: "asc" };
  return current.direction === "asc" ? { column, direction: "desc" } : undefined;
}

type EditingCell = { rowKey: string; column: string; key: Record<string, string>; value: Cell; error?: string };

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
  const [menu, setMenu] = useState<{ x: number; y: number; column: string; value: Cell; row: Cell[] }>();
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const [jsonCell, setJsonCell] = useState<{ column: string; value: Cell }>();
  const [live, setLive] = useState(false);
  const [tail, setTail] = useState<TableTail & { fetchedAt: Date }>();
  const [shape, setShape] = useState<{ columns: string[]; primaryKey: string[] }>();
  const [editing, setEditing] = useState<EditingCell>();
  const [saving, setSaving] = useState(false);
  /** Saved rows by row key, shown until the rows are next fetched. */
  const [savedRows, setSavedRows] = useState<Map<string, Cell[]>>(new Map());
  const [toast, setToast] = useState<{ id: number; message: string }>();
  const closeToast = useCallback(() => setToast(undefined), []);

  useEffect(() => {
    if (first.data) setShape({ columns: first.data.columns, primaryKey: first.data.primaryKey });
  }, [first.data]);

  useEffect(() => setSavedRows(new Map()), [first.data, tail]);

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
  const gridColumns = showTail ? tail.columns : columns;
  const keyIndexes = primaryKey.map((name) => gridColumns.indexOf(name));
  const rowKey = canGoLive ? (row: Cell[]) => JSON.stringify(keyIndexes.map((i) => row[i])) : undefined;
  const gridRows = (showTail ? tail.rows : pagedRows).map((row) => (rowKey && savedRows.get(rowKey(row))) || row);

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
    setEditing(undefined);
    onSortChange(nextSort(sort, column));
  };

  const changeFilters = (next: RowFilter[]) => {
    setError(undefined);
    setMore(undefined);
    setEditing(undefined);
    onFiltersChange(next);
  };

  const startEditing = (column: string, value: Cell, row: Cell[]) => {
    closeMenu();
    if (!rowKey) return;
    const key = Object.fromEntries(primaryKey.map((name, i) => [name, cellText(row[keyIndexes[i]])]));
    setEditing({ rowKey: rowKey(row), column, key, value });
  };

  const saveCell = async (cell: EditingCell, value: string | null) => {
    setSaving(true);
    try {
      const saved = await api.updateCell(target, { schema, table, key: cell.key, column: cell.column, value });
      setSavedRows((previous) => new Map(previous).set(cell.rowKey, saved.row));
      setEditing(undefined);
      setToast({ id: Date.now(), message: `Saved ${cell.column}` });
    } catch (e) {
      setEditing({ ...cell, error: (e as Error).message });
    } finally {
      setSaving(false);
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

  const filterByValue = (column: string, value: Cell) => {
    closeMenu();
    changeFilters([...filters, filterFor(column, value)]);
  };

  const viewJson = (column: string, value: Cell) => {
    closeMenu();
    setJsonCell({ column, value });
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
        columns={gridColumns}
        rows={gridRows}
        follow={live ? (sort ? "top" : "bottom") : undefined}
        sort={sort}
        onSort={changeSort}
        onCellContextMenu={(e, column, value, row) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, column, value, row });
        }}
        rowKey={rowKey}
        editing={
          editing && {
            rowKey: editing.rowKey,
            column: editing.column,
            editor: (
              <CellEditor
                initial={editing.value}
                saving={saving}
                error={editing.error}
                onSave={(value) => void saveCell(editing, value)}
                onCancel={() => setEditing(undefined)}
              />
            ),
          }
        }
      />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          <button
            disabled={!rowKey}
            title={rowKey ? undefined : "Setting a value needs a table with a primary key"}
            onClick={() => startEditing(menu.column, menu.value, menu.row)}
          >
            Set value
          </button>
          <button onClick={() => void copyData(menu.value)}>Copy data</button>
          <button onClick={() => filterByValue(menu.column, menu.value)}>Filter by this value</button>
          <button onClick={() => viewJson(menu.column, menu.value)}>View value in JSON viewer</button>
        </ContextMenu>
      )}
      {jsonCell && <JsonViewer column={jsonCell.column} value={jsonCell.value} onClose={() => setJsonCell(undefined)} />}
      {toast && <Toast key={toast.id} message={toast.message} onDone={closeToast} />}
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
