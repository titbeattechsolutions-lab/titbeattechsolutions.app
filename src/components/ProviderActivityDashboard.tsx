import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, LogIn, Loader2, Activity, Users, ShieldCheck, RefreshCw } from "lucide-react";

interface ActivityRecord {
  id: string;
  event_type?: string;
  auth_type?: string;
  user_id?: string;
  tenant_id?: string;
  staff_id?: string;
  ip_address?: string | null;
  action?: string;
  details?: string | null;
  timestamp: string;
  created_at?: string;
}

export default function ProviderActivityDashboard() {
  const [accessLogs, setAccessLogs] = useState<ActivityRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  const loadActivity = async () => {
    setLoading(true);
    setError(null);

    try {
      const [{ data: logins, error: loginErr }, { data: activities, error: activityErr }] = await Promise.all([
        supabase
          .from("login_logs")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(100),
        supabase
          .from("tenant_activity_logs")
          .select("*")
          .order("timestamp", { ascending: false })
          .limit(150),
      ]);

      if (loginErr) throw loginErr;
      if (activityErr) throw activityErr;

      setAccessLogs((logins ?? []) as ActivityRecord[]);
      setActivityLogs((activities ?? []) as ActivityRecord[]);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load provider activity");
      setAccessLogs([]);
      setActivityLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();
    let interval: number | undefined;

    if (autoRefreshEnabled) {
      interval = window.setInterval(loadActivity, 15000);
    }

    return () => {
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [autoRefreshEnabled]);

  const recentEvents = useMemo(() => {
    const combined = [
      ...accessLogs.map((log) => ({ ...log, type: "access" as const })),
      ...activityLogs.map((log) => ({ ...log, type: "action" as const })),
    ];

    return combined
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [accessLogs, activityLogs]);

  const formatTime = (isoString: string) => new Date(isoString).toLocaleString();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
        <p>Loading provider activity feed...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Live Provider Activity</p>
          <p className="text-xs text-muted-foreground">Shows global tenant login and staff action events across all tenants.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="sm" variant="outline" onClick={loadActivity}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh now
          </Button>
          <Button
            size="sm"
            variant={autoRefreshEnabled ? "secondary" : "outline"}
            onClick={() => setAutoRefreshEnabled((prev) => !prev)}
          >
            {autoRefreshEnabled ? "Auto refresh ON" : "Auto refresh OFF"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Updated {lastUpdated ?? "—"}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-600">
            {autoRefreshEnabled ? "Refreshing every 15s" : "Manual refresh only"}
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Last 5 events summary
        </div>
      </div>

      <Card className="border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600">Actor</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600">Details</th>
                <th className="px-4 py-3 text-left font-bold text-slate-600">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentEvents.map((event) => (
                <tr key={`${event.type}-${event.id}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">
                    <span className="inline-flex items-center gap-2">
                      {event.type === "access" ? <LogIn className="w-4 h-4 text-emerald-600" /> : <Activity className="w-4 h-4 text-indigo-600" />}
                      <span className="font-medium">{event.type === "access" ? (event.event_type ?? "login") : (event.action ?? "action")}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {event.tenant_id || event.user_id || event.staff_id || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{event.details || event.auth_type || "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-400">{formatTime(event.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {error ? (
        <Card className="p-4 bg-destructive/10 border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Recent actions</p>
              <p className="text-2xl font-bold text-slate-900">{activityLogs.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Access events</p>
              <p className="text-2xl font-bold text-slate-900">{accessLogs.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Unique actors</p>
              <p className="text-2xl font-bold text-slate-900">
                {new Set(activityLogs.map((log) => log.staff_id || log.user_id || log.tenant_id)).size}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="access" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="access">Access Logs</TabsTrigger>
          <TabsTrigger value="actions">Tenant Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="mt-4">
          <Card className="overflow-hidden border-slate-200">
            {accessLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No access events found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Event</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Tenant / User</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Type</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accessLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-slate-700">
                            {log.event_type === "login" ? <LogIn className="w-4 h-4 text-emerald-600" /> : <LogOut className="w-4 h-4 text-amber-600" />}
                            <span>{log.event_type ?? "event"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {log.tenant_id || log.user_id || log.staff_id || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {log.auth_type || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-400">{formatTime(log.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="mt-4">
          <Card className="overflow-hidden border-slate-200">
            {activityLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No tenant activity events found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Action</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Actor</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Details</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">{log.action || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{log.staff_id || log.tenant_id || log.user_id || "—"}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{log.details || "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-400">{formatTime(log.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
