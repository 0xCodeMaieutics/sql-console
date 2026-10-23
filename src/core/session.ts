import type { RunResult, TableInfo, TablePage } from "../shared/types.js";

/** One active session: a PostgreSQL database on a port, or a SQLite database file. */
export interface DatabaseSession {
  listSchemas(): Promise<string[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  readTable(schema: string, table: string, offset: number): Promise<TablePage>;
  truncateTable(schema: string, table: string): Promise<void>;
  run(script: string): Promise<RunResult>;
}

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export function commandOf(sql: string): string {
  return /^\s*([A-Za-z]+)/.exec(sql)?.[1]?.toUpperCase() ?? "STATEMENT";
}
