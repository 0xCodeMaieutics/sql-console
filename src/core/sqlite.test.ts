import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE_ROW_LIMIT, TABLE_PAGE_SIZE, type RowFilter } from "../shared/types.js";
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

  it("sorts the whole table by a column with NULLs last in both directions", async () => {
    const db = new Database(file);
    db.exec(`update users set name = null where id in (3, 700)`);
    db.close();
    const session = new SqliteSession(file);
    const asc = await session.readTable("main", "users", 0, { column: "name", direction: "asc" });
    expect(asc.rows[0][1]).toBe("user 1");
    expect(asc.rows[1][1]).toBe("user 10");
    const desc = await session.readTable("main", "users", 0, { column: "name", direction: "desc" });
    expect(desc.rows[0][1]).toBe("user 999");
    const lastPage = await session.readTable("main", "users", 1000, { column: "name", direction: "desc" });
    expect(lastPage.rows.slice(-2).map((row) => row[0])).toEqual([3, 700]);
    session.close();
  });

  it("breaks ties by primary key so pages neither repeat nor skip rows", async () => {
    const db = new Database(file);
    db.exec(`update users set name = case when id % 2 = 0 then 'even' else 'odd' end`);
    db.close();
    const session = new SqliteSession(file);
    const sort = { column: "name", direction: "asc" } as const;
    const ids = [];
    for (let offset = 0; offset < 1200; offset += TABLE_PAGE_SIZE) {
      ids.push(...(await session.readTable("main", "users", offset, sort)).rows.map((row) => row[0]));
    }
    expect(new Set(ids).size).toBe(1200);
    expect(ids.slice(0, 3)).toEqual([2, 4, 6]);
    session.close();
  });

  it("reads the first rows in column sort order for live mode", async () => {
    const session = new SqliteSession(file);
    const tail = await session.readTail("main", "users", { column: "id", direction: "desc" });
    expect(tail.rows).toHaveLength(TABLE_PAGE_SIZE);
    expect(tail.rows[0][0]).toBe(1200);
    expect(tail.rows.at(-1)?.[0]).toBe(1200 - TABLE_PAGE_SIZE + 1);
    session.close();
  });

  it("reports a database error for a column that cannot be sorted", async () => {
    const session = new SqliteSession(file);
    await expect(
      session.readTable("main", "users", 0, { column: 'nope"; drop table users; --', direction: "asc" }),
    ).rejects.toThrow(UserError);
    expect((await session.readTable("main", "users", 0)).rows).toHaveLength(TABLE_PAGE_SIZE);
    session.close();
  });

  it("filters the whole table with bound values", async () => {
    const db = new Database(file);
    db.exec(`update users set name = null where id = 7; update users set name = 'Ann 100%' where id = 1100`);
    db.close();
    const session = new SqliteSession(file);
    const ids = async (filters: RowFilter[], offset = 0) =>
      (await session.readTable("main", "users", offset, undefined, filters)).rows.map((row) => row[0]);
    expect(await ids([{ column: "id", operator: "=", value: "42" }])).toEqual([42]);
    expect(await ids([{ column: "id", operator: "in", value: "3, 1199,,9999" }])).toEqual([3, 1199]);
    expect(await ids([{ column: "id", operator: ">", value: "1197" }])).toEqual([1198, 1199, 1200]);
    expect(await ids([{ column: "name", operator: "is null", value: "" }])).toEqual([7]);
    expect(await ids([{ column: "name", operator: "contains", value: "ann 100%" }])).toEqual([1100]);
    expect(await ids([{ column: "name", operator: "contains", value: "_" }])).toEqual([]);
    expect(
      await ids([
        { column: "id", operator: ">=", value: "10" },
        { column: "id", operator: "<", value: "12" },
      ]),
    ).toEqual([10, 11]);
    expect(await ids([{ column: "id", operator: "!=", value: "1" }], 1000)).toHaveLength(199);
    expect(await ids([{ column: "name", operator: "=", value: "x'); drop table users; --" }])).toEqual([]);
    expect((await session.readTable("main", "users", 0)).rows).toHaveLength(TABLE_PAGE_SIZE);
    session.close();
  });

  it("filters live reads", async () => {
    const session = new SqliteSession(file);
    const tail = await session.readTail("main", "users", undefined, [{ column: "id", operator: "<=", value: "5" }]);
    expect(tail.rows.map((row) => row[0])).toEqual([1, 2, 3, 4, 5]);
    session.close();
  });

  it("rejects an in filter without values", async () => {
    const session = new SqliteSession(file);
    await expect(
      session.readTable("main", "users", 0, undefined, [{ column: "id", operator: "in", value: " , " }]),
    ).rejects.toThrow(UserError);
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
