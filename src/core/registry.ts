import { DEFAULT_PG_LOGIN, type PgLogin, type Target } from "../shared/types.js";
import { PostgresSession } from "./postgres.js";
import type { DatabaseSession } from "./session.js";
import { SqliteSession } from "./sqlite.js";
import type { Store } from "./store.js";

export class SessionRegistry {
  private readonly postgres = new Map<string, PostgresSession>();
  private readonly sqlite = new Map<string, SqliteSession>();

  constructor(private readonly store: Store) {}

  loginFor(port: number): PgLogin {
    return this.store.getLogin(port) ?? DEFAULT_PG_LOGIN;
  }

  postgresSession(port: number, database: string): PostgresSession {
    const key = `${port}/${database}`;
    let session = this.postgres.get(key);
    if (!session) {
      session = new PostgresSession(port, database, this.loginFor(port));
      this.postgres.set(key, session);
    }
    return session;
  }

  sqliteSession(file: string): SqliteSession {
    let session = this.sqlite.get(file);
    if (!session) {
      session = new SqliteSession(file);
      this.sqlite.set(file, session);
    }
    return session;
  }

  session(target: Target): DatabaseSession {
    return target.engine === "postgres"
      ? this.postgresSession(target.port, target.database)
      : this.sqliteSession(target.path);
  }

  async forgetPort(port: number): Promise<void> {
    const closing: Promise<void>[] = [];
    for (const [key, session] of this.postgres) {
      if (session.port === port) {
        this.postgres.delete(key);
        closing.push(session.close());
      }
    }
    await Promise.all(closing);
  }

  forgetSqlite(file: string): void {
    this.sqlite.get(file)?.close();
    this.sqlite.delete(file);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.postgres.values()].map((session) => session.close()));
    for (const session of this.sqlite.values()) session.close();
    this.postgres.clear();
    this.sqlite.clear();
  }
}
