import type { ReactNode } from "react";
import { ColorLegend } from "./ColorLegend";
import type { ParkSite, ScanPath } from "../data/sites";
import type { Session } from "../lib/session";
import type { ParkInventoryReport, Route, TreeRecord } from "../types";
import { isReviewTree } from "../lib/status";

type Props = {
  session: Session;
  park: ParkSite;
  path: ScanPath;
  report: ParkInventoryReport;
  route: Route;
  onNavigate: (route: Route) => void;
  onChangeSite: () => void;
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({
  session,
  park,
  path,
  report,
  route,
  onNavigate,
  onChangeSite,
  onLogout,
  children,
}: Props) {
  const reviewCount = report.trees.filter(isReviewTree).length;
  const nav: { id: Route["name"]; label: string; go: Route }[] = [
    { id: "overview", label: "路徑總覽", go: { name: "overview" } },
    { id: "review", label: "待複核", go: { name: "review" } },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <circle cx="16" cy="16" r="15" fill="#2f4635" />
              <path
                d="M16 7.5c-3.2 3.2-5.4 6.4-5.4 9.4 0 3 2.4 5.1 5.4 5.1s5.4-2.1 5.4-5.1c0-3-2.2-6.2-5.4-9.4Z"
                fill="#dcead9"
              />
              <rect x="14.6" y="20.2" width="2.8" height="5.2" rx="1" fill="#efe8d8" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Arbor3D</div>
            <div className="brand-sub">
              {session.workId} · {session.name}
            </div>
          </div>
        </div>

        <div className="top-meta">
          <button type="button" className="site-chip" onClick={onChangeSite}>
            <span className="meta-kicker">公園／路徑</span>
            <strong>
              {park.name} · {path.name}
            </strong>
          </button>
          <div className="meta-chip">
            <span className="meta-kicker">樹的數量</span>
            <strong>{report.num_trees}</strong>
          </div>
          <div className="meta-chip is-alert">
            <span className="meta-kicker">待複核</span>
            <strong>{reviewCount}</strong>
          </div>
        </div>

        <button type="button" className="ghost-btn" onClick={onLogout}>
          登出
        </button>
      </header>

      <div className="workspace">
        <nav className="sidenav" aria-label="主要畫面">
          {nav.map((item) => {
            const active =
              route.name === item.id ||
              ((route.name === "detail" || route.name === "splat") &&
                item.id === "overview");
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-btn ${active ? "is-active" : ""}`}
                onClick={() => onNavigate(item.go)}
              >
                {item.label}
                {item.id === "review" && reviewCount > 0 ? (
                  <span className="nav-count">{reviewCount}</span>
                ) : null}
              </button>
            );
          })}
          <ColorLegend compact />
          <p className="nav-note">
            示範資料。之後遠端 clone，把真實 `park_inventory_report.json` 接進來即可。
          </p>
        </nav>
        <main className="main-pane">{children}</main>
      </div>
    </div>
  );
}

export function findTree(
  trees: TreeRecord[],
  treeId: string,
): TreeRecord | undefined {
  return trees.find((tree) => tree.Tree_ID === treeId);
}
