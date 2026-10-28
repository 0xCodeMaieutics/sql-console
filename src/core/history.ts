import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { RUN_HISTORY_LIMIT, targetKey, type HistoryEntry, type Target } from "../shared/types.js";
import { consoleHome } from "./store.js";

export function defaultHistoryPath(): string {
  return path.join(consoleHome(), "history.db");
}

type Row = { id: number; sql: string; ran_at: number };

const toEntry = (row: Row): HistoryEntry => ({ id: row.id, sql: row.sql, ranAt: new Date(row.ran_at).toISOString() });

/** Run history per active session target, in the console's own SQLite file; SQL may hold secrets, so it is owner-only. */
export class RunHistory {
  private readonly db: Database.Database;

  constructor(file = defaultHistoryPath()) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new Database(file);
    fs.chmodSync(file, 0o600);
    this.db.exec(`
      create table if not exists runs (
        id integer primary key,
        target text not null,
        sql text not null,
        ran_at integer not null
      );
      create index if not exists runs_by_target on runs (target, ran_at desc, id desc);
    `);
  }

  list(target: Target): HistoryEntry[] {
    return this.db
      .prepare<[string, number], Row>(
        "select id, sql, ran_at from runs where target = ? order by ran_at desc, id desc limit ?",
      )
      .all(targetKey(target), RUN_HISTORY_LIMIT)
      .map(toEntry);
  }

  /** Re-running the newest entry's SQL only refreshes its time; older entries beyond the limit are dropped. */
  record(target: Target, sql: string, ranAt = Date.now()): void {
    const key = targetKey(target);
    this.db.transaction(() => {
      const newest = this.db
        .prepare<[string], Row>("select id, sql, ran_at from runs where target = ? order by ran_at desc, id desc limit 1")
        .get(key);
      if (newest?.sql === sql) {
        this.db.prepare("update runs set ran_at = ? where id = ?").run(Math.max(ranAt, newest.ran_at), newest.id);
        return;
      }
      this.db.prepare("insert into runs (target, sql, ran_at) values (?, ?, ?)").run(key, sql, ranAt);
      this.db
        .prepare(
          `delete from runs where target = ? and id not in (
            select id from runs where target = ? order by ran_at desc, id desc limit ?
          )`,
        )
        .run(key, key, RUN_HISTORY_LIMIT);
    })();
  }

  remove(target: Target, id: number): void {
    this.db.prepare("delete from runs where target = ? and id = ?").run(targetKey(target), id);
  }

  clear(target: Target): void {
    this.db.prepare("delete from runs where target = ?").run(targetKey(target));
  }

  close(): void {
    this.db.close();
  }
}
