import type { ColumnSort, RunResult, SortDirection, TableInfo, TablePage, TableTail } from "../shared/types.js";
import { UserError } from "./errors.js";

/** One active session: a PostgreSQL database on a port, or a SQLite database file. */
export interface DatabaseSession {
  listSchemas(): Promise<string[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  readTable(schema: string, table: string, offset: number, sort?: ColumnSort): Promise<TablePage>;
  readTail(schema: string, table: string, sort?: ColumnSort): Promise<TableTail>;
  truncateTable(schema: string, table: string): Promise<void>;
  run(script: string): Promise<RunResult>;
}

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function commandOf(sql: string): string {
  return /^\s*([A-Za-z]+)/.exec(sql)?.[1]?.toUpperCase() ?? "STATEMENT";
}

/** Orders by the column sort (NULLs last on both engines) with the primary key breaking ties, or by primary key alone. */
export function orderBy(primaryKey: string[], direction: SortDirection = "asc", sort?: ColumnSort): string {
  const keys = primaryKey.map((column) => `${quoteIdent(column)} ${direction}`);
  if (sort) keys.unshift(`${quoteIdent(sort.column)} ${sort.direction} nulls last`);
  return keys.length === 0 ? "" : ` order by ${keys.join(", ")}`;
}

export function tailSql(
  schema: string,
  table: string,
  primaryKey: string[],
  limit: number,
  sort?: ColumnSort,
): string {
  if (primaryKey.length === 0) throw new UserError("Live mode needs a table with a primary key");
  const from = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  if (sort) return `select * from ${from}${orderBy(primaryKey, "asc", sort)} limit ${limit}`;
  return `select * from (select * from ${from}${orderBy(primaryKey, "desc")} limit ${limit}) as tail${orderBy(primaryKey)}`;
}
