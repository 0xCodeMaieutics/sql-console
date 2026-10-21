import type { SourcePosition } from "../shared/types.js";

export type SqlStatement = { sql: string; start: number };

export type SplitOptions = {
  /** SQLite trigger bodies contain `;` inside BEGIN … END. */
  sqliteTriggers?: boolean;
};

const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;
const SQLITE_TRIGGER = /^\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i;
const ENDS_WITH_END = /\bEND\s*$/i;

/**
 * Splits a script into top-level statements, ignoring `;` inside string
 * literals, quoted identifiers, comments and dollar-quoted bodies.
 * Segments containing only whitespace or comments are dropped.
 */
export function splitSql(text: string, options: SplitOptions = {}): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let segmentStart = 0;
  let code = "";
  let i = 0;

  const flush = (end: number) => {
    if (code.trim() !== "") {
      const raw = text.slice(segmentStart, end);
      const leading = raw.length - raw.trimStart().length;
      statements.push({ sql: raw.trim(), start: segmentStart + leading });
    }
    code = "";
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "-" && next === "-") {
      const newline = text.indexOf("\n", i);
      i = newline === -1 ? text.length : newline;
      continue;
    }

    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === "/" && text[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (text[i] === "*" && text[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      const backslashEscapes = ch === "'" && /[eE]/.test(text[i - 1] ?? "") && !/\w/.test(text[i - 2] ?? "");
      i++;
      while (i < text.length) {
        if (backslashEscapes && text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === ch) {
          if (text[i + 1] === ch) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      code += " x ";
      continue;
    }

    if (ch === "$" && !/\w/.test(text[i - 1] ?? "")) {
      const tag = DOLLAR_TAG.exec(text.slice(i))?.[0];
      if (tag) {
        const close = text.indexOf(tag, i + tag.length);
        i = close === -1 ? text.length : close + tag.length;
        code += " x ";
        continue;
      }
    }

    if (ch === ";") {
      const insideTrigger =
        options.sqliteTriggers && SQLITE_TRIGGER.test(code) && !ENDS_WITH_END.test(code);
      if (!insideTrigger) {
        flush(i);
        segmentStart = i + 1;
        i++;
        continue;
      }
    }

    code += ch;
    i++;
  }

  flush(text.length);
  return statements;
}

export function positionAt(text: string, index: number): SourcePosition {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}
