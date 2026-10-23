import { useLayoutEffect, useRef, type MouseEvent } from "react";
import type { Cell, ColumnSort } from "../../shared/types";

function CellValue({ value }: { value: Cell }) {
  if (value === null) return <span className="null">NULL</span>;
  if (typeof value === "object") return <>{JSON.stringify(value)}</>;
  if (typeof value === "boolean") return <span className="bool">{String(value)}</span>;
  return <>{String(value)}</>;
}

function titleOf(value: Cell): string | undefined {
  if (value === null) return undefined;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function cellText(value: Cell): string {
  return titleOf(value) ?? "NULL";
}

/** Within this many pixels of the followed edge still counts as scrolled to it. */
const EDGE_SLACK = 8;

export function DataGrid({
  columns,
  rows,
  onCellContextMenu,
  follow,
  sort,
  onSort,
}: {
  columns: string[];
  rows: Cell[][];
  onCellContextMenu?: (e: MouseEvent, column: string, value: Cell) => void;
  /** Keep this edge in view while the user is scrolled to it; hides row numbers. */
  follow?: "top" | "bottom";
  sort?: ColumnSort;
  /** Makes column headers clickable. */
  onSort?: (column: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atEdge = useRef(true);
  const wasFollowing = useRef(follow);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (follow !== wasFollowing.current) atEdge.current = true;
    wasFollowing.current = follow;
    if (follow && element && atEdge.current) element.scrollTop = follow === "top" ? 0 : element.scrollHeight;
  }, [rows, follow]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element || !follow) return;
    atEdge.current =
      follow === "top"
        ? element.scrollTop <= EDGE_SLACK
        : element.scrollHeight - element.scrollTop - element.clientHeight <= EDGE_SLACK;
  };

  if (columns.length === 0) return <p className="empty small">No columns</p>;
  return (
    <div className="grid-scroll" ref={scroller} onScroll={onScroll}>
      <table className="grid">
        <thead>
          <tr>
            {!follow && <th className="rownum">#</th>}
            {columns.map((column, i) => {
              const direction = sort?.column === column ? sort.direction : undefined;
              return (
                <th
                  key={i}
                  aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
                >
                  {onSort ? (
                    <button className="sort-header" onClick={() => onSort(column)} title={`Sort by ${column}`}>
                      {column}
                      <span className="sort-arrow">{direction === "asc" ? "▲" : direction === "desc" ? "▼" : ""}</span>
                    </button>
                  ) : (
                    column
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {!follow && <td className="rownum">{r + 1}</td>}
              {row.map((value, c) => (
                <td
                  key={c}
                  title={titleOf(value)}
                  onContextMenu={onCellContextMenu && ((e) => onCellContextMenu(e, columns[c], value))}
                >
                  <CellValue value={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty small">No rows</p>}
    </div>
  );
}
