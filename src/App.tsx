import { useState } from "react";
import { authenticate } from "./data/staff";
import {
  clearSession,
  readSession,
  writeSession,
  type Session,
} from "./lib/session";
import { LandscapeGate } from "./components/LandscapeGate";
import { LoginPage } from "./pages/LoginPage";
import { SitePickerPage } from "./pages/SitePickerPage";

type Screen = "login" | "sites";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [screen, setScreen] = useState<Screen>(() =>
    readSession() ? "sites" : "login",
  );

  return (
    <LandscapeGate>
      {screen === "login" || !session ? (
        <LoginPage
          onLogin={(workId, password) => {
            const staff = authenticate(workId, password);
            if (!staff) return false;
            setSession(writeSession(staff));
            setScreen("sites");
            return true;
          }}
        />
      ) : (
        <SitePickerPage
          session={session}
          onLogout={() => {
            clearSession();
            setSession(null);
            setScreen("login");
          }}
        />
      )}
    </LandscapeGate>
  );
}
