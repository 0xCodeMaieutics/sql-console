import { describe, expect, it } from "vitest";
import { positionAt, splitSql } from "./split-sql.js";

const sqls = (text: string, sqliteTriggers = false) => splitSql(text, { sqliteTriggers }).map((s) => s.sql);

describe("splitSql", () => {
  it("splits on top-level semicolons and drops empty segments", () => {
    expect(sqls("select 1; select 2;;  ")).toEqual(["select 1", "select 2"]);
  });

  it("ignores semicolons in strings, identifiers and comments", () => {
    expect(sqls(`select 'a;b', "c;d", 'it''s;'; -- x;y\nselect 2 /* ; /* nested ; */ */`)).toEqual([
      `select 'a;b', "c;d", 'it''s;'`,
      "-- x;y\nselect 2 /* ; /* nested ; */ */",
    ]);
  });

  it("handles E'' strings with backslash escapes", () => {
    expect(sqls(`select E'a\\';b'; select 2`)).toEqual([`select E'a\\';b'`, "select 2"]);
  });

  it("keeps dollar-quoted bodies intact but not $1 parameters", () => {
    const fn = "create function f() returns int as $body$ begin return 1; end; $body$ language plpgsql";
    expect(sqls(`${fn}; select $$;$$; select $1`)).toEqual([fn, "select $$;$$", "select $1"]);
  });

  it("drops comment-only segments", () => {
    expect(sqls("-- just a comment\n; /* another */")).toEqual([]);
  });

  it("keeps SQLite trigger bodies together only when asked", () => {
    const trigger = "create trigger t after insert on a begin update b set n = n + 1; insert into c values (1); end";
    expect(sqls(`${trigger}; select 1`, true)).toEqual([trigger, "select 1"]);
    expect(sqls(`${trigger}; select 1`, false)).toHaveLength(4);
  });

  it("reports where each statement starts", () => {
    const [, second] = splitSql("select 1;\n  select 2");
    expect(second.start).toBe(12);
    expect(positionAt("select 1;\n  select 2", second.start)).toEqual({ line: 2, column: 3 });
  });
});
