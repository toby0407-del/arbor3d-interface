import { useState, type FormEvent } from "react";
import { BrandMark } from "../components/BrandMark";
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
      <div className="login-deco" aria-hidden="true">
        <svg
          className="login-deco-svg"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <g id="login-tree-broad">
              <path d="M10 48c-16-34-14-66 0-96 14 30 16 62 0 96Z" />
              <rect x="7" y="44" width="6" height="22" rx="2" />
            </g>
            <g id="login-tree-round">
              <circle cx="10" cy="28" r="17" />
              <rect x="7" y="42" width="6" height="22" rx="2" />
            </g>
            <g id="login-tree-pine">
              <path d="M10 8 L22 28 H16 L24 44 H13 L26 60 H10 Z" />
              <path d="M10 8 L-2 28 H4 L-4 44 H7 L-6 60 H10 Z" />
              <rect x="8" y="58" width="4" height="14" rx="1.5" />
            </g>
            <g id="login-tree-cypress">
              <ellipse cx="8" cy="36" rx="7" ry="28" />
              <rect x="6" y="60" width="4" height="12" rx="1.5" />
            </g>
            <g id="login-tree-palm">
              <path d="M10 38 C2 20 0 12 8 8 C6 22 8 30 10 38Z" />
              <path d="M10 38 C18 20 20 12 12 8 C14 22 12 30 10 38Z" />
              <path d="M10 38 C0 28 -4 24 4 18 C6 28 8 34 10 38Z" />
              <path d="M10 38 C20 28 24 24 16 18 C14 28 12 34 10 38Z" />
              <rect x="8.5" y="36" width="3" height="28" rx="1.5" />
            </g>
          </defs>

          <g className="login-deco-ground">
            <path d="M-30 900V708c140-58 260-18 400 8 110 20 190-28 300-10 80 14 140 36 220 18V900Z" />
            <path d="M1470 900V698c-150-52-280-12-420 12-120 20-200-24-310-6-90 16-150 40-240 12V900Z" />
            <path d="M-20 900V798c100-28 200-4 310 10 90 12 160-20 250-6 90 16 160 8 250 22V900Z" />
            <path d="M1460 900V790c-110-24-210 0-320 12-90 10-160-18-250-4-90 14-150 10-240 24V900Z" />
          </g>

          <g className="login-deco-trees login-deco-trees-back">
            <use href="#login-tree-pine" transform="translate(40 640) scale(0.42)" />
            <use href="#login-tree-cypress" transform="translate(78 648) scale(0.4)" />
            <use href="#login-tree-round" transform="translate(118 652) scale(0.38)" />
            <use href="#login-tree-pine" transform="translate(1260 636) scale(0.4)" />
            <use href="#login-tree-palm" transform="translate(1304 644) scale(0.36)" />
            <use href="#login-tree-cypress" transform="translate(1348 650) scale(0.38)" />
          </g>

          <g className="login-deco-trees login-deco-trees-front">
            <use href="#login-tree-broad" transform="translate(6 668) scale(1)" />
            <use href="#login-tree-pine" transform="translate(88 690) scale(0.72)" />
            <use href="#login-tree-round" transform="translate(148 678) scale(0.86)" />
            <use href="#login-tree-palm" transform="translate(214 702) scale(0.7)" />
            <use href="#login-tree-cypress" transform="translate(268 718) scale(0.78)" />
            <use href="#login-tree-round" transform="translate(1124 684) scale(0.82)" />
            <use href="#login-tree-broad" transform="translate(1196 658) scale(1.06)" />
            <use href="#login-tree-pine" transform="translate(1284 688) scale(0.74)" />
            <use href="#login-tree-palm" transform="translate(1352 704) scale(0.68)" />
          </g>
        </svg>
      </div>

      <div className="login-shell">
        <aside className="login-hero" aria-hidden="true">
          <div className="login-hero-mark">
            <BrandMark size={64} />
          </div>
          <h1 className="login-hero-title">Arbor3D</h1>
          <p className="login-hero-copy">環保局樹木盤點</p>
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
                  <span>{staff.workId} · {staff.role}</span>
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
