import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  FILTER_OPERATORS,
  type ApiError,
  type ColumnSort,
  type FilterOperator,
  type LoginInfo,
  type PgLogin,
  type RowFilter,
  type ScanRange,
  type Settings,
  type Target,
} from "../shared/types.js";
import { UserError } from "../core/errors.js";
import type { RunHistory } from "../core/history.js";
import { isLoopbackHostname, parsePort } from "../core/loopback.js";
import { testLogin } from "../core/postgres.js";
import { SessionRegistry } from "../core/registry.js";
import { scanPorts } from "../core/scan.js";
import { resolveSqlitePath } from "../core/sqlite.js";
import type { Store } from "../core/store.js";

function hostnameOf(hostHeader: string): string {
  if (hostHeader.startsWith("[")) return hostHeader.slice(0, hostHeader.indexOf("]") + 1);
  return hostHeader.split(":")[0];
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new UserError(`Missing ${name}`);
  return value;
}

function targetFrom(c: Context): Target {
  const engine = c.req.query("engine");
  if (engine === "postgres") {
    return {
      engine,
      port: parsePort(c.req.query("port")),
      database: requireString(c.req.query("database"), "database"),
    };
  }
  if (engine === "sqlite") {
    return { engine, path: resolveSqlitePath(requireString(c.req.query("path"), "path")) };
  }
  throw new UserError("engine must be postgres or sqlite");
}

function sortFrom(c: Context): ColumnSort | undefined {
  const column = c.req.query("sort");
  if (!column) return undefined;
  const direction = c.req.query("direction");
  if (direction !== "asc" && direction !== "desc") throw new UserError("direction must be asc or desc");
  return { column, direction };
}

function filtersFrom(c: Context): RowFilter[] {
  const raw = c.req.query("filters");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserError("filters must be JSON");
  }
  if (!Array.isArray(parsed)) throw new UserError("filters must be an array");
  return parsed.map((item: Record<string, unknown>) => {
    const operator = item?.operator as FilterOperator;
    if (!FILTER_OPERATORS.includes(operator)) throw new UserError(`Unknown filter operator: ${String(operator)}`);
    return {
      column: requireString(item.column, "filter column"),
      operator,
      value: typeof item.value === "string" ? item.value : "",
    };
  });
}

function parseLogin(body: unknown): PgLogin {
  const input = (body ?? {}) as Record<string, unknown>;
  return {
    user: requireString(input.user, "user"),
    password: typeof input.password === "string" ? input.password : "",
    database: requireString(input.database, "database"),
  };
}

async function jsonBody(c: Context): Promise<unknown> {
  if (!c.req.header("content-type")?.includes("application/json")) {
    throw new UserError("Expected a JSON request body");
  }
  return c.req.json();
}

