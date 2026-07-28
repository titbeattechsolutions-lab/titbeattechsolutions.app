import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Loader2, ChevronRight } from "lucide-react";

interface BillingRow {
  id: string;
  school_id: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  created_at: string;
  school_name?: string;
}

const STATUS_STYLE: Record<string, string> = {
  trial:      "bg-amber-100 text-amber-700",
  active:     "bg-emerald-100 text-emerald-700",
  past_due:   "bg-red-100 text-red-600",
  cancelled:  "bg-slate-100 text-slate-500",
};

const PLAN_STYLE: Record<string, string> = {
  micro:      "bg-gray-100 text-gray-700",
  starter:    "bg-yellow-100 text-yellow-700",
  growth:     "bg-blue-100 text-blue-700",
  enterprise: "bg-violet-100 text-violet-700",
};

export default function BillingListPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("billing")
      .select("id,school_id,plan,status,trial_ends_at,current_period_end,created_at,schools(name)")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRows((data ?? []).map((r: any) => ({ ...r, school_name: r.schools?.name })));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const displayed = rows.filter((r) => {
    if (filterPlan !== "all" && r.plan !== filterPlan) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-800">Billing</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={filterPlan} onValueChange={setFilterPlan}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Plan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="micro">Micro</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : displayed.length === 0 ? (
          <p className="text-center text-slate-400 py-12 text-sm">No billing records</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["School", "Plan", "Status", "Trial / Period End", "Since", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.school_name ?? r.school_id.slice(0, 8) + "…"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_STYLE[r.plan] ?? "bg-slate-100 text-slate-500"}`}>{r.plan}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-500"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.status === "trial"
                      ? (r.trial_ends_at ? `Trial ends ${new Date(r.trial_ends_at).toLocaleDateString()}` : "—")
                      : (r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : "—")
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/superadmin/schools/${r.school_id}`)}>
                      <ChevronRight size={13} />
                    </Button>
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
