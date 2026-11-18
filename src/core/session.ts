import type {
  CellUpdate,
  ColumnSort,
  RowFilter,
  RunResult,
  SortDirection,
  TableInfo,
  TablePage,
  TableTail,
  UpdatedRow,
} from "../shared/types.js";
import { UserError } from "./errors.js";

/** One active session: a PostgreSQL database on a port, or a SQLite database file. */
export interface DatabaseSession {
  listSchemas(): Promise<string[]>;
  listTables(schema: string): Promise<TableInfo[]>;
  readTable(schema: string, table: string, offset: number, sort?: ColumnSort, filters?: RowFilter[]): Promise<TablePage>;
  readTail(schema: string, table: string, sort?: ColumnSort, filters?: RowFilter[]): Promise<TableTail>;
  truncateTable(schema: string, table: string): Promise<void>;
  updateCell(update: CellUpdate): Promise<UpdatedRow>;
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

export type Where = { sql: string; params: string[] };

/** Builds an AND of the row filters with bound values; `placeholder` renders the nth (1-based) parameter. */
export function whereClause(filters: RowFilter[], placeholder: (n: number) => string): Where {
  const params: string[] = [];
  const bind = (value: string) => {
    params.push(value);
    return placeholder(params.length);
  };
  const conditions = filters.map(({ column, operator, value }) => {
    const ident = quoteIdent(column);
    switch (operator) {
      case "is null":
      case "is not null":
        return `${ident} ${operator}`;
      case "contains":
        return `lower(cast(${ident} as text)) like ${bind(`%${value.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`)} escape '\\'`;
      case "in": {
        const values = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "");
        if (values.length === 0) throw new UserError(`Enter at least one value for ${column} in`);
        return `${ident} in (${values.map(bind).join(", ")})`;
      }
      case "!=":
        return `${ident} <> ${bind(value)}`;
      default:
        return `${ident} ${operator} ${bind(value)}`;
    }
  });
  return { sql: conditions.length === 0 ? "" : ` where ${conditions.join(" and ")}`, params };
}

export const ROW_NOT_FOUND = "No row has this primary key any more; it may have been changed or deleted";

/** Builds an UPDATE of one cell returning the whole row; `param` renders the nth (1-based) bound value for a column. */
export function updateCellSql(
  primaryKey: string[],
  { schema, table, key, column, value }: CellUpdate,
  param: (n: number, column: string) => string,
): { sql: string; params: (string | null)[] } {
  if (primaryKey.length === 0) throw new UserError("Setting a value needs a table with a primary key");
  const params: (string | null)[] = [value];
  const conditions = primaryKey.map((name) => {
    const current = key[name];
    if (typeof current !== "string") throw new UserError(`Missing primary key value for ${name}`);
    params.push(current);
    return `${quoteIdent(name)} = ${param(params.length, name)}`;
  });
  return {
    sql: `update ${quoteIdent(schema)}.${quoteIdent(table)} set ${quoteIdent(column)} = ${param(1, column)} where ${conditions.join(" and ")} returning *`,
    params,
  };
}

export function tailSql(
  schema: string,
  table: string,
  primaryKey: string[],
  limit: number,
  where: Where,
  sort?: ColumnSort,
): string {
  if (primaryKey.length === 0) throw new UserError("Live mode needs a table with a primary key");
  const from = `${quoteIdent(schema)}.${quoteIdent(table)}${where.sql}`;
  if (sort) return `select * from ${from}${orderBy(primaryKey, "asc", sort)} limit ${limit}`;
  return `select * from (select * from ${from}${orderBy(primaryKey, "desc")} limit ${limit}) as tail${orderBy(primaryKey)}`;
}
