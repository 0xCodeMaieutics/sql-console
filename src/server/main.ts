#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { LOOPBACK_HOST } from "../core/loopback.js";
import { RunHistory } from "../core/history.js";
import { Store } from "../core/store.js";
import { createApi } from "./app.js";

const port = Number(process.env.PORT ?? 4848);
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const store = new Store();
const history = new RunHistory();
const { api, sessions } = createApi(store, history);
const app = new Hono();
app.route("/api", api);

if (fs.existsSync(path.join(clientDir, "index.html"))) {
  app.get("*", (c) => {
    const requested = path.normalize(path.join(clientDir, decodeURIComponent(c.req.path)));
    const isAsset =
      requested.startsWith(clientDir + path.sep) && fs.existsSync(requested) && fs.statSync(requested).isFile();
    const file = isAsset ? requested : path.join(clientDir, "index.html");
    const type = MIME_TYPES[path.extname(file)] ?? "application/octet-stream";
    return c.body(fs.readFileSync(file), 200, { "content-type": type });
  });
}

const server = serve({ fetch: app.fetch, hostname: LOOPBACK_HOST, port }, (info) => {
  console.log(`SQL console listening on http://${LOOPBACK_HOST}:${info.port}`);
});

const shutdown = async () => {
  server.close();
  await sessions.closeAll();
  history.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
