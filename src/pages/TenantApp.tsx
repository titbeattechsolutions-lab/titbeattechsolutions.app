import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import App from "@/components/school/School_Management_App";
import {
  loadTenantSession,
  fetchTenantData,
  saveTenantData,
  clearTenantSession,
  daysRemaining,
  type TenantSession,
} from "@/lib/tenant-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, CloudOff, Loader2 } from "lucide-react";

const DB_KEY = "schoolapp_v1";
const SAVE_DEBOUNCE_MS = 1500;

export default function TenantApp() {
  const navigate = useNavigate();
  const [session, setSession] = useState<TenantSession | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastSaved = useRef<string>("");

  // Load tenant data into localStorage, then mount the app
  useEffect(() => {
    const s = loadTenantSession();
    if (!s) { navigate("/", { replace: true }); return; }

    if (s.status === "expired" || s.status === "suspended") {
      setSession(s); setPhase("expired"); return;
    }
    const d = daysRemaining(s);
    if (d !== null && d < 0) { setSession(s); setPhase("expired"); return; }

    (async () => {
      const remote = await fetchTenantData(s);
      if (remote === null) { setPhase("error"); return; }
      // Seed localStorage with remote data (or empty object — app will fill defaults)
      localStorage.setItem(DB_KEY, JSON.stringify(remote));
      lastSaved.current = JSON.stringify(remote);
      setSession(s);
      setPhase("ready");
    })();
  }, [navigate]);

  // Watch localStorage for changes and push to Cloud (debounced)
  useEffect(() => {
    if (phase !== "ready" || !session) return;

    const pushIfChanged = () => {
      const current = localStorage.getItem(DB_KEY) ?? "{}";
      if (current === lastSaved.current) return;
      lastSaved.current = current;
      try {
        const parsed = JSON.parse(current);
        saveTenantData(session, parsed);
      } catch { /* malformed — skip */ }
    };

    const schedule = () => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(pushIfChanged, SAVE_DEBOUNCE_MS);
    };

    // Patch setItem to detect writes from anywhere in the app
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k: string, v: string) => {
      origSet(k, v);
      if (k === DB_KEY) schedule();
    };

    // Also poll as a safety net
    const interval = setInterval(pushIfChanged, 5000);

    // Push pending save on unload
    const onUnload = () => {
      const current = localStorage.getItem(DB_KEY) ?? "{}";
      if (current !== lastSaved.current) {
        try { saveTenantData(session, JSON.parse(current)); } catch { /* */ }
      }
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearTimeout(saveTimer.current);
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
      localStorage.setItem = origSet;
      pushIfChanged();
    };
  }, [phase, session]);

  const signOut = () => {
    clearTenantSession();
    localStorage.removeItem(DB_KEY);
    navigate("/", { replace: true });
  };

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading school data...
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 max-w-md text-center space-y-3">
          <CloudOff className="w-10 h-10 mx-auto text-destructive" />
          <h2 className="text-xl font-bold">Connection failed</h2>
          <p className="text-sm text-muted-foreground">Could not load school data. Check your internet connection.</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => location.reload()}>Retry</Button>
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 max-w-md text-center space-y-3">
          <h2 className="text-xl font-bold">Subscription {session?.status === "suspended" ? "suspended" : "expired"}</h2>
          <p className="text-sm text-muted-foreground">
            Please contact your provider to renew access for <strong>{session?.schoolName}</strong>.
          </p>
          <Button variant="outline" onClick={signOut}><LogOut className="w-4 h-4 mr-1" /> Sign out</Button>
        </Card>
      </div>
    );
  }

  const d = session ? daysRemaining(session) : null;
  const showBanner = session && (session.status === "trial" || (d !== null && d <= 14));

  return (
    <div className="min-h-screen">
      {showBanner && (
        <div className="bg-accent text-accent-foreground text-xs px-3 py-1.5 text-center flex items-center justify-center gap-3">
          <span>
            {session!.status === "trial" ? "🎁 Free trial" : "⏰ Subscription"} — {d ?? "?"} days remaining
            {session!.status === "trial" && " · Contact provider to subscribe"}
          </span>
          <button onClick={signOut} className="underline opacity-80 hover:opacity-100">Sign out</button>
        </div>
      )}
      <App />
    </div>
  );
}
