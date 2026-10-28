export type ScanRange = { start: number; end: number };

export type OccupiedPort = { port: number; kind: "listener" | "foreign" };

export type ScanResult = {
  range: ScanRange;
  ports: OccupiedPort[];
  scannedAt: string;
};

export type Settings = { scanRange: ScanRange };

export type PgLogin = { user: string; password: string; database: string };

export type LoginInfo = { login: PgLogin; saved: boolean };

export type Target =
  | { engine: "postgres"; port: number; database: string }
  | { engine: "sqlite"; path: string };

export function targetKey(target: Target): string {
  return target.engine === "postgres" ? `postgres:${target.port}/${target.database}` : `sqlite:${target.path}`;
}

export type TableInfo = { name: string; kind: "table" | "view" };

/** JSON-safe cell value; objects and arrays come from json/array columns. */
export type Cell = string | number | boolean | null | Cell[] | { [key: string]: Cell };

export type TablePage = {
  columns: string[];
  rows: Cell[][];
  offset: number;
  hasMore: boolean;
  /** Primary key columns in key order; empty for views and tables without one. */
  primaryKey: string[];
};

/** The rows live mode shows: without a column sort, the last rows by primary key in ascending key order; with one, the first rows in that order. */
export type TableTail = { columns: string[]; rows: Cell[][] };

export type SortDirection = "asc" | "desc";

export type ColumnSort = { column: string; direction: SortDirection };

export const FILTER_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "in", "contains", "is null", "is not null"] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** One condition on a table page; `in` takes a comma-separated list, the null checks ignore `value`. */
export type RowFilter = { column: string; operator: FilterOperator; value: string };

export type SourcePosition = { line: number; column: number };

export type StatementResult =
  | {
      kind: "rows";
      sql: string;
      columns: string[];
      rows: Cell[][];
      rowCount: number;
      truncated: boolean;
      durationMs: number;
    }
  | {
      kind: "command";
      sql: string;
      command: string;
      affected: number | null;
      durationMs: number;
    }
  | {
      kind: "error";
      sql: string;
      message: string;
      position?: SourcePosition;
      durationMs: number;
    };

export type RunResult = { results: StatementResult[]; durationMs: number };

export type HistoryEntry = { id: number; sql: string; ranAt: string };

export type ApiError = { error: string; code?: string };

export const TABLE_PAGE_SIZE = 500;
export const CONSOLE_ROW_LIMIT = 1000;
export const RECENT_SQLITE_LIMIT = 10;
export const RUN_HISTORY_LIMIT = 100;
export const DEFAULT_SCAN_RANGE: ScanRange = { start: 5432, end: 5445 };
export const DEFAULT_PG_LOGIN: PgLogin = {
  user: "postgres",
  password: "postgres",
  database: "postgres",
};
