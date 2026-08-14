import { useState, type FormEvent } from "react";
import { STAFF } from "../data/staff";

type Props = {
  onLogin: (workId: string, password: string) => boolean;
};

export function LoginPage({ onLogin }: Props) {
  const [workId, setWorkId] = useState(STAFF[0].workId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ok = onLogin(workId, password);
    if (!ok) setError("工作編號或密碼不正確。");
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="36" height="36">
              <circle cx="16" cy="16" r="15" fill="#2f4635" />
              <path
                d="M16 7.5c-3.2 3.2-5.4 6.4-5.4 9.4 0 3 2.4 5.1 5.4 5.1s5.4-2.1 5.4-5.1c0-3-2.2-6.2-5.4-9.4Z"
                fill="#dcead9"
              />
              <rect x="14.6" y="20.2" width="2.8" height="5.2" rx="1" fill="#efe8d8" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Arbor3D 後台</div>
            <div className="brand-sub">公園樹木盤點</div>
          </div>
        </div>

        <h1>以工作編號登入</h1>
        <p className="lede">選擇自己的工作編號，輸入密碼後進入地圖選點。</p>

        <label className="login-field">
          工作編號
          <select
            value={workId}
            onChange={(event) => {
              setWorkId(event.target.value);
              setError("");
            }}
          >
            {STAFF.map((staff) => (
              <option key={staff.workId} value={staff.workId}>
                {staff.workId}　{staff.name}（{staff.role}）
              </option>
            ))}
          </select>
        </label>

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

        <button type="submit" className="primary-btn">
          進入後台
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            const staff = STAFF.find((item) => item.workId === workId);
            if (staff) onLogin(workId, staff.password);
          }}
        >
          使用目前這組示範帳號進入
        </button>

        <div className="demo-accounts">
          <p>第一版示範帳號（之後改接真實後台）</p>
          <ul>
            {STAFF.map((staff) => (
              <li key={staff.workId}>
                <code>{staff.workId}</code> {staff.name}　密碼{" "}
                <code>{staff.password}</code>
              </li>
            ))}
          </ul>
        </div>
      </form>
    </div>
  );
}
