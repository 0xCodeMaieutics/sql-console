import type {
  ApiError,
  LoginInfo,
  PgLogin,
  RunResult,
  ScanRange,
  ScanResult,
  Settings,
  TableInfo,
  TablePage,
  TableTail,
  Target,
} from "../shared/types";

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await response.json().catch(() => ({ error: response.statusText }))) as T | ApiError;
  if (!response.ok) {
    const error = data as ApiError;
    throw new RequestError(error.error, response.status, error.code);
  }
  return data as T;
}

function targetQuery(target: Target, extra: Record<string, string> = {}): string {
  const params: Record<string, string> =
    target.engine === "postgres"
      ? { engine: "postgres", port: String(target.port), database: target.database }
      : { engine: "sqlite", path: target.path };
  return new URLSearchParams({ ...params, ...extra }).toString();
}

export const api = {
  settings: () => request<Settings>("/settings"),
  saveScanRange: (scanRange: ScanRange) => request<Settings>("/settings", { method: "PUT", body: { scanRange } }),
  scan: () => request<ScanResult>("/scan"),

  login: (port: number) => request<LoginInfo>(`/pg/${port}/login`),
  saveLogin: (port: number, login: PgLogin) =>
    request<LoginInfo>(`/pg/${port}/login`, { method: "PUT", body: login }),
  forgetLogin: (port: number) => request<LoginInfo>(`/pg/${port}/login`, { method: "DELETE" }),
  databases: (port: number, database: string) =>
    request<{ databases: string[] }>(`/pg/${port}/databases?${new URLSearchParams({ database })}`),

  recentSqlite: () => request<{ files: string[] }>("/sqlite/recent"),
  openSqlite: (path: string) => request<{ path: string }>("/sqlite/open", { method: "POST", body: { path } }),
  removeRecentSqlite: (path: string) =>
    request<{ files: string[] }>(`/sqlite/recent?${new URLSearchParams({ path })}`, { method: "DELETE" }),

  schemas: (target: Target) => request<{ schemas: string[] }>(`/session/schemas?${targetQuery(target)}`),
  tables: (target: Target, schema: string) =>
    request<{ tables: TableInfo[] }>(`/session/tables?${targetQuery(target, { schema })}`),
  rows: (target: Target, schema: string, table: string, offset: number) =>
    request<TablePage>(`/session/rows?${targetQuery(target, { schema, table, offset: String(offset) })}`),
  tail: (target: Target, schema: string, table: string) =>
    request<TableTail>(`/session/rows/tail?${targetQuery(target, { schema, table })}`),
  truncate: (target: Target, schema: string, table: string) =>
    request<{ ok: true }>(`/session/truncate?${targetQuery(target)}`, { method: "POST", body: { schema, table } }),
  run: (target: Target, sql: string) =>
    request<RunResult>(`/session/run?${targetQuery(target)}`, { method: "POST", body: { sql } }),
};

export function targetKey(target: Target): string {
  return target.engine === "postgres" ? `postgres:${target.port}/${target.database}` : `sqlite:${target.path}`;
}

const lastDatabaseKey = (port: number) => `sql-console:last-database:${port}`;

export const lastDatabase = {
  get: (port: number) => localStorage.getItem(lastDatabaseKey(port)) ?? undefined,
  set: (port: number, database: string) => localStorage.setItem(lastDatabaseKey(port), database),
};
