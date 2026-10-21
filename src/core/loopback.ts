import { UserError } from "./errors.js";

/** Every database connection and the console server itself are pinned to this address. */
export const LOOPBACK_HOST = "127.0.0.1";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

export function parsePort(value: unknown): number {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UserError(`Invalid port: ${String(value)}`);
  }
  return port;
}