export function createApi(store: Store, history: RunHistory, sessions = new SessionRegistry(store)) {
  const api = new Hono();

  // Reject requests that did not originate from a loopback page (DNS rebinding, cross-site POSTs).
  api.use("*", async (c, next) => {
    const host = c.req.header("host") ?? "";
    const origin = c.req.header("origin");
    const originOk = !origin || isLoopbackOrigin(origin);
    if (!isLoopbackHostname(hostnameOf(host)) || !originOk) {
      return c.json<ApiError>({ error: "This console only accepts requests from localhost" }, 403);
    }
    await next();
  });

  api.onError((error, c) => {
    if (error instanceof UserError) {
      return c.json<ApiError>({ error: error.message, code: error.code }, error.status as ContentfulStatusCode);
    }
    console.error(error);
    return c.json<ApiError>({ error: error.message || "Internal error" }, 500);
  });

  api.get("/settings", (c) => c.json<Settings>({ scanRange: store.scanRange }));

  api.put("/settings", async (c) => {
    const body = (await jsonBody(c)) as { scanRange?: ScanRange };
    if (!body.scanRange) throw new UserError("Missing scanRange");
    return c.json<Settings>({ scanRange: store.setScanRange(body.scanRange) });
  });

  api.get("/scan", async (c) => c.json(await scanPorts(store.scanRange)));

  api.get("/pg/:port/login", (c) => {
    const port = parsePort(c.req.param("port"));
    const saved = store.getLogin(port);
    return c.json<LoginInfo>({ login: sessions.loginFor(port), saved: saved !== undefined });
  });

  api.put("/pg/:port/login", async (c) => {
    const port = parsePort(c.req.param("port"));
    const login = parseLogin(await jsonBody(c));
    await testLogin(port, login);
    await sessions.forgetPort(port);
    store.setLogin(port, login);
    return c.json<LoginInfo>({ login, saved: true });
  });

  api.delete("/pg/:port/login", async (c) => {
    const port = parsePort(c.req.param("port"));
    await sessions.forgetPort(port);
    store.deleteLogin(port);
    return c.json<LoginInfo>({ login: sessions.loginFor(port), saved: false });
  });

  api.get("/pg/:port/databases", async (c) => {
    const port = parsePort(c.req.param("port"));
    const database = requireString(c.req.query("database"), "database");
    return c.json({ databases: await sessions.postgresSession(port, database).listDatabases() });
  });

  api.get("/sqlite/recent", (c) => c.json({ files: store.recentSqlite }));

  api.post("/sqlite/open", async (c) => {
    const body = (await jsonBody(c)) as { path?: unknown };
    const file = resolveSqlitePath(requireString(body.path, "path"));
    sessions.forgetSqlite(file);
    sessions.sqliteSession(file);
    store.touchRecentSqlite(file);
    return c.json({ path: file });
  });

  api.delete("/sqlite/recent", (c) => {
    const file = requireString(c.req.query("path"), "path");
    sessions.forgetSqlite(file);
    store.removeRecentSqlite(file);
    return c.json({ files: store.recentSqlite });
  });

  api.get("/session/schemas", async (c) => c.json({ schemas: await sessions.session(targetFrom(c)).listSchemas() }));

  api.get("/session/tables", async (c) => {
    const schema = requireString(c.req.query("schema"), "schema");
    return c.json({ tables: await sessions.session(targetFrom(c)).listTables(schema) });
  });

  api.get("/session/rows", async (c) => {
    const schema = requireString(c.req.query("schema"), "schema");
    const table = requireString(c.req.query("table"), "table");
    const offset = Math.max(0, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0);
    return c.json(
      await sessions.session(targetFrom(c)).readTable(schema, table, offset, sortFrom(c), filtersFrom(c)),
    );
  });

  api.get("/session/rows/tail", async (c) => {
    const schema = requireString(c.req.query("schema"), "schema");
    const table = requireString(c.req.query("table"), "table");
    return c.json(await sessions.session(targetFrom(c)).readTail(schema, table, sortFrom(c), filtersFrom(c)));
  });

  api.post("/session/truncate", async (c) => {
    const body = (await jsonBody(c)) as { schema?: unknown; table?: unknown };
    const schema = requireString(body.schema, "schema");
    const table = requireString(body.table, "table");
    await sessions.session(targetFrom(c)).truncateTable(schema, table);
    return c.json({ ok: true });
  });

  api.post("/session/run", async (c) => {
    const body = (await jsonBody(c)) as { sql?: unknown };
    if (typeof body.sql !== "string") throw new UserError("Missing sql");
    const target = targetFrom(c);
    const result = await sessions.session(target).run(body.sql);
    if (result.results.length > 0) history.record(target, body.sql);
    return c.json(result);
  });

  api.get("/session/history", (c) => c.json({ entries: history.list(targetFrom(c)) }));

  api.delete("/session/history", (c) => {
    const target = targetFrom(c);
    history.clear(target);
    return c.json({ entries: history.list(target) });
  });

  api.delete("/session/history/:id", (c) => {
    const target = targetFrom(c);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) throw new UserError("History entry id must be an integer");
    history.remove(target, id);
    return c.json({ entries: history.list(target) });
  });

  return { api, sessions };
}
