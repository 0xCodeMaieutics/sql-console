import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { PgLogin } from "../../shared/types";
import { api } from "../api";
import { useAsync } from "../hooks";

export function PgConnectPage() {
  const port = Number(useParams().port);
  const [searchParams] = useSearchParams();
  const editing = searchParams.has("edit");
  const [info, reload] = useAsync(() => api.login(port), [port]);

  if (info.status === "loading") return <p className="page-message">Loading…</p>;
  if (info.status === "error") return <p className="page-message error">{info.error.message}</p>;
  if (info.data.saved && !editing) {
    return <Navigate replace to={`/pg/${port}/${encodeURIComponent(info.data.login.database)}`} />;
  }
  return <LoginForm port={port} initial={info.data.login} saved={info.data.saved} onForgotten={reload} />;
}

function LoginForm({
  port,
  initial,
  saved,
  onForgotten,
}: {
  port: number;
  initial: PgLogin;
  saved: boolean;
  onForgotten: () => void;
}) {
  const navigate = useNavigate();
  const [login, setLogin] = useState(initial);
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => setLogin(initial), [initial]);

  const update = (field: keyof PgLogin) => (event: { target: { value: string } }) =>
    setLogin((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setConnecting(true);
    setError(undefined);
    try {
      const result = await api.saveLogin(port, login);
      navigate(`/pg/${port}/${encodeURIComponent(result.login.database)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const forget = async () => {
    await api.forgetLogin(port);
    onForgotten();
  };

  return (
    <div className="connect">
      <Link to="/" className="back">
        ← All listeners
      </Link>
      <form className="card login-form" onSubmit={submit}>
        <h2>Connect to localhost:{port}</h2>
        <p className="muted">The host is always 127.0.0.1. The login is saved for this port on this machine.</p>
        <label>
          Username
          <input value={login.user} onChange={update("user")} autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={login.password} onChange={update("password")} />
        </label>
        <label>
          Database
          <input value={login.database} onChange={update("database")} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {saved && (
            <button type="button" className="secondary" onClick={() => void forget()}>
              Forget saved login
            </button>
          )}
          <button type="submit" disabled={connecting}>
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </div>
      </form>
    </div>
  );
}
