import type { RunResult, TableInfo, TablePage, TableTail } from "../shared/types.js";
import { UserError } from "./errors.js";

/** One active session: a PostgreSQL database on a port, or a SQLite database file. */
export interface DatabaseSession {
  listSchemas(): Promise<string[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  readTable(schema: string, table: string, offset: number): Promise<TablePage>;
  readTail(schema: string, table: string): Promise<TableTail>;
  truncateTable(schema: string, table: string): Promise<void>;
  run(script: string): Promise<RunResult>;
}

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function commandOf(sql: string): string {
  return /^\s*([A-Za-z]+)/.exec(sql)?.[1]?.toUpperCase() ?? "STATEMENT";
}

export function orderBy(primaryKey: string[], direction: "asc" | "desc" = "asc"): string {
  if (primaryKey.length === 0) return "";
  return ` order by ${primaryKey.map((column) => `${quoteIdent(column)} ${direction}`).join(", ")}`;
}

export function tailSql(schema: string, table: string, primaryKey: string[], limit: number): string {
  if (primaryKey.length === 0) throw new UserError("Live mode needs a table with a primary key");
  return `select * from (select * from ${quoteIdent(schema)}.${quoteIdent(table)}${orderBy(primaryKey, "desc")} limit ${limit}) as tail${orderBy(primaryKey)}`;
}
