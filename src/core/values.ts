import type { Cell } from "../shared/types.js";

export function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return `\\x${Buffer.from(value).toString("hex")}`;
  }
  if (Array.isArray(value)) return value.map(toCell);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, toCell(v)]));
  }
  return String(value);
}

export function toRow(values: readonly unknown[]): Cell[] {
  return values.map(toCell);
}
