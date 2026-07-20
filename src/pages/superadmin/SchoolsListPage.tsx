import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Loader2, Search, ChevronRight, ShieldOff, ShieldCheck, AlertTriangle, Ban } from "lucide-react";
import { Card } from "@/components/ui/card";

interface SchoolRow {
  id: string;
  name: string;
  code: string;
  email: string | null;
  current_students: number;
  max_students: number;
  status: string;
  features: Record<string, boolean>;
  academic_year: string;
  current_term: string;
  created_at: string;
  tenant_id: string;
}

const STATUS_STYLE: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700",
  suspended: "bg-red-100 text-red-600",
  trial:     "bg-amber-100 text-amber-700",
};

export default function SchoolsListPage() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [schoolsRes, countsRes] = await Promise.all([
      (supabase as any)
        .from("schools")
        .select("id,tenant_id,name,code,email,max_students,features,academic_year,current_term,created_at,status")
        .order("created_at", { ascending: false }),
      (supabase as any).rpc("get_student_counts_by_school")
    ]);
    setLoading(false);
    if (schoolsRes.error) {
      toast({ title: "Error loading schools", description: schoolsRes.error.message, variant: "destructive" }); return;
    }
    
    const countsData = countsRes.data || [];
    const mapped = (schoolsRes.data ?? []).map((s: any) => {
      const countMatch = countsData.find((c: any) => c.school_id === s.id);
      return { ...s, current_students: countMatch ? countMatch.student_count : 0 };
    });
    
    setSchools(mapped as SchoolRow[]);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (schoolId: string, tenantId: string, status: "active" | "suspended") => {
    setBusy(schoolId);
    // _school_id is the 3rd optional param; RPC resolves it from FK when provided.
    const { error: rpcErr } = await (supabase as any).rpc("set_tenant_status", {
      _tenant_id: tenantId,
      _status: status,
      _school_id: schoolId,
    });

    setBusy(null);
    if (rpcErr) {
      toast({ title: "Update failed", description: rpcErr.message, variant: "destructive" }); return;
    }

    toast({ title: `School ${status === "suspended" ? "suspended" : "reactivated"}` });
    load();
  };

  const displayed = schools.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    total: schools.length,
    active: schools.filter((s) => s.status === "active").length,
    suspended: schools.filter((s) => s.status === "suspended").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Schools</h1>
          <p className="text-sm text-slate-500">{stats.total} total · {stats.active} active · {stats.suspended} suspended</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button size="sm" onClick={() => navigate("/superadmin/provision")}>+ Provision School</Button>
        </div>
      </div>

      <DuplicatesBanner onChanged={load} />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8 h-8 w-56 text-sm"
            placeholder="Search name, code, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : displayed.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">No schools found</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Name", "Code", "Students", "Status", "Features", "Created", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.code}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.current_students} / {s.max_students}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[s.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(s.features ?? {}).filter(([, v]) => v).map(([k]) => (
                        <Badge key={k} variant="secondary" className="text-[10px] px-1.5">{k}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => navigate(`/superadmin/schools/${s.id}`)}
                        title="View detail"
                      >
                        <ChevronRight size={13} />
                      </Button>
                      {s.status !== "suspended" ? (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-red-500 hover:text-red-600"
                          disabled={busy === s.id}
                          onClick={() => setStatus(s.id, s.tenant_id, "suspended")}
                        >
                          {busy === s.id ? <Loader2 size={11} className="animate-spin" /> : <ShieldOff size={11} className="mr-1" />}
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
                          disabled={busy === s.id}
                          onClick={() => setStatus(s.id, s.tenant_id, "active")}
                        >
                          {busy === s.id ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} className="mr-1" />}
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface DuplicateRow {
  match_type: string;
  match_value: string;
  tenant_ids: string[];
  school_names: string[];
  occurrences: number;
}

function DuplicatesBanner({ onChanged }: { onChanged: () => void }) {
  const [dups, setDups] = useState<DuplicateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("find_duplicate_tenants");
    setLoading(false);
    if (error) return;
    setDups((data as unknown as DuplicateRow[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const suspendOne = async (tenantId: string, schoolName: string, _matchType: string) => {
    if (!confirm(`Suspend "${schoolName}" as a duplicate? All active sessions will be revoked.`)) return;
    setBusy(tenantId);

    // Use the same atomic RPC as the main suspend button.
    // _school_id is omitted — the RPC resolves it internally from the tenant FK.
    // This guarantees sessions are purged, schools row is synced, and the action is audited.
    const { error: rpcErr } = await (supabase as any).rpc("set_tenant_status", {
      _tenant_id: tenantId,
      _status: "suspended",
    });

    setBusy(null);
    if (rpcErr) {
      toast({ title: "Suspend failed", description: rpcErr.message, variant: "destructive" });
      return;
    }

    toast({ title: "Tenant suspended", description: schoolName });
    await load();
    onChanged();
  };

  if (loading || dups.length === 0) return null;

  return (
    <Card className="p-3 border-amber-500/40 bg-amber-500/5 mb-5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-sm space-y-2 flex-1">
          <div className="font-semibold text-amber-700 dark:text-amber-300">
            {dups.length} duplicate group{dups.length === 1 ? "" : "s"} detected
          </div>
          {dups.map((d, i) => (
            <div key={i} className="text-xs space-y-1 border-l-2 border-amber-500/40 pl-2">
              <div className="text-muted-foreground">
                <span className="font-mono">{d.match_type}</span> = "{d.match_value}" ({d.occurrences})
              </div>
              <div className="flex flex-wrap gap-1">
                {d.tenant_ids.map((id, idx) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy === id}
                    onClick={() => suspendOne(id, d.school_names[idx], d.match_type)}
                    title="Suspend this tenant"
                  >
                    <Ban className="w-3 h-3 mr-1" />
                    {d.school_names[idx]}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <div className="text-xs text-muted-foreground italic pt-1">
            Click a school name to suspend it. The earliest record is usually the one to keep.
          </div>
        </div>
      </div>
    </Card>
  );
}
