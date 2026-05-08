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
import { LogOut, CloudOff, Loader2, Cloud, CloudUpload } from "lucide-react";

// MUST match the key the monolithic app uses (greatmind_school_db_v2).
const DB_KEY = "greatmind_school_db_v2";
const SAVE_DEBOUNCE_MS = 1200;
const PULL_INTERVAL_MS = 8000;

type SyncPhase = "idle" | "pulling" | "pushing" | "synced" | "error";

/** Increment a monotonic revision used to resolve concurrent edits. */
function bumpRev(obj: Record<string, unknown>): Record<string, unknown> {
  const cur = typeof obj?._rev === "number" ? (obj._rev as number) : 0;
  return { ...obj, _rev: cur + 1, _updatedAt: new Date().toISOString() };
}

export default function TenantApp() {
  const navigate = useNavigate();
  const [session, setSession] = useState<TenantSession | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "expired" | "error">("loading");
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pullTimer = useRef<ReturnType<typeof setInterval>>();
  const lastSerialized = useRef<string>(""); // last JSON we either pushed or accepted from pull
  const localRev = useRef<number>(0);
  const isPushing = useRef<boolean>(false);

  // 1. Initial load: pull tenant data and seed localStorage
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

      // Merge: prefer remote if it has _rev, otherwise keep local (could be from previous offline session)
      let seed = remote as Record<string, unknown>;
      try {
        const localRaw = localStorage.getItem(DB_KEY);
        if (localRaw) {
          const local = JSON.parse(localRaw) as Record<string, unknown>;
          const lr = typeof local._rev === "number" ? (local._rev as number) : 0;
          const rr = typeof seed._rev === "number" ? (seed._rev as number) : 0;
          if (lr > rr) seed = local;
        }
      } catch { /* ignore */ }

      const json = JSON.stringify(seed);
      localStorage.setItem(DB_KEY, json);
      lastSerialized.current = json;
      localRev.current = typeof seed._rev === "number" ? (seed._rev as number) : 0;

      // Notify in-app listeners (storage event doesn't fire in same tab)
      window.dispatchEvent(new StorageEvent("storage", { key: DB_KEY, newValue: json }));

      setSession(s);
      setPhase("ready");
      setSyncPhase("synced");
      setLastSyncAt(Date.now());
    })();
  }, [navigate]);

  // 2. Bidirectional sync (push on local change + periodic pull)
  useEffect(() => {
    if (phase !== "ready" || !session) return;

    const pushIfChanged = async () => {
      const current = localStorage.getItem(DB_KEY) ?? "{}";
      if (current === lastSerialized.current) return;
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(current); } catch { return; }

      const stamped = bumpRev(parsed);
      localRev.current = stamped._rev as number;

      const stampedJson = JSON.stringify(stamped);
      // write back so the rev is persisted (without re-triggering push)
      isPushing.current = true;
      localStorage.setItem(DB_KEY, stampedJson);
      lastSerialized.current = stampedJson;
      isPushing.current = false;

      setSyncPhase("pushing");
      const ok = await saveTenantData(session, stamped);
      setSyncPhase(ok ? "synced" : "error");
      if (ok) setLastSyncAt(Date.now());
    };

    const pull = async () => {
      if (isPushing.current) return;
      setSyncPhase("pulling");
      const remote = await fetchTenantData(session);
      if (remote === null) { setSyncPhase("error"); return; }
      const r = remote as Record<string, unknown>;
      const remoteRev = typeof r._rev === "number" ? (r._rev as number) : 0;
      if (remoteRev > localRev.current) {
        const json = JSON.stringify(r);
        lastSerialized.current = json;
        localRev.current = remoteRev;
        localStorage.setItem(DB_KEY, json);
        // Tell the in-app reducer to rehydrate
        window.dispatchEvent(new StorageEvent("storage", { key: DB_KEY, newValue: json }));
      }
      setSyncPhase("synced");
      setLastSyncAt(Date.now());
    };

    const schedulePush = () => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(pushIfChanged, SAVE_DEBOUNCE_MS);
    };

    // Patch setItem to detect any write to DB_KEY
    const origSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k: string, v: string) => {
      origSet(k, v);
      if (k === DB_KEY && !isPushing.current) schedulePush();
    };

    // Pull loop (8s) + on focus / on online
    pullTimer.current = setInterval(pull, PULL_INTERVAL_MS);
    const onFocus = () => pull();
    const onOnline = () => pull();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    // Push pending on unload
    const onUnload = () => {
      const current = localStorage.getItem(DB_KEY) ?? "{}";
      if (current !== lastSerialized.current) {
        try { saveTenantData(session, JSON.parse(current)); } catch { /* */ }
      }
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      clearTimeout(saveTimer.current);
      clearInterval(pullTimer.current);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
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
  const syncLabel =
    syncPhase === "pulling" ? "Syncing…" :
    syncPhase === "pushing" ? "Saving…" :
    syncPhase === "error"   ? "Offline" :
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
        <div className="fixed bottom-2 right-2 z-50 text-[10px] bg-white/90 backdrop-blur border border-slate-200 rounded-full px-2 py-1 shadow-sm flex items-center gap-1 text-slate-600">
          <SyncIcon className={`w-3 h-3 ${syncPhase === "pulling" || syncPhase === "pushing" ? "animate-pulse text-blue-500" : syncPhase === "error" ? "text-red-500" : "text-emerald-500"}`} />
          {syncLabel}
        </div>
      )}
      <App />
    </div>
  );
}
