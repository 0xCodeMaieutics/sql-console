import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError, LoginInfo, PgLogin, ScanRange, Settings, Target } from "../shared/types.js";
import { UserError } from "../core/errors.js";
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

export function createApi(store: Store, sessions = new SessionRegistry(store)) {
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
    return c.json(await sessions.session(targetFrom(c)).readTable(schema, table, offset));
  });

  api.get("/session/rows/tail", async (c) => {
    const schema = requireString(c.req.query("schema"), "schema");
    const table = requireString(c.req.query("table"), "table");
    return c.json(await sessions.session(targetFrom(c)).readTail(schema, table));
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
    return c.json(await sessions.session(targetFrom(c)).run(body.sql));
  });

  return { api, sessions };
}
