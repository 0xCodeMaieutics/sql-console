import net from "node:net";
import type { OccupiedPort, ScanRange, ScanResult } from "../shared/types.js";
import { LOOPBACK_HOST } from "./loopback.js";

export type ProbeResult = "closed" | "listener" | "foreign";

/** PostgreSQL SSLRequest: length 8, code 80877103. A server answers with a single `S` or `N`. */
const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]);

export function probePort(port: number, timeoutMs = 800): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: LOOPBACK_HOST, port });
    let connected = false;
    let settled = false;

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => finish(connected ? "foreign" : "closed"));
    socket.once("connect", () => {
      connected = true;
      socket.write(SSL_REQUEST);
    });
    socket.once("data", (data) => {
      const isPostgres = data.length === 1 && (data[0] === 0x53 || data[0] === 0x4e);
      finish(isPostgres ? "listener" : "foreign");
    });
    socket.once("error", () => finish(connected ? "foreign" : "closed"));
    socket.once("close", () => finish(connected ? "foreign" : "closed"));
  });
}

export async function scanPorts(range: ScanRange): Promise<ScanResult> {
  const ports = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i);
  const probes = await Promise.all(ports.map(async (port) => ({ port, result: await probePort(port) })));
  const occupied: OccupiedPort[] = probes
    .filter((probe) => probe.result !== "closed")
    .map((probe) => ({ port: probe.port, kind: probe.result as OccupiedPort["kind"] }));
  return { range, ports: occupied, scannedAt: new Date().toISOString() };
}
