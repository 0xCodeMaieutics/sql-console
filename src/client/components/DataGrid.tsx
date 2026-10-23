import { useLayoutEffect, useRef, type MouseEvent } from "react";
import type { Cell } from "../../shared/types";

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

/** Within this many pixels of the bottom still counts as scrolled to the bottom. */
const BOTTOM_SLACK = 8;

export function DataGrid({
  columns,
  rows,
  onCellContextMenu,
  follow = false,
}: {
  columns: string[];
  rows: Cell[][];
  onCellContextMenu?: (e: MouseEvent, value: Cell) => void;
  /** Keep the newest (last) rows in view while the user is scrolled to the bottom; hides row numbers. */
  follow?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const wasFollowing = useRef(follow);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (follow && !wasFollowing.current) atBottom.current = true;
    wasFollowing.current = follow;
    if (follow && element && atBottom.current) element.scrollTop = element.scrollHeight;
  }, [rows, follow]);

  const onScroll = () => {
    const element = scroller.current;
    if (element) atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_SLACK;
  };

  if (columns.length === 0) return <p className="empty small">No columns</p>;
  return (
    <div className="grid-scroll" ref={scroller} onScroll={onScroll}>
      <table className="grid">
        <thead>
          <tr>
            {!follow && <th className="rownum">#</th>}
            {columns.map((column, i) => (
              <th key={i}>{column}</th>
            ))}
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
                  onContextMenu={onCellContextMenu && ((e) => onCellContextMenu(e, value))}
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
