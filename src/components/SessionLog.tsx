import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SessionLogEntry {
  id: string;
  school_id: string | null;
  user_id: string;
  user_name: string;
  role: string;
  action: "login" | "logout";
  device: string | null;
  created_at: string;
  schools?: { name: string } | null;
}

const ROLE_BADGE: Record<string, string> = {
  super_admin:  "bg-purple-100 text-purple-700 border-purple-200",
  school_admin: "bg-blue-100 text-blue-700 border-blue-200",
  principal:    "bg-indigo-100 text-indigo-700 border-indigo-200",
  head_teacher: "bg-teal-100 text-teal-700 border-teal-200",
  teacher:      "bg-green-100 text-green-700 border-green-200",
  student:      "bg-yellow-100 text-yellow-700 border-yellow-200",
  parent:       "bg-orange-100 text-orange-700 border-orange-200",
};

const PAGE_SIZE = 25;

interface Props {
  /** If true, includes a "School" column and fetches all schools' logs (superadmin view) */
  superadmin?: boolean;
}

export default function SessionLog({ superadmin = false }: Props) {
  const [rows, setRows] = useState<SessionLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("session_logs")
        .select(superadmin ? "*, schools(name)" : "*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      setRows(data ?? []);
      setTotal(count ?? 0);
    } catch (e) {
      console.error("SessionLog fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [page, superadmin]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(fetchLogs, 60_000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-slate-400" size={20} />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">No session logs found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                {superadmin && (
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">School</th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Device</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.user_name}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      "inline-block px-2 py-0.5 rounded text-xs font-semibold border",
                      ROLE_BADGE[row.role] ?? "bg-slate-100 text-slate-600 border-slate-200"
                    )}>
                      {row.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-semibold",
                        row.action === "login"
                          ? "border-emerald-400 text-emerald-600 bg-emerald-50"
                          : "border-red-400 text-red-600 bg-red-50"
                      )}
                    >
                      {row.action === "login" ? "Login" : "Logout"}
                    </Badge>
                  </td>
                  {superadmin && (
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {(row.schools as any)?.name ?? <span className="italic text-slate-400">superadmin</span>}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-xs text-slate-400 hidden lg:table-cell max-w-[220px] truncate">
                    {row.device ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{total} total entries</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <span>Page {page + 1} / {totalPages}</span>
            <Button
              variant="outline" size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
