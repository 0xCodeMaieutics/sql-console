import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Target } from "../../shared/types";
import { api, lastDatabase, RequestError } from "../api";
import { SqlConsole } from "../components/SqlConsole";
import { TableView } from "../components/TableView";
import { useAsync } from "../hooks";

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
  const [filter, setFilter] = useState("");
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

  const [tables] = useAsync(
    () => (schema ? api.tables(target, schema) : Promise.resolve({ tables: [] })),
    [target, schema],
  );

  const setParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    setSearchParams(params);
  };

  const visibleTables = (tables.data?.tables ?? []).filter((t) =>
    t.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

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
            <input
              className="search"
              placeholder="Search tables…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {tables.status === "error" && <p className="error">{tables.error.message}</p>}
            <ul className="table-list">
              {visibleTables.map((t) => (
                <li key={t.name}>
                  <button
                    className={t.name === table && !consoleOpen ? "selected" : ""}
                    onClick={() => setParams({ table: t.name, view: undefined })}
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
          </aside>
          <main className="main">
            {consoleOpen ? (
              <SqlConsole target={target} />
            ) : table && schema ? (
              <TableView key={`${schema}.${table}`} target={target} schema={schema} table={table} />
            ) : (
              <p className="empty">Select a table, or open the SQL console.</p>
            )}
          </main>
        </div>
      )}
    </div>
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
