import { useMemo, useState } from "react";
import sample from "./data/park_inventory_report.sample.json";
import { AppShell, findTree } from "./components/AppShell";
import { authenticate } from "./data/staff";
import { findPark, findPath } from "./data/sites";
import {
  clearSession,
  readSession,
  writeSession,
  type Session,
} from "./lib/session";
import { LoginPage } from "./pages/LoginPage";
import { ParkOverview } from "./pages/ParkOverview";
import { ReviewQueue } from "./pages/ReviewQueue";
import { SitePickerPage } from "./pages/SitePickerPage";
import { Tree3DView } from "./pages/Tree3DView";
import { TreeDetail } from "./pages/TreeDetail";
import type { ParkInventoryReport, Route } from "./types";

const report = sample as ParkInventoryReport;

type Screen = "login" | "sites" | "work";
type SiteChoice = { parkId: string; pathId: string };

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [screen, setScreen] = useState<Screen>(() => (readSession() ? "sites" : "login"));
  const [site, setSite] = useState<SiteChoice | null>(null);
  const [route, setRoute] = useState<Route>({ name: "overview" });

  const park = site ? findPark(site.parkId) : undefined;
  const path = site ? findPath(site.parkId, site.pathId) : undefined;

  const selected = useMemo(() => {
    if (route.name !== "detail" && route.name !== "splat") return undefined;
    return findTree(report.trees, route.treeId);
  }, [route]);

  if (screen === "login" || !session) {
    return (
      <LoginPage
        onLogin={(workId, password) => {
          const staff = authenticate(workId, password);
          if (!staff) return false;
          setSession(writeSession(staff));
          setScreen("sites");
          return true;
        }}
      />
    );
  }

  if (screen === "sites" || !park || !path) {
    return (
      <SitePickerPage
        session={session}
        onLogout={() => {
          clearSession();
          setSession(null);
          setSite(null);
          setScreen("login");
        }}
        onEnterPath={(parkId, pathId) => {
          setSite({ parkId, pathId });
          setRoute({ name: "overview" });
          setScreen("work");
        }}
      />
    );
  }

  let body = (
    <ParkOverview
      park={park}
      path={path}
      report={report}
      onOpenTree={(treeId) => setRoute({ name: "detail", treeId })}
    />
  );

  if (route.name === "review") {
    body = (
      <ReviewQueue
        report={report}
        onOpenTree={(treeId) => setRoute({ name: "detail", treeId })}
      />
    );
  } else if (route.name === "detail" && selected) {
    body = (
      <TreeDetail
        tree={selected}
        onBack={() => setRoute({ name: "overview" })}
        onOpen3d={() => setRoute({ name: "splat", treeId: selected.Tree_ID })}
      />
    );
  } else if (route.name === "splat" && selected) {
    body = (
      <Tree3DView
        tree={selected}
        onBack={() => setRoute({ name: "detail", treeId: selected.Tree_ID })}
      />
    );
  }

  return (
    <AppShell
      session={session}
      park={park}
      path={path}
      report={report}
      route={route}
      onNavigate={setRoute}
      onChangeSite={() => {
        setSite(null);
        setScreen("sites");
      }}
      onLogout={() => {
        clearSession();
        setSession(null);
        setSite(null);
        setScreen("login");
      }}
    >
      {body}
    </AppShell>
  );
}
