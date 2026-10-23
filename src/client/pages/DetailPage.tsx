import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { TableInfo, Target } from "../../shared/types";
import { api, lastDatabase, RequestError } from "../api";
import { ContextMenu } from "../components/ContextMenu";
import { SqlConsole } from "../components/SqlConsole";
import { TableView } from "../components/TableView";
import { useAsync, type AsyncState } from "../hooks";

function useTarget(): Target | undefined {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const sqlitePath = searchParams.get("path");
  return useMemo(() => {
    if (pathname.startsWith("/sqlite")) {
      return sqlitePath ? { engine: "sqlite", path: sqlitePath } : undefined;
    }
    return { engine: "postgres", port: Number(params.port), database: params.database ?? "postgres" };
  }, [pathname, params.port, params.database, sqlitePath]);
}

export function DetailPage() {
  const target = useTarget();
  if (!target) return <p className="page-message error">Missing SQLite path.</p>;
  return <Detail key={target.engine === "postgres" ? `${target.port}/${target.database}` : target.path} target={target} />;
}

function Detail({ target }: { target: Target }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [schemas] = useAsync(() => api.schemas(target), [target]);

  const defaultSchema = target.engine === "postgres" ? "public" : "main";
  const schemaList = schemas.data?.schemas ?? [];
  const requestedSchema = searchParams.get("schema");
  const schema =
    requestedSchema && schemaList.includes(requestedSchema)
      ? requestedSchema
      : schemaList.includes(defaultSchema)
        ? defaultSchema
        : schemaList[0];
  const table = searchParams.get("table") ?? undefined;
  const consoleOpen = searchParams.get("view") === "console";

  const [menu, setMenu] = useState<{ x: number; y: number; table: TableInfo }>();
  const [menuError, setMenuError] = useState<string>();
  const [truncations, setTruncations] = useState(0);

  const [tables] = useAsync(
    () => (schema ? api.tables(target, schema) : Promise.resolve({ tables: [] })),
    [target, schema],
  );

  const setParams = (next: Record<string, string | undefined>, options?: { replace?: boolean }) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    setSearchParams(params, options);
  };

  const truncate = async (name: string) => {
    setMenu(undefined);
    if (!schema || !window.confirm(`Delete every row in ${schema}.${name}? This cannot be undone.`)) return;
    setMenuError(undefined);
    try {
      await api.truncate(target, schema, name);
      setTruncations((n) => n + 1);
    } catch (e) {
      setMenuError((e as Error).message);
    }
  };

  return (
    <div className="detail">
      <header className="detail-header">
        <Link to="/" className="back">
          ← Home
        </Link>
        <ConnectionBanner target={target} />
        {target.engine === "postgres" && <DatabaseSwitcher port={target.port} database={target.database} />}
        <label className="inline-label">
          Schema
          <select
            value={schema ?? ""}
            disabled={schemaList.length === 0}
            onChange={(e) => setParams({ schema: e.target.value, table: undefined })}
          >
            {schemaList.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        {target.engine === "postgres" && (
          <Link to={`/pg/${target.port}?edit`} className="header-link">
            Change login
          </Link>
        )}
        <button
          className={consoleOpen ? "" : "secondary"}
          onClick={() => setParams({ view: consoleOpen ? undefined : "console" })}
        >
          {consoleOpen ? "Close SQL console" : "SQL console"}
        </button>
      </header>

      {schemas.status === "error" ? (
        <SessionError target={target} error={schemas.error} />
      ) : (
        <div className="detail-body">
          <aside className="sidebar">
            <TableList
              tables={tables}
              selected={consoleOpen ? undefined : table}
              error={menuError}
              onSelect={(name) => setParams({ table: name, view: undefined })}
              onContextMenu={(e, t) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, table: t });
              }}
            />
          </aside>
          <main className="main">
            {consoleOpen ? (
              <SqlConsole target={target} />
            ) : table && schema ? (
              <TableView key={`${schema}.${table}#${truncations}`} target={target} schema={schema} table={table} />
            ) : (
              <p className="empty">Select a table, or open the SQL console.</p>
            )}
          </main>
        </div>
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(undefined)}>
          <button
            className="danger"
            disabled={menu.table.kind === "view"}
            title={menu.table.kind === "view" ? "Views cannot be truncated" : undefined}
            onClick={() => void truncate(menu.table.name)}
          >
            Truncate table
          </button>
        </ContextMenu>
      )}
    </div>
  );
}

