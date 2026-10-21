# Ship as a loopback-only local web app, keep a desktop shell possible

The console runs as a Node server started from the CLI, bound to `127.0.0.1`, with a React UI in the browser. We chose this over Electron/Tauri for speed of delivery; the cost is that SQLite files are opened by pasting a path rather than through a native file dialog. The core (scanning, sessions, query execution) stays independent of the HTTP layer so it can later be wrapped in a desktop shell without a rewrite.
