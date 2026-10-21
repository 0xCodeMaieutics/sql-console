import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_SCAN_RANGE,
  RECENT_SQLITE_LIMIT,
  type PgLogin,
  type ScanRange,
} from "../shared/types.js";
import { UserError } from "./errors.js";

type Config = {
  scanRange: ScanRange;
  logins: Record<string, PgLogin>;
  recentSqlite: string[];
};

const MAX_SCAN_SIZE = 1000;

export function defaultConfigPath(): string {
  const home = process.env.SQL_CONSOLE_HOME ?? path.join(os.homedir(), ".sql-console");
  return path.join(home, "config.json");
}

/** Local JSON config. Passwords are stored in plain text, so the file is written owner-only. */
export class Store {
  private config: Config;

  constructor(private readonly file = defaultConfigPath()) {
    this.config = this.load();
  }

  get scanRange(): ScanRange {
    return this.config.scanRange;
  }

  setScanRange(range: ScanRange): ScanRange {
    const start = Number(range.start);
    const end = Number(range.end);
    const valid = (port: number) => Number.isInteger(port) && port >= 1 && port <= 65535;
    if (!valid(start) || !valid(end) || end < start) {
      throw new UserError("Scan range must be two ports between 1 and 65535, with start ≤ end");
    }
    if (end - start + 1 > MAX_SCAN_SIZE) {
      throw new UserError(`Scan range can cover at most ${MAX_SCAN_SIZE} ports`);
    }
    this.config.scanRange = { start, end };
    this.save();
    return this.config.scanRange;
  }

  getLogin(port: number): PgLogin | undefined {
    return this.config.logins[String(port)];
  }

  setLogin(port: number, login: PgLogin): void {
    this.config.logins[String(port)] = login;
    this.save();
  }

  deleteLogin(port: number): void {
    delete this.config.logins[String(port)];
    this.save();
  }

  get recentSqlite(): string[] {
    return this.config.recentSqlite;
  }

  touchRecentSqlite(file: string): void {
    this.config.recentSqlite = [file, ...this.config.recentSqlite.filter((f) => f !== file)].slice(
      0,
      RECENT_SQLITE_LIMIT,
    );
    this.save();
  }

  removeRecentSqlite(file: string): void {
    this.config.recentSqlite = this.config.recentSqlite.filter((f) => f !== file);
    this.save();
  }

  private load(): Config {
    const fallback: Config = { scanRange: DEFAULT_SCAN_RANGE, logins: {}, recentSqlite: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<Config>;
      return {
        scanRange: parsed.scanRange ?? fallback.scanRange,
        logins: parsed.logins ?? {},
        recentSqlite: parsed.recentSqlite ?? [],
      };
    } catch {
      return fallback;
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.file, `${JSON.stringify(this.config, null, 2)}\n`, { mode: 0o600 });
  }
}
