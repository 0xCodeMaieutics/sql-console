import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  CONSOLE_ROW_LIMIT,
  TABLE_PAGE_SIZE,
  type RunResult,
  type StatementResult,
  type TableInfo,
  type TablePage,
} from "../shared/types.js";
import { UserError } from "./errors.js";
import { commandOf, quoteIdent, type DatabaseSession } from "./session.js";
import { splitSql } from "./split-sql.js";
import { toRow } from "./values.js";

/** Resolves relative paths against the directory the console was started from. */
export function resolveSqlitePath(input: string, cwd = process.cwd()): string {
  const trimmed = input.trim();
  if (trimmed === "") throw new UserError("Enter a path to a SQLite database file");
  const expanded = trimmed.startsWith("~/") ? path.join(process.env.HOME ?? "", trimmed.slice(2)) : trimmed;
  const resolved = path.resolve(cwd, expanded);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new UserError(`File not found: ${resolved}`, 404);
  }
  if (!stat.isFile()) throw new UserError(`Not a file: ${resolved}`);
  return resolved;
}

function asUserError(error: unknown): unknown {
  if (error instanceof Database.SqliteError || (error instanceof TypeError && /statement/i.test(error.message))) {
    return new UserError(error.message, 400, error instanceof Database.SqliteError ? error.code : undefined);
  }
  return error;
}

async function translate<T>(work: () => T): Promise<T> {
  try {
    return work();
  } catch (error) {
    throw asUserError(error);
  }
}

export class SqliteSession implements DatabaseSession {
  private readonly db: Database.Database;

  constructor(readonly file: string) {
    try {
      this.db = new Database(file, { fileMustExist: true });
      this.db.prepare("select count(*) from sqlite_master").get();
    } catch (error) {
      throw new UserError(`Could not open SQLite database ${file}: ${(error as Error).message}`);
    }
  }

  listSchemas(): Promise<string[]> {
    return translate(() =>
      (this.db.prepare("pragma database_list").all() as { name: string }[])
        .map((row) => row.name)
        .filter((name) => name !== "temp"),
    );
  }

  listTables(schema: string): Promise<TableInfo[]> {
    return translate(() => {
      const rows = this.db
        .prepare(
          `select name, type from ${quoteIdent(schema)}.sqlite_master
           where type in ('table', 'view') and name not like 'sqlite\\_%' escape '\\'
           order by name`,
        )
        .all() as { name: string; type: string }[];
      return rows.map((row) => ({ name: row.name, kind: row.type === "view" ? "view" : "table" }));
    });
  }

  readTable(schema: string, table: string, offset: number): Promise<TablePage> {
    return translate(() => {
      const statement = this.db
        .prepare(`select * from ${quoteIdent(schema)}.${quoteIdent(table)} limit ? offset ?`)
        .raw(true);
      const rows = statement.all(TABLE_PAGE_SIZE + 1, offset) as unknown[][];
      return {
        columns: statement.columns().map((column) => column.name),
        rows: rows.slice(0, TABLE_PAGE_SIZE).map(toRow),
        offset,
        hasMore: rows.length > TABLE_PAGE_SIZE,
      };
    });
  }

  async run(script: string): Promise<RunResult> {
    const runStarted = performance.now();
    const results: StatementResult[] = [];

    for (const statement of splitSql(script, { sqliteTriggers: true })) {
      const started = performance.now();
      try {
        const prepared = this.db.prepare(statement.sql);
        if (prepared.reader) {
          prepared.raw(true);
          const rows: unknown[][] = [];
          let rowCount = 0;
          for (const row of prepared.iterate() as IterableIterator<unknown[]>) {
            if (rowCount < CONSOLE_ROW_LIMIT) rows.push(row);
            rowCount++;
          }
          results.push({
            kind: "rows",
            sql: statement.sql,
            columns: prepared.columns().map((column) => column.name),
            rows: rows.map(toRow),
            rowCount,
            truncated: rowCount > CONSOLE_ROW_LIMIT,
            durationMs: performance.now() - started,
          });
        } else {
          const info = prepared.run();
          const command = commandOf(statement.sql);
          const affectsRows = ["INSERT", "UPDATE", "DELETE", "REPLACE"].includes(command);
          results.push({
            kind: "command",
            sql: statement.sql,
            command,
            affected: affectsRows ? info.changes : null,
            durationMs: performance.now() - started,
          });
        }
      } catch (error) {
        const translated = asUserError(error);
        if (!(translated instanceof UserError)) throw error;
        results.push({
          kind: "error",
          sql: statement.sql,
          message: translated.message,
          durationMs: performance.now() - started,
        });
        break;
      }
    }

    return { results, durationMs: performance.now() - runStarted };
  }

  close(): void {
    this.db.close();
  }
}
