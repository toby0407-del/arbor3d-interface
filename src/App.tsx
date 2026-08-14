import { useMemo, useState } from "react";
import { AppShell, findTree } from "./components/AppShell";
import { authenticate } from "./data/staff";
import { getReport } from "./data/inventory";
import { findPark, findPath } from "./data/sites";
import type { LatLng } from "./data/sites";
import { useFieldMeasures } from "./hooks/useFieldMeasures";
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
import type { Route } from "./types";

type Screen = "login" | "sites" | "work";
type SiteChoice = {
  parkId: string;
  pathId: string;
  scanId: string;
  recordedPolyline?: LatLng[];
};

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [screen, setScreen] = useState<Screen>(() =>
    readSession() ? "sites" : "login",
  );
  const [site, setSite] = useState<SiteChoice | null>(null);
  const [route, setRoute] = useState<Route>({ name: "overview" });
  const field = useFieldMeasures(site?.scanId ?? null);

  const park = site ? findPark(site.parkId) : undefined;
  const basePath = site ? findPath(site.parkId, site.pathId) : undefined;
  const path = useMemo(() => {
    if (!basePath) return undefined;
    if (site?.recordedPolyline && site.recordedPolyline.length >= 2) {
      return {
        ...basePath,
        name: `${basePath.name}（現場錄製）`,
        polyline: site.recordedPolyline,
        note: "這條線來自 App 現場定位錄製。",
      };
    }
    return basePath;
  }, [basePath, site]);

  const report = site ? getReport(site.scanId) : undefined;
  const scanIds = basePath?.scanIds?.length
    ? basePath.scanIds
    : site?.scanId
      ? [site.scanId]
      : [];

  const selected = useMemo(() => {
    if (!report) return undefined;
    if (route.name !== "detail" && route.name !== "splat") return undefined;
    return findTree(report.trees, route.treeId);
  }, [route, report]);

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

  if (screen === "sites" || !park || !path || !report || !site) {
    return (
      <SitePickerPage
        session={session}
        onLogout={() => {
          clearSession();
          setSession(null);
          setSite(null);
          setScreen("login");
        }}
        onEnterPath={(parkId, pathId, recordedPolyline) => {
          const nextPath = findPath(parkId, pathId);
          if (!nextPath?.scanId || !getReport(nextPath.scanId)) return;
          setSite({
            parkId,
            pathId,
            scanId: nextPath.scanId,
            recordedPolyline,
          });
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
      field={field.store}
      onOpenTree={(treeId) => setRoute({ name: "detail", treeId })}
    />
  );

  if (route.name === "review") {
    body = (
      <ReviewQueue
        report={report}
        field={field.store}
        onFieldChange={field.save}
        onOpenTree={(treeId) => setRoute({ name: "detail", treeId })}
      />
    );
  } else if (route.name === "detail" && selected) {
    body = (
      <TreeDetail
        tree={selected}
        scanId={site.scanId}
        field={field.store[selected.Tree_ID]}
        onFieldChange={(next) => field.save(selected.Tree_ID, next)}
        onBack={() => setRoute({ name: "overview" })}
        onOpen3d={() => setRoute({ name: "splat", treeId: selected.Tree_ID })}
      />
    );
  } else if (route.name === "splat" && selected) {
    body = (
      <Tree3DView
        tree={selected}
        scanId={site.scanId}
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
      scanId={site.scanId}
      scanIds={scanIds}
      onScanChange={(next) => {
        if (!getReport(next)) return;
        setSite({ ...site, scanId: next });
        setRoute({ name: "overview" });
      }}
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
