import { useEffect, useRef, useState, useCallback } from "react";
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
import { logAuthEvent } from "@/lib/auth-logger";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, CloudOff, Loader2, Cloud, CloudUpload } from "lucide-react";

const DB_KEY = "greatmind_school_db_v2";
const SAVE_DEBOUNCE_MS = 1200;
const PULL_INTERVAL_MS = 8000;

type SyncPhase = "idle" | "pulling" | "pushing" | "synced" | "error";

function bumpRev(obj: Record<string, unknown>): Record<string, unknown> {
  const cur = typeof obj?._rev === "number" ? (obj._rev as number) : 0;
  return { 
    ...obj, 
    _rev: cur + 1, 
    _updatedAt: new Date().toISOString() 
  };
}

export default function TenantApp() {
  const navigate = useNavigate();
  
  const [session, setSession] = useState<TenantSession | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);

  const saveTimer = useRef<NodeJS.Timeout>();
  const pullTimer = useRef<NodeJS.Timeout>();
  const lastSerialized = useRef<string>("");
  const localRev = useRef<number>(0);
  const isSyncing = useRef<boolean>(false);
  const signedOut = useRef<boolean>(false);

  // Helper to safely dispatch storage event
  const dispatchRehydrate = useCallback((data: string) => {
    window.dispatchEvent(new StorageEvent("storage", { 
      key: DB_KEY, 
      newValue: data 
    }));
  }, []);

  // 1. Initial Load
  useEffect(() => {
    const s = loadTenantSession();
    if (!s) {
      navigate("/", { replace: true });
      return;
    }

    if (s.status === "expired" || s.status === "suspended") {
      setSession(s);
      setPhase("expired");
      return;
    }

    const d = daysRemaining(s);
    if (d !== null && d < 0) {
      setSession(s);
      setPhase("expired");
      return;
    }

    (async () => {
      try {
        const remote = await fetchTenantData(s);
        if (remote === null) {
          setPhase("error");
          return;
        }

        let data = remote as Record<string, unknown>;

        // Prefer newer local data (offline edits)
        try {
          const localRaw = localStorage.getItem(DB_KEY);
          if (localRaw) {
            const local = JSON.parse(localRaw) as Record<string, unknown>;
            const localRevNum = (local._rev as number) ?? 0;
            const remoteRevNum = (data._rev as number) ?? 0;
            if (localRevNum > remoteRevNum) {
              data = local;
            }
          }
        } catch (e) {
          console.warn("Failed to parse local DB", e);
        }

        // Enforce school name from session
        if (!data.schoolSettings) data.schoolSettings = {};
        (data.schoolSettings as any).name = s.schoolName;

        const json = JSON.stringify(data);

        localStorage.setItem(DB_KEY, json);
        lastSerialized.current = json;
        localRev.current = (data._rev as number) ?? 0;

        setSession(s);
        setPhase("ready");
        setSyncPhase("synced");
        setLastSyncAt(Date.now());

        // Dispatch AFTER state update (next tick) so App has mounted
        setTimeout(() => dispatchRehydrate(json), 10);
      } catch (err) {
        console.error(err);
        setPhase("error");
      }
    })();
  }, [navigate, dispatchRehydrate]);

  // 2. Sync Logic
  useEffect(() => {
    if (phase !== "ready" || !session) return;

    const pushIfChanged = async () => {
      if (isSyncing.current || signedOut.current) return;

      const current = localStorage.getItem(DB_KEY) ?? "{}";
      if (current === lastSerialized.current) return;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(current);
      } catch {
        return;
      }

      const stamped = bumpRev(parsed);
      const stampedJson = JSON.stringify(stamped);

      isSyncing.current = true;
      localStorage.setItem(DB_KEY, stampedJson); // Update with new rev
      lastSerialized.current = stampedJson;
      localRev.current = stamped._rev as number;

      setSyncPhase("pushing");

      const success = await saveTenantData(session, stamped);
      
      setSyncPhase(success ? "synced" : "error");
      if (success) setLastSyncAt(Date.now());

      isSyncing.current = false;
    };

    const pull = async () => {
      if (isSyncing.current) return;

      setSyncPhase("pulling");
      try {
        const remote = await fetchTenantData(session);
        if (!remote) {
          setSyncPhase("error");
          return;
        }

        const r = remote as Record<string, unknown>;
        const remoteRev = (r._rev as number) ?? 0;

        if (remoteRev > localRev.current) {
          const json = JSON.stringify(r);
          localStorage.setItem(DB_KEY, json);
          lastSerialized.current = json;
          localRev.current = remoteRev;

          dispatchRehydrate(json);
        }

        setSyncPhase("synced");
        setLastSyncAt(Date.now());
      } catch {
        setSyncPhase("error");
      }
    };

    // Debounced push on local changes
    const schedulePush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(pushIfChanged, SAVE_DEBOUNCE_MS);
    };

    // Patch setItem to detect changes (only for our DB key)
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (key: string, value: string) => {
      originalSetItem(key, value);
      if (key === DB_KEY && !isSyncing.current) {
        schedulePush();
      }
    };

    // Periodic pull + focus/online triggers
    pullTimer.current = setInterval(pull, PULL_INTERVAL_MS);
    const handleFocus = () => pull();
    const handleOnline = () => pull();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    // Final push on unload
    const handleBeforeUnload = () => {
      const current = localStorage.getItem(DB_KEY);
      if (current && current !== lastSerialized.current) {
        try {
          const data = JSON.parse(current);
          saveTenantData(session, data);
        } catch {}
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pullTimer.current) clearInterval(pullTimer.current);
      
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      localStorage.setItem = originalSetItem;
      
      // Final flush
      pushIfChanged();
    };
  }, [phase, session, dispatchRehydrate]);

  const signOut = async () => {
    // Mark signed-out FIRST so the unmount cleanup's pushIfChanged is a no-op
    // (otherwise it would push an empty {} to remote and wipe the tenant's data).
    signedOut.current = true;
    if (session) {
      // Fire-and-forget so a slow audit log can't delay sign-out.
      logAuthEvent({
        authType: "tenant",
        eventType: "logout",
        tenantId: session.tenantId,
        sessionToken: session.sessionToken,
      }).catch(() => {});
    }
    clearTenantSession();
    navigate("/", { replace: true });
    localStorage.removeItem(DB_KEY);
  };

  // Loading / Error / Expired States
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
          <p className="text-sm text-muted-foreground">Could not load school data. Check your internet.</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => window.location.reload()}>Retry</Button>
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
          <h2 className="text-xl font-bold">
            Subscription {session?.status === "suspended" ? "suspended" : "expired"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Please contact your provider to renew access for <strong>{session?.schoolName}</strong>.
          </p>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-1" /> Sign out
          </Button>
        </Card>
      </div>
    );
  }

  const d = session ? daysRemaining(session) : null;
  const showBanner = session && (session.status === "trial" || (d !== null && d <= 14));

  const syncLabel =
    syncPhase === "pulling" ? "Syncing…" :
    syncPhase === "pushing" ? "Saving…" :
    syncPhase === "error" ? "Offline" :
    lastSyncAt ? `Synced ${Math.max(1, Math.round((Date.now() - lastSyncAt) / 1000))}s ago` : "Synced";

  const SyncIcon = syncPhase === "error" ? CloudOff : syncPhase === "pushing" ? CloudUpload : Cloud;

  return (
    <div className="min-h-screen">
      {showBanner && (
        <div className="bg-accent text-accent-foreground text-xs px-3 py-1.5 text-center flex items-center justify-center gap-3">
          <span>
            {session!.status === "trial" ? "🎁 Free trial" : "⏰ Subscription"} — {d ?? "?"} days remaining
            {session!.status === "trial" && " · Contact provider to subscribe"}
          </span>
          <span className="inline-flex items-center gap-1 opacity-80">
            <SyncIcon className={`w-3 h-3 ${syncPhase === "pulling" || syncPhase === "pushing" ? "animate-pulse" : ""}`} />
            {syncLabel}
          </span>
          <button onClick={signOut} className="underline opacity-80 hover:opacity-100">Sign out</button>
        </div>
      )}

      {!showBanner && (
        <div className="fixed bottom-2 right-2 z-50 text-[10px] bg-white/90 backdrop-blur border border-slate-200 rounded-full px-2 py-1 shadow-sm flex items-center gap-2 text-slate-600">
          <SyncIcon className={`w-3 h-3 ${syncPhase === "pulling" || syncPhase === "pushing" ? "animate-pulse text-blue-500" : syncPhase === "error" ? "text-red-500" : "text-emerald-500"}`} />
          {syncLabel}
          <span className="w-px h-3 bg-slate-200" />
          <button onClick={signOut} className="text-slate-400 hover:text-red-500 transition-colors" title="Sign out of school portal">
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      )}

      <App tenantSchoolName={session?.schoolName} tenantId={session?.tenantId} onTenantSignOut={signOut} />
    </div>
  );
}
