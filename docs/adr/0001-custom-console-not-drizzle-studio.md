# Build a custom console instead of wrapping Drizzle Studio

The UX is modelled on Drizzle Studio, but we build our own UI and server on plain drivers (`postgres.js`, `better-sqlite3`) rather than spawning `drizzle-kit studio`. Studio is tied to one `drizzle.config.ts` per process, has no port scanning or multi-instance home screen, and does not enforce localhost-only, all of which are core to this product.