function TableList({
  tables,
  selected,
  error,
  onSelect,
  onContextMenu,
}: {
  tables: AsyncState<{ tables: TableInfo[] }>;
  selected: string | undefined;
  error: string | undefined;
  onSelect: (name: string) => void;
  onContextMenu: (e: MouseEvent, table: TableInfo) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(() => searchParams.get("search") ?? "");
  const syncTimer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(syncTimer.current), []);

  const changeFilter = (value: string, delay = 300) => {
    setFilter(value);
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);
          if (value) params.set("search", value);
          else params.delete("search");
          return params;
        },
        { replace: true },
      );
    }, delay);
  };

  const needle = filter.trim().toLowerCase();
  const visibleTables = (tables.data?.tables ?? []).filter((t) => t.name.toLowerCase().includes(needle));

  return (
    <>
      <div className="search">
        <input placeholder="Search tables…" value={filter} onChange={(e) => changeFilter(e.target.value)} />
        {filter && (
          <button
            className="icon search-clear"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => changeFilter("", 0)}
          >
            ×
          </button>
        )}
      </div>
      {tables.status === "error" && <p className="error">{tables.error.message}</p>}
      {error && <p className="error">{error}</p>}
      <ul className="table-list">
        {visibleTables.map((t) => (
          <li key={t.name}>
            <button
              className={t.name === selected ? "selected" : ""}
              onClick={() => onSelect(t.name)}
              onContextMenu={(e) => onContextMenu(e, t)}
              title={t.name}
            >
              <span className="table-name">{t.name}</span>
              {t.kind === "view" && <span className="tag">view</span>}
            </button>
          </li>
        ))}
      </ul>
      {tables.status === "ready" && visibleTables.length === 0 && (
        <p className="empty small">{filter ? "No matching tables" : "No tables in this schema"}</p>
      )}
    </>
  );
}

function ConnectionBanner({ target }: { target: Target }) {
  return (
    <div className="banner">
      <span className="dot" />
      {target.engine === "postgres" ? (
        <span>
          Connected to <strong className="mono">localhost:{target.port}</strong>
        </span>
      ) : (
        <span>
          SQLite <strong className="mono">{target.path}</strong>
        </span>
      )}
    </div>
  );
}

function DatabaseSwitcher({ port, database }: { port: number; database: string }) {
  const navigate = useNavigate();
  const [databases] = useAsync(() => api.databases(port, database), [port, database]);
  const options = databases.data?.databases ?? [database];

  return (
    <label className="inline-label">
      Database
      <select
        value={database}
        onChange={(e) => {
          lastDatabase.set(port, e.target.value);
          navigate(`/pg/${port}/${encodeURIComponent(e.target.value)}`);
        }}
      >
        {(options.includes(database) ? options : [database, ...options]).map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  );
}

function SessionError({ target, error }: { target: Target; error: Error }) {
  const authProblem = error instanceof RequestError && ["28P01", "28000", "3D000"].includes(error.code ?? "");
  return (
    <div className="session-error card">
      <h2>Could not open this database</h2>
      <p className="error">{error.message}</p>
      {target.engine === "postgres" && (
        <Link to={`/pg/${target.port}?edit`} className="button">
          {authProblem ? "Fix login" : "Change login"}
        </Link>
      )}
    </div>
  );
}
