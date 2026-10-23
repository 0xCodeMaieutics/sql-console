import postgres from "postgres";
import {
  CONSOLE_ROW_LIMIT,
  TABLE_PAGE_SIZE,
  type ColumnSort,
  type PgLogin,
  type RowFilter,
  type RunResult,
  type StatementResult,
  type TableInfo,
  type TablePage,
  type TableTail,
} from "../shared/types.js";
import { UserError } from "./errors.js";
import { LOOPBACK_HOST } from "./loopback.js";
import { commandOf, orderBy, quoteIdent, tailSql, whereClause, type DatabaseSession } from "./session.js";
import { positionAt, splitSql } from "./split-sql.js";
import { toRow } from "./values.js";

type Sql = postgres.Sql;

function connect(port: number, login: PgLogin, database: string, max: number): Sql {
  return postgres({
    host: LOOPBACK_HOST,
    port,
    user: login.user,
    password: login.password,
    database,
    max,
    connect_timeout: 5,
    idle_timeout: 60,
    onnotice: () => {},
  });
}

function asUserError(error: unknown): unknown {
  if (error instanceof postgres.PostgresError) {
    return new UserError(error.message, 400, error.code);
  }
  if (error instanceof Error && "code" in error) {
    const code = String(error.code);
    if (code === "ECONNREFUSED" || code === "CONNECT_TIMEOUT" || code === "ECONNRESET") {
      return new UserError(`Could not reach PostgreSQL: ${error.message}`, 502, code);
    }
  }
  return error;
}

async function translate<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw asUserError(error);
  }
}

export async function testLogin(port: number, login: PgLogin): Promise<void> {
  const sql = connect(port, login, login.database, 1);
  try {
    await translate(() => sql`select 1`);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export class PostgresSession implements DatabaseSession {
  /** Browsing queries use a small pool; the SQL console keeps one dedicated connection so SET/BEGIN persist across runs. */
  private readonly browse: Sql;
  private readonly console: Sql;

  constructor(
    readonly port: number,
    readonly database: string,
    login: PgLogin,
  ) {
    this.browse = connect(port, login, database, 2);
    this.console = connect(port, login, database, 1);
  }

  listDatabases(): Promise<string[]> {
    return translate(async () => {
      const rows = await this.browse<{ datname: string }[]>`
        select datname from pg_database
        where datallowconn and not datistemplate
        order by datname`;
      return rows.map((row) => row.datname);
    });
  }

  listSchemas(): Promise<string[]> {
    return translate(async () => {
      const rows = await this.browse<{ nspname: string }[]>`
        select nspname from pg_namespace
        where nspname not like 'pg\\_%' and nspname <> 'information_schema'
        order by nspname`;
      return rows.map((row) => row.nspname);
    });
  }

  listTables(schema: string): Promise<TableInfo[]> {
    return translate(async () => {
      const rows = await this.browse<{ relname: string; relkind: string }[]>`
        select c.relname, c.relkind from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = ${schema} and c.relkind in ('r', 'p', 'f', 'v', 'm')
        order by c.relname`;
      return rows.map((row) => ({
        name: row.relname,
        kind: row.relkind === "v" || row.relkind === "m" ? "view" : "table",
      }));
    });
  }

  readTable(schema: string, table: string, offset: number, sort?: ColumnSort, filters: RowFilter[] = []): Promise<TablePage> {
    return translate(async () => {
      const primaryKey = await this.primaryKey(schema, table);
      const where = whereClause(filters, (n) => `$${n}`);
      const result = await this.browse
        .unsafe(
          `select * from ${quoteIdent(schema)}.${quoteIdent(table)}${where.sql}${orderBy(primaryKey, "asc", sort)} limit ${TABLE_PAGE_SIZE + 1} offset ${offset}`,
          where.params,
        )
        .values();
      return {
        columns: result.columns.map((column) => column.name),
        rows: result.slice(0, TABLE_PAGE_SIZE).map(toRow),
        offset,
        hasMore: result.length > TABLE_PAGE_SIZE,
        primaryKey,
      };
    });
  }

  readTail(schema: string, table: string, sort?: ColumnSort, filters: RowFilter[] = []): Promise<TableTail> {
    return translate(async () => {
      const primaryKey = await this.primaryKey(schema, table);
      const where = whereClause(filters, (n) => `$${n}`);
      const result = await this.browse
        .unsafe(tailSql(schema, table, primaryKey, TABLE_PAGE_SIZE, where, sort), where.params)
        .values();
      return { columns: result.columns.map((column) => column.name), rows: result.map(toRow) };
    });
  }

  private async primaryKey(schema: string, table: string): Promise<string[]> {
    const rows = await this.browse<{ attname: string }[]>`
      select a.attname from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = to_regclass(format('%I.%I', ${schema}::text, ${table}::text)) and i.indisprimary
      order by array_position(i.indkey::int2[], a.attnum)`;
    return rows.map((row) => row.attname);
  }

  truncateTable(schema: string, table: string): Promise<void> {
    return translate(async () => {
      await this.browse.unsafe(`truncate table ${quoteIdent(schema)}.${quoteIdent(table)}`);
    });
  }

  async run(script: string): Promise<RunResult> {
    const runStarted = performance.now();
    const results: StatementResult[] = [];

    for (const statement of splitSql(script)) {
      const started = performance.now();
      try {
        const result = await this.console.unsafe(statement.sql).simple().values();
        const durationMs = performance.now() - started;
        if (result.columns?.length) {
          results.push({
            kind: "rows",
            sql: statement.sql,
            columns: result.columns.map((column) => column.name),
            rows: result.slice(0, CONSOLE_ROW_LIMIT).map(toRow),
            rowCount: result.length,
            truncated: result.length > CONSOLE_ROW_LIMIT,
            durationMs,
          });
        } else {
          results.push({
            kind: "command",
            sql: statement.sql,
            command: result.command ?? commandOf(statement.sql),
            affected: typeof result.count === "number" ? result.count : null,
            durationMs,
          });
        }
      } catch (error) {
        const durationMs = performance.now() - started;
        const translated = asUserError(error);
        if (!(translated instanceof UserError)) throw error;
        const position =
          error instanceof postgres.PostgresError && error.position
            ? positionAt(script, statement.start + Number(error.position) - 1)
            : undefined;
        results.push({ kind: "error", sql: statement.sql, message: translated.message, position, durationMs });
        break;
      }
    }

    return { results, durationMs: performance.now() - runStarted };
  }

  async close(): Promise<void> {
    await Promise.all([this.browse.end({ timeout: 1 }), this.console.end({ timeout: 1 })]);
  }
}
