import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import App from "@/components/school/School_Management_App";
import {
  loadTenantSession,
  fetchTenantData,
  saveTenantData,
  saveTenantDataV3,
  clearTenantSession,
  daysRemaining,
  checkTenantStatus,
  type TenantSession,
} from "@/lib/tenant-client";
import { logAuthEvent } from "@/lib/auth-logger";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, CloudOff, Loader2, Cloud, CloudUpload } from "lucide-react";

const DB_KEY = "greatmind_school_db_v2";
const SAVE_DEBOUNCE_MS = 1200;
const PULL_INTERVAL_MS = 3000;

type SyncPhase = "idle" | "pulling" | "pushing" | "synced" | "error";



export default function TenantApp() {
  console.log("TENANT_APP RENDER", new Date().toISOString());

  useEffect(() => {
    console.log("TENANT_APP MOUNTED", new Date().toISOString());
    return () => console.log("TENANT_APP UNMOUNTING", new Date().toISOString());
  }, []);

  const navigate = useNavigate();
  
  const [session, setSession] = useState<TenantSession | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);
  const [polledData, setPolledData] = useState<any>(null);

  const saveTimer = useRef<NodeJS.Timeout>();
  const pullTimer = useRef<NodeJS.Timeout>();
  const lastSerialized = useRef<string>("");
  const localRev = useRef<number>(0);
  const isSyncing = useRef<boolean>(false);
  const signedOut = useRef<boolean>(false);
  const latestAppRef = useRef<Record<string, unknown> | null>(null);

  const handleStateChange = useCallback((state: Record<string, unknown>) => {
    latestAppRef.current = state;
  }, []);
  const handleLocalEdit = useCallback((state: Record<string, unknown>) => {
    window.dispatchEvent(new CustomEvent("tenant_local_edit", { detail: state }));
  }, []);

  // Helper to safely dispatch storage event
  const dispatchRehydrate = useCallback((data: string) => {
    // Deprecated: No longer dispatching synthetic storage events.
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
        console.log("FRESH LOAD: remote data received:", remote);
        if (remote === null) {
          console.log("FRESH LOAD: remote was null, entering error phase");
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

        // Hydrate App with initial data
        setTimeout(() => setPolledData(data), 10);
        console.log("FRESH LOAD: setPolledData called with entries count:", (data as any).entries?.length);
      } catch (err) {
        console.error(err);
        setPhase("error");
      }
    })();
  }, [navigate, dispatchRehydrate]);

  // 2. Sync Logic
  useEffect(() => {
    if (phase !== "ready" || !session) return;
    const pushIfChanged = async (retryCount = 0, explicitState?: Record<string, unknown>) => {
      if (isSyncing.current || signedOut.current) return;
      if (retryCount > 3) {
        setSyncPhase("error");
        return;
      }

      const currentState = retryCount === 0 && explicitState 
        ? explicitState 
        : (latestAppRef.current ?? JSON.parse(localStorage.getItem(DB_KEY) ?? "{}"));

      const { _rev: _lastRev, ...lastForCompare } = JSON.parse(lastSerialized.current || "{}");
      const jsonString = JSON.stringify(currentState);
      if (jsonString === JSON.stringify(lastForCompare) && retryCount === 0) return;

      let parsed = currentState;

      isSyncing.current = true;
      setSyncPhase("pushing");

      const { _rev, _updatedAt, _deviceId, ...cleanData } = parsed;
      const expectedRev = localRev.current;

      console.log("PUSH FIRING - entries count:", (cleanData as any).entries?.length, 
        "retryCount:", retryCount, "expectedRev:", expectedRev, 
        "trigger source:", explicitState ? "explicit local edit" : "ref/localStorage fallback");

      const result = await saveTenantDataV3(session, expectedRev, cleanData);

      if (result.success) {
        localRev.current = result.rev as number;
        const json = JSON.stringify({ ...cleanData, _rev: result.rev });
        localStorage.setItem(DB_KEY, json);
        lastSerialized.current = json;
        setSyncPhase("synced");
        setLastSyncAt(Date.now());
        isSyncing.current = false;
      } else if (result.error === "rev_conflict") {
        // Someone else won. Merge their data in, then retry our edit on top.
        localRev.current = result.currentData._rev ?? expectedRev;
        setPolledData(result.currentData);
        isSyncing.current = false;
        setTimeout(() => pushIfChanged(retryCount + 1), 300);
      } else {
        setSyncPhase("error");
        isSyncing.current = false;
      }
    };

    const pull = async () => {
      if (isSyncing.current) return;

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

          setPolledData(r);
          setSyncPhase("synced");
          setLastSyncAt(Date.now());
        } else {
          setSyncPhase((prev) => (prev === "error" ? "synced" : prev));
        }
      } catch {
        setSyncPhase("error");
      }
    };

    // We no longer monkey-patch localStorage.
    // Instead, School_Management_App directly triggers pushIfChanged when a genuine local edit occurs.
    // However, to keep it simple, we wrap it in a debounce so rapid edits don't spam requests.
    const schedulePush = (e: Event) => {
      const state = (e as CustomEvent).detail;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => pushIfChanged(0, state), SAVE_DEBOUNCE_MS);
    };

    // Periodic pull + focus/online triggers
    pullTimer.current = setInterval(pull, PULL_INTERVAL_MS);
    const handleFocus = () => pull();
    const handleOnline = () => pull();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("tenant_local_edit", schedulePush);

    // Final push on unload
    const handleBeforeUnload = () => {
      const current = localStorage.getItem(DB_KEY);
      if (current && current !== lastSerialized.current) {
        try {
          const parsed = JSON.parse(current);
          const { _rev, _updatedAt, _deviceId, ...cleanData } = parsed;
          saveTenantDataV3(session, localRev.current, cleanData);
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
      window.removeEventListener("tenant_local_edit", schedulePush);
      

      
      // Final flush
      pushIfChanged();
    };
  }, [phase, session, dispatchRehydrate]);

  // 3. Real-time suspension detection
  // Polls the database every 60 seconds while the tenant is inside the app.
  // If the provider suspends the account, set_tenant_status purges the session
  // token from tenant_sessions — checkTenantStatus returns null immediately,
  // triggering a forced sign-out with a clear toast notification.
  useEffect(() => {
    if (phase !== "ready" || !session) return;

    const STATUS_POLL_MS = 60_000;

    const pollStatus = async () => {
      const liveStatus = await checkTenantStatus(session);

      if (liveStatus === null || liveStatus === "suspended") {
        // Session was purged or tenant was suspended — force logout immediately.
        clearTenantSession();
        localStorage.removeItem(DB_KEY);
        toast({
          title: liveStatus === "suspended"
            ? "Account suspended"
            : "Session ended",
          description: liveStatus === "suspended"
            ? "Your school's access has been suspended by your provider. Please contact them to restore access."
            : "Your session is no longer valid. Please sign in again.",
          variant: "destructive",
        });
        navigate("/", { replace: true });
        return;
      }

      if (liveStatus === "expired") {
        clearTenantSession();
        localStorage.removeItem(DB_KEY);
        toast({
          title: "Subscription expired",
          description: "Your subscription has ended. Please contact your provider to renew.",
          variant: "destructive",
        });
        navigate("/", { replace: true });
      }
    };

    // Run once immediately on mount (catches suspensions that happened while offline)
    pollStatus();
    const statusTimer = setInterval(pollStatus, STATUS_POLL_MS);
    return () => clearInterval(statusTimer);
  }, [phase, session, navigate]);

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

      <App tenantSchoolName={session?.schoolName} tenantId={session?.tenantId} onTenantSignOut={signOut} polledData={polledData} onStateChange={handleStateChange} onLocalEdit={handleLocalEdit} />
    </div>
  );
}
