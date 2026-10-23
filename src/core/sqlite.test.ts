import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE_ROW_LIMIT, TABLE_PAGE_SIZE } from "../shared/types.js";
import { UserError } from "./errors.js";
import { resolveSqlitePath, SqliteSession } from "./sqlite.js";

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sql-console-"));
  file = path.join(dir, "app.db");
  const db = new Database(file);
  db.exec(`
    create table users (id integer primary key, name text, avatar blob);
    create view user_names as select name from users;
    with recursive n(i) as (select 1 union all select i + 1 from n where i < 1200)
    insert into users (id, name) select i, 'user ' || i from n;
  `);
  db.close();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("resolveSqlitePath", () => {
  it("resolves relative paths against the start directory", () => {
    expect(resolveSqlitePath("app.db", dir)).toBe(file);
  });

  it("refuses to create missing files", () => {
    expect(() => resolveSqlitePath("missing.db", dir)).toThrow(UserError);
    expect(fs.existsSync(path.join(dir, "missing.db"))).toBe(false);
  });
});

describe("SqliteSession", () => {
  it("rejects files that are not SQLite databases", () => {
    const text = path.join(dir, "notes.txt");
    fs.writeFileSync(text, "hello, this is not a database file at all");
    expect(() => new SqliteSession(text)).toThrow(UserError);
  });

  it("lists the main schema and its tables and views", async () => {
    const session = new SqliteSession(file);
    expect(await session.listSchemas()).toEqual(["main"]);
    expect(await session.listTables("main")).toEqual([
      { name: "user_names", kind: "view" },
      { name: "users", kind: "table" },
    ]);
    session.close();
  });

  it("pages table rows", async () => {
    const session = new SqliteSession(file);
    const first = await session.readTable("main", "users", 0);
    expect(first.rows).toHaveLength(TABLE_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const last = await session.readTable("main", "users", 1000);
    expect(last.rows).toHaveLength(200);
    expect(last.hasMore).toBe(false);
    session.close();
  });

  it("orders pages by primary key and reports it", async () => {
    const db = new Database(file);
    db.exec(`
      create table events (seq integer, source text, note text, primary key (source, seq));
      insert into events values (2, 'b', 'b2'), (1, 'b', 'b1'), (9, 'a', 'a9');
    `);
    db.close();
    const session = new SqliteSession(file);
    const page = await session.readTable("main", "events", 0);
    expect(page.primaryKey).toEqual(["source", "seq"]);
    expect(page.rows.map((row) => row[2])).toEqual(["a9", "b1", "b2"]);
    expect((await session.readTable("main", "user_names", 0)).primaryKey).toEqual([]);
    session.close();
  });

  it("reads the newest rows by primary key, oldest first", async () => {
    const session = new SqliteSession(file);
    const tail = await session.readTail("main", "users");
    expect(tail.rows).toHaveLength(TABLE_PAGE_SIZE);
    expect(tail.rows[0][0]).toBe(1200 - TABLE_PAGE_SIZE + 1);
    expect(tail.rows.at(-1)?.[0]).toBe(1200);
    session.close();
  });

  it("refuses live reads without a primary key", async () => {
    const session = new SqliteSession(file);
    await expect(session.readTail("main", "user_names")).rejects.toThrow(UserError);
    session.close();
  });

  it("truncates a table", async () => {
    const session = new SqliteSession(file);
    await session.truncateTable("main", "users");
    expect((await session.readTable("main", "users", 0)).rows).toEqual([]);
    session.close();
  });

  it("returns one result per statement and stops at the first error", async () => {
    const session = new SqliteSession(file);
    const { results } = await session.run(`
      update users set avatar = x'beef' where id = 1;
      select id, avatar from users where id = 1;
      select * from users;
      create table t (x);
      select nope from users;
      select 'not reached';
    `);
    expect(results.map((r) => r.kind)).toEqual(["command", "rows", "rows", "command", "error"]);
    expect(results[0]).toMatchObject({ command: "UPDATE", affected: 1 });
    expect(results[1]).toMatchObject({ rows: [[1, "\\xbeef"]] });
    expect(results[2]).toMatchObject({ rowCount: 1200, truncated: true });
    expect(results[2].kind === "rows" && results[2].rows.length).toBe(CONSOLE_ROW_LIMIT);
    expect(results[3]).toMatchObject({ command: "CREATE", affected: null });
    expect(results[4]).toMatchObject({ message: expect.stringContaining("nope") });
    session.close();
  });
});
