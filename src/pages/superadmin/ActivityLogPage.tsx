import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Loader2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LoginActivityDashboard from "@/components/LoginActivityDashboard";

interface ActivityLog {
  id: number;
  school_id: string | null;
  action: string;
  performed_by: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  school_name?: string | null;
  schools?: { name: string } | null;
}

interface StaffSessionLog {
  id: string;
  school_id: string;
  user_id: string;
  user_name: string;
  role: string;
  action: string;
  created_at: string;
  schools?: { name: string };
}

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  provision:       "bg-violet-100 text-violet-700",
  suspend:         "bg-red-100 text-red-600",
  reactivate:      "bg-emerald-100 text-emerald-700",
  plan_change:     "bg-blue-100 text-blue-700",
  student_add:     "bg-sky-100 text-sky-700",
  student_import:  "bg-sky-100 text-sky-700",
  teacher_add:     "bg-indigo-100 text-indigo-700",
  attendance_save: "bg-amber-100 text-amber-700",
  result_save:     "bg-orange-100 text-orange-700",
  fee_create:      "bg-teal-100 text-teal-700",
  payment_success: "bg-emerald-100 text-emerald-700",
};

export default function ActivityLogPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"system" | "staff" | "my_activity">("system");
  
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [staffLogs, setStaffLogs] = useState<StaffSessionLog[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterSchoolId, setFilterSchoolId] = useState("all");
  const [schools, setSchools] = useState<{ id: string; name: string; tenant_id: string }[]>([]);

  // Load distinct schools for filter dropdown
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("schools")
      .select("id,name,tenant_id")
      .order("name")
      .then(({ data }: { data: { id: string; name: string; tenant_id: string }[] | null }) => {
        setSchools(data ?? []);
      });
  }, []);

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    if (activeTab === "system") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("activity_logs")
        .select("*, schools(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filterAction !== "all") query = query.eq("action", filterAction);
      if (filterSchoolId !== "all") {
        // Reverse-map tenant_id back to school_id for activity_logs
        const sId = schools.find(s => s.tenant_id === filterSchoolId)?.id || filterSchoolId;
        query = query.eq("school_id", sId);
      }

      const { data, error, count } = await query;
      setLoading(false);

      if (error) {
        console.error("Failed to fetch system logs:", error);
        toast({ title: "Error", description: error.message, variant: "destructive" }); return;
      }

      setLogs((data ?? []) as ActivityLog[]);
      setTotal(count ?? 0);
      setHasMore((count ?? 0) > to + 1);
    } else if (activeTab === "my_activity") {
      if (!user) return;
      // Fetch operations where performed_by in details matches current superadmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase as any)
        .from("activity_logs")
        .select("*, schools(name)", { count: "exact" })
        .eq("performed_by", user.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, error, count } = await query;
      setLoading(false);

      if (error) {
        console.error("Failed to fetch my activity logs:", error);
        toast({ title: "Error", description: error.message, variant: "destructive" }); return;
      }

      setLogs((data ?? []) as ActivityLog[]);
      setTotal(count ?? 0);
      setHasMore((count ?? 0) > to + 1);
    } else {
      let query = supabase
        .from("session_logs")
        .select("*, schools(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filterAction !== "all") query = query.eq("action", filterAction);
      if (filterSchoolId !== "all") {
        const sId = schools.find(s => s.tenant_id === filterSchoolId)?.id || filterSchoolId;
        query = query.eq("school_id", sId);
      }

      const { data, error, count } = await query;
      setLoading(false);

      if (error) {
        console.error("Failed to fetch staff session logs:", error);
        toast({ title: "Error", description: error.message, variant: "destructive" }); return;
      }

      setStaffLogs((data ?? []) as any[]);
      setTotal(count ?? 0);
      setHasMore((count ?? 0) > to + 1);
    }
    setPage(p);
  }, [activeTab, filterAction, filterSchoolId, toast, user]);

  useEffect(() => { load(0); }, [load, activeTab]);

  const displayedSystem = search
    ? logs.filter((l) =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(l.details ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;
    
  const displayedStaff = search
    ? staffLogs.filter((l) =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.user_name.toLowerCase().includes(search.toLowerCase()) ||
        l.role.toLowerCase().includes(search.toLowerCase())
      )
    : staffLogs;

  const distinctActions = (activeTab === "system" || activeTab === "my_activity")
    ? Array.from(new Set(logs.map((l) => l.action))).sort()
    : Array.from(new Set(staffLogs.map((l) => l.action))).sort();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Activity Log</h1>
          <p className="text-sm text-slate-500">
            Page {page + 1} · {total.toLocaleString()} total entries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "system" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              onClick={() => { setActiveTab("system"); setPage(0); }}
            >
              System Events
            </button>
            <button 
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "staff" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              onClick={() => { setActiveTab("staff"); setPage(0); }}
            >
              Staff Sessions
            </button>
            <button 
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "my_activity" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
              onClick={() => { setActiveTab("my_activity"); setPage(0); }}
            >
              My Activity
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8 h-8 w-52 text-sm"
            placeholder="Search action or details…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(0); }}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="All Actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {distinctActions.map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSchoolId} onValueChange={(v) => { setFilterSchoolId(v); setPage(0); }}>
          <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="All Schools" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((s) => (
              <SelectItem key={s.tenant_id} value={s.tenant_id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {activeTab === "my_activity" && user && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-800 mb-2">My Login History</h2>
          <LoginActivityDashboard
            authType="super_admin"
            identifier={user.id}
            limit={20}
            showIpAddress={true}
          />
        </div>
      )}

      {activeTab === "my_activity" && (
        <h2 className="text-lg font-bold text-slate-800 mb-2 mt-4">My System Operations</h2>
      )}

      {/* Log table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : ((activeTab === "system" || activeTab === "my_activity") ? displayedSystem.length === 0 : displayedStaff.length === 0) ? (
          <p className="text-center text-slate-400 py-12 text-sm">No activity logs found</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {(activeTab === "system" || activeTab === "my_activity") ? (
                  ["Time", "Action", "School", "Performed By", "IP Address", "Details"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))
                ) : (
                  ["Time", "Action", "School", "Staff", "Role"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(activeTab === "system" || activeTab === "my_activity") ? (
                displayedSystem.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] ?? "bg-slate-100 text-slate-600"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {log.schools?.name ?? log.school_name ?? (log.school_id ? <span className="font-mono">{log.school_id.slice(0, 8)}…</span> : <span className="text-slate-300">platform</span>)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {log.details?.actor ? (log.details.actor as string) : (
                        log.details?.performed_by ? (log.details.performed_by as string).slice(0, 8) + "…" : (
                          log.performed_by ? log.performed_by.slice(0, 8) + "…" : "—"
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                      {log.details?.ip_address ? (log.details.ip_address as string) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">
                      {log.details ? (
                        <details className="cursor-pointer">
                          <summary className="text-slate-400 hover:text-slate-600">View</summary>
                          <pre className="mt-1 text-xs bg-slate-50 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      ) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                displayedStaff.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${log.action === "login" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {log.schools?.name ?? (log.school_id ? <span className="font-mono">{log.school_id.slice(0, 8)}…</span> : "—")}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-800 font-bold">
                      {log.user_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {log.role}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Showing rows {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            disabled={page === 0 || loading}
            onClick={() => load(page - 1)}
          >
            <ChevronLeft size={14} className="mr-1" /> Previous
          </Button>
          <Button
            variant="outline" size="sm"
            disabled={!hasMore || loading}
            onClick={() => load(page + 1)}
          >
            Next <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
