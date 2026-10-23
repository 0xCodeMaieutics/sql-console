# SQL Management Console

A local-only tool for inspecting database listeners on the machine and running raw SQL against them.

## Language

**Database engine**:
The server software that executes SQL. This console supports PostgreSQL and SQLite only.
_Avoid_: Database type, dialect (when meaning the engine)

**PostgreSQL instance**:
A PostgreSQL server process listening on a TCP port on this machine, reachable only via localhost.
_Avoid_: Server, cluster (unless referring to Postgres HA)

**SQLite database**:
A single SQLite database stored as a file on disk, opened directly without a network port.
_Avoid_: SQLite server, SQLite instance

**Scan range**:
The inclusive range of localhost TCP ports checked by a port scan; defaults to 5432–5445 and is configurable.
_Avoid_: Port window

**Occupied port**:
A port in the scan range where something is listening; it is either a listener or a foreign port.
_Avoid_: Open port, used port

**Listener**:
An occupied port whose responder completes a PostgreSQL handshake, i.e. a PostgreSQL instance.
_Avoid_: Connection, service, endpoint

**Foreign port**:
An occupied port that does not respond as PostgreSQL; shown for awareness but cannot be opened.
_Avoid_: Unknown service, other port

**Listeners view**:
The home-screen section listing the occupied ports from the latest scan; it scans on load and on manual rescan only.
_Avoid_: Port list, services tab

**SQLite view**:
The home-screen section where the user opens an existing SQLite database file by path; any path on disk is allowed, relative paths resolve from where the console was started, and missing files are an error rather than created.
_Avoid_: Files tab, local DBs

**Recent SQLite files**:
The last 10 SQLite database files successfully opened, listed in the SQLite view for one-click reopening and individually removable.
_Avoid_: History, bookmarks, favourites

**Saved login**:
The username, password, and database name the user chose for a PostgreSQL instance, stored locally and reused when opening that listener again.
_Avoid_: Connection profile, credential set

**Default PostgreSQL login**:
When no saved login exists for a listener, the form is pre-filled with username `postgres`, password `postgres`, and database name `postgres`, which the user can change before connecting.
_Avoid_: Default credentials, dev defaults

**Database detail page**:
The screen for one active session to a PostgreSQL instance or SQLite database file, showing where you are connected, schema selection, table browsing, and optional raw SQL.
_Avoid_: Studio, admin panel

**Connection banner**:
The line on the detail page that states the local target, e.g. connected to `localhost:5432` with the current database name.
_Avoid_: URL bar, connection string display (when meaning only the banner)

**Database switcher**:
The header control on a PostgreSQL detail page listing every database on that instance; choosing one starts a new active session on the same port with the same saved login.
_Avoid_: Database picker, catalog selector

**Schema scope**:
The namespace within the database whose tables appear in the sidebar; the default is `public` for PostgreSQL and `main` for SQLite.
_Avoid_: Database (when meaning Postgres schema), namespace

**Table browser**:
The left sidebar listing tables for the selected schema, with search, where choosing a table loads row data in the main view.
_Avoid_: Data grid, explorer

**SQL console**:
A separate mode on the detail page with a plain textarea to run arbitrary SQL against the current connection; no syntax highlighting in v1.
_Avoid_: Query editor, SQL tab

**Active session**:
The user’s current attachment to one PostgreSQL database on a given port, or one SQLite database file, from which browsing and SQL run.
_Avoid_: Connection, client

**Run**:
One execution of the SQL console's contents; it may contain several statements and produces one statement result per statement, in order.
_Avoid_: Query, execution, batch

**Statement result**:
The outcome of one statement in a run: a row set (at most 1,000 rows displayed, with a truncation notice), a rows-affected summary with duration, or the database's error message with position when available.
_Avoid_: Output, response

**Console draft**:
The SQL text in the console, remembered per active session target (port and database, or SQLite file) across view switches and page reloads.
_Avoid_: Saved query, snippet

**Unrestricted SQL**:
The SQL console may run any statement the database role permits, with no application-level read-only mode or destructive-statement prompts in v1.
_Avoid_: Safe mode, read-only console

**Table page**:
The read-only rows shown when a table is opened in the main view: up to 500 at a time, with load more fetching the next 500. Unless a column sort is applied, rows are ordered by primary key when the table has one; otherwise they appear in the database's natural order, which is not guaranteed to be stable. Row edits happen only through the SQL console; the only other data change is a table truncation from the table menu.
_Avoid_: Pagination, infinite scroll, data editor

**Column sort**:
An ordering the user applies to a table page by one column at a time, either ascending or descending; choosing the column again cycles ascending, descending, then no column sort, and choosing another column replaces it. It orders the whole table in the database, not just the loaded rows, so the table page reloads from its first 500 rows and load more continues in that order. Rows with equal values are further ordered by primary key when the table has one, so load more neither repeats nor skips rows; views and tables without a primary key can still be sorted, but ties have no stable order. Any column can be chosen; if the database cannot order it, its error is shown and the column sort is cleared. Empty (NULL) values always come last, in either direction and on both database engines. With no column sort, the table page's default order applies. It is not remembered: every table page opens with no column sort, and it lasts until the user changes it or leaves the table page, and is kept when a table truncation reloads the page. It applies only to the table page, not to statement results in the SQL console.
_Avoid_: Client-side sort, filter

**Row filter**:
A condition the user adds to a table page so only matching rows are shown: a column, an operator (`=`, `!=`, `>`, `>=`, `<`, `<=`, `in` with a comma-separated list, case-insensitive `contains`, `is null`, `is not null`), and a value. Several row filters must all match. Like a column sort, they apply to the whole table in the database, not just the loaded rows; the table page reloads from its first 500 matching rows, load more and live mode respect them, and values are always sent as bound parameters. Filters are edited in the filter bar and applied with Enter or Apply; right-clicking a cell offers "Filter by this value". If the database rejects a filter (for example text compared to an integer column), its error is shown and the filters stay so they can be corrected. Like a column sort, they are not remembered beyond the table page and are kept when a table truncation reloads the page.
_Avoid_: Search (which is the table browser's name search), WHERE clause, query

**Live mode**:
A toggle on the table page that, while on, re-fetches rows every 2 seconds so rows added or changed elsewhere appear without reopening the table. With no column sort it shows the last 500 rows by primary key, newest at the bottom, and the view follows the bottom as long as the user is scrolled there. With a column sort it shows the first 500 rows in that order and the view follows the top as long as the user is scrolled there. Scrolling away from the followed edge stops following until they return. Changing the column sort keeps it on and re-fetches in the new order. Load more is unavailable while it is on. It is off whenever a table page is opened, turns itself off if a re-fetch fails, is unavailable for tables without a primary key and for views, and never writes to the database.
_Avoid_: Auto-refresh, realtime, sync, watch

**Table menu**:
The context menu opened by right-clicking a table in the table browser; its only action is table truncation, which is unavailable for views.
_Avoid_: Right-click menu, table actions, popover

**Table truncation**:
Deleting every row of one table from the table menu, after a confirmation prompt; PostgreSQL runs `TRUNCATE TABLE`, SQLite runs an unqualified `DELETE`. The table itself, its columns, and its indexes remain, and an open table page reloads empty.
_Avoid_: Clear table, empty table, wipe, drop (which removes the table)
