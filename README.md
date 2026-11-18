# SQL Console

A local-only tool for inspecting the databases on your machine and running raw SQL against them. It supports PostgreSQL and SQLite.

## Screenshots

### Home

The console scans localhost ports for PostgreSQL instances. You can also open a SQLite database by its file path. Recently opened SQLite files are listed so you can reopen them in one click.

![Home page with listeners and SQLite files](docs/screenshots/home.png)

### Browse tables

Pick a schema and a table to see its rows. You can sort by column and add filters.

![Table view of a SQLite database](docs/screenshots/table.png)

### SQL console

Run raw SQL with ⌘/Ctrl + Enter. Each run is saved to a history panel, so you can bring earlier queries back.

![SQL console with run history and query results](docs/screenshots/console.png)

## Getting started

```sh
pnpm install
pnpm dev      # API on 127.0.0.1:4848, UI on http://127.0.0.1:5173
```

To build and run the production version:

```sh
pnpm build
pnpm start    # serves everything on http://127.0.0.1:4848
```

| Variable           | Default          | Purpose                                              |
| ------------------ | ---------------- | ---------------------------------------------------- |
| `PORT`             | `4848`           | Port the server listens on                           |
| `SQL_CONSOLE_HOME` | `~/.sql-console` | Where settings, saved logins, and run history are kept |

The server only listens on the loopback interface (see [ADR 0002](docs/adr/0002-local-web-server-bound-to-loopback.md)).

## Development

```sh
pnpm typecheck
pnpm test
```

The project's terms are defined in [CONTEXT.md](CONTEXT.md), and design decisions are recorded in [docs/adr](docs/adr).
