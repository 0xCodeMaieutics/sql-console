import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAsync } from "../hooks";

export function HomePage() {
  return (
    <div className="home">
      <header className="home-header">
        <h1>SQL Console</h1>
        <p className="muted">Local PostgreSQL instances and SQLite files on this machine.</p>
      </header>
      <ListenersView />
      <SqliteView />
    </div>
  );
}

function ListenersView() {
  const [settings, reloadSettings] = useAsync(() => api.settings(), []);
  const [scan, rescan] = useAsync(() => api.scan(), []);
  const [editing, setEditing] = useState(false);
  const range = settings.data?.scanRange;

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Listeners</h2>
          <p className="muted">
            {range ? `Occupied localhost ports in ${range.start}–${range.end}` : "Loading scan range…"}
            {scan.data && ` · scanned ${new Date(scan.data.scannedAt).toLocaleTimeString()}`}
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit range"}
          </button>
          <button onClick={rescan} disabled={scan.status === "loading"}>
            {scan.status === "loading" ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      {editing && range && (
        <ScanRangeForm
          initial={range}
          onSaved={() => {
            setEditing(false);
            reloadSettings();
            rescan();
          }}
        />
      )}

      {scan.status === "error" && <p className="error">{scan.error.message}</p>}
      {scan.data && scan.data.ports.length === 0 && (
        <p className="empty">Nothing is listening in this range.</p>
      )}
      {scan.data && scan.data.ports.length > 0 && (
        <ul className="port-list">
          {scan.data.ports.map(({ port, kind }) =>
            kind === "listener" ? (
              <li key={port}>
                <Link className="port-row" to={`/pg/${port}`}>
                  <span className="port">localhost:{port}</span>
                  <span className="badge pg">PostgreSQL</span>
                  <span className="open">Open →</span>
                </Link>
              </li>
            ) : (
              <li key={port}>
                <div className="port-row foreign" title="Something else is listening on this port">
                  <span className="port">localhost:{port}</span>
                  <span className="badge">In use, not PostgreSQL</span>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function ScanRangeForm({ initial, onSaved }: { initial: { start: number; end: number }; onSaved: () => void }) {
  const [start, setStart] = useState(String(initial.start));
  const [end, setEnd] = useState(String(initial.end));
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.saveScanRange({ start: Number(start), end: Number(end) });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <label>
        From
        <input type="number" value={start} onChange={(e) => setStart(e.target.value)} min={1} max={65535} />
      </label>
      <label>
        To
        <input type="number" value={end} onChange={(e) => setEnd(e.target.value)} min={1} max={65535} />
      </label>
      <button type="submit">Save</button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

function SqliteView() {
  const navigate = useNavigate();
  const [recent, , setRecent] = useAsync(() => api.recentSqlite(), []);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string>();
  const [opening, setOpening] = useState(false);

  useEffect(() => setError(undefined), [path]);

  const open = async (input: string) => {
    setOpening(true);
    try {
      const { path: resolved } = await api.openSqlite(input);
      navigate(`/sqlite?${new URLSearchParams({ path: resolved })}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOpening(false);
    }
  };

  const remove = async (file: string) => {
    const { files } = await api.removeRecentSqlite(file);
    setRecent({ status: "ready", data: { files } });
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>SQLite</h2>
          <p className="muted">Open an existing database file. Relative paths resolve from where the console started.</p>
        </div>
      </div>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          void open(path);
        }}
      >
        <input
          className="grow mono"
          placeholder="./dev.db or /absolute/path/to/app.sqlite"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button type="submit" disabled={opening || path.trim() === ""}>
          Open
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {recent.data && recent.data.files.length > 0 && (
        <>
          <h3>Recent</h3>
          <ul className="port-list">
            {recent.data.files.map((file) => (
              <li key={file} className="recent-row">
                <button className="link mono" onClick={() => void open(file)}>
                  {file}
                </button>
                <button className="icon" title="Remove from recent" onClick={() => void remove(file)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
