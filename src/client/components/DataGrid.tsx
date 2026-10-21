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

export function DataGrid({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  if (columns.length === 0) return <p className="empty small">No columns</p>;
  return (
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr>
            <th className="rownum">#</th>
            {columns.map((column, i) => (
              <th key={i}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              <td className="rownum">{r + 1}</td>
              {row.map((value, c) => (
                <td key={c} title={titleOf(value)}>
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
