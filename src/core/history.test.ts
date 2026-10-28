import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUN_HISTORY_LIMIT, type Target } from "../shared/types.js";
import { RunHistory } from "./history.js";

const app: Target = { engine: "postgres", port: 5432, database: "app" };
const other: Target = { engine: "postgres", port: 5432, database: "other" };

let dir: string;
let history: RunHistory;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sql-console-history-"));
  history = new RunHistory(path.join(dir, "history.db"));
});

afterEach(() => {
  history.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("RunHistory", () => {
  it("lists runs newest first, separately per target", () => {
    history.record(app, "select 1", 1000);
    history.record(app, "select 2", 2000);
    history.record(other, "select 3", 3000);
    expect(history.list(app).map((e) => e.sql)).toEqual(["select 2", "select 1"]);
    expect(history.list(other).map((e) => e.sql)).toEqual(["select 3"]);
    expect(history.list(app)[0].ranAt).toBe(new Date(2000).toISOString());
  });

  it("only refreshes the time when the newest entry is run again", () => {
    history.record(app, "select 1", 1000);
    history.record(app, "select 1", 5000);
    expect(history.list(app)).toEqual([expect.objectContaining({ sql: "select 1", ranAt: new Date(5000).toISOString() })]);
  });

  it("adds a new entry when older SQL is run again", () => {
    history.record(app, "select 1", 1000);
    history.record(app, "select 2", 2000);
    history.record(app, "select 1", 3000);
    expect(history.list(app).map((e) => e.sql)).toEqual(["select 1", "select 2", "select 1"]);
  });

  it(`keeps the ${RUN_HISTORY_LIMIT} newest entries per target`, () => {
    history.record(other, "keep me", 1);
    for (let i = 0; i < RUN_HISTORY_LIMIT + 5; i++) history.record(app, `select ${i}`, 10 + i);
    const entries = history.list(app);
    expect(entries).toHaveLength(RUN_HISTORY_LIMIT);
    expect(entries.at(-1)?.sql).toBe("select 5");
    expect(history.list(other)).toHaveLength(1);
  });

  it("removes one entry or clears a target", () => {
    history.record(app, "select 1", 1000);
    history.record(app, "select 2", 2000);
    history.record(other, "select 3", 3000);
    history.remove(app, history.list(app)[0].id);
    expect(history.list(app).map((e) => e.sql)).toEqual(["select 1"]);
    history.clear(app);
    expect(history.list(app)).toEqual([]);
    expect(history.list(other)).toHaveLength(1);
  });

  it("persists across reopening", () => {
    history.record(app, "select 1", 1000);
    history.close();
    history = new RunHistory(path.join(dir, "history.db"));
    expect(history.list(app).map((e) => e.sql)).toEqual(["select 1"]);
  });
});
