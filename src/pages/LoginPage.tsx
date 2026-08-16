import { useState, type FormEvent } from "react";
import { STAFF } from "../data/staff";

type Props = {
  onLogin: (workId: string, password: string) => boolean;
};

export function LoginPage({ onLogin }: Props) {
  const [workId, setWorkId] = useState(STAFF[0].workId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const selected = STAFF.find((item) => item.workId === workId) ?? STAFF[0];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ok = onLogin(workId, password);
    if (!ok) setError("工作編號或密碼不正確。");
  };

  return (
    <div className="login-screen">
      <div className="login-shell">
        <aside className="login-hero" aria-hidden="true">
          <div className="login-hero-mark">
            <svg viewBox="0 0 32 32" width="64" height="64">
              <circle cx="16" cy="16" r="15" fill="#2f4635" />
              <path
                d="M16 7.5c-3.2 3.2-5.4 6.4-5.4 9.4 0 3 2.4 5.1 5.4 5.1s5.4-2.1 5.4-5.1c0-3-2.2-6.2-5.4-9.4Z"
                fill="#dcead9"
              />
              <rect
                x="14.6"
                y="20.2"
                width="2.8"
                height="5.2"
                rx="1"
                fill="#efe8d8"
              />
            </svg>
          </div>
          <h1 className="login-hero-title">Arbor3D</h1>
          <p className="login-hero-copy">樹木盤點</p>
        </aside>

        <form className="login-card" onSubmit={submit}>
          <h2 className="login-card-title">登入</h2>

          <div className="login-staff-grid" role="listbox" aria-label="工作人員">
            {STAFF.map((staff) => {
              const active = staff.workId === workId;
              return (
                <button
                  key={staff.workId}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`login-staff-card ${active ? "is-active" : ""}`}
                  onClick={() => {
                    setWorkId(staff.workId);
                    setPassword("");
                    setError("");
                  }}
                >
                  <strong>{staff.name}</strong>
                  <span>{staff.workId}</span>
                </button>
              );
            })}
          </div>

          <label className="login-field">
            密碼
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}

          <div className="login-actions">
            <button type="submit" className="primary-btn login-primary">
              進入
            </button>
            <button
              type="button"
              className="ghost-btn login-ghost"
              onClick={() => onLogin(selected.workId, selected.password)}
            >
              示範登入
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
