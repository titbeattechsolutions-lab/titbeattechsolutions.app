import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  getTodayAttendanceSummary,
  getTodayAttendanceByClass,
  getClasses,
  AttendanceSummaryRow,
  AttendanceByClassRow,
  Class,
} from "@/supabase/schoolService";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

function RateRing({ rate }: { rate: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (rate / 100) * circ;
  const color = rate >= 80 ? "#22c55e" : rate >= 60 ? "#eab308" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="32" cy="32" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-sm font-bold text-slate-800">{rate}%</span>
    </div>
  );
}

export default function AttendanceWidget() {
  const { schoolId } = useAuth();

  const [summary, setSummary] = useState<AttendanceSummaryRow | null>(null);
  const [byClass, setByClass] = useState<AttendanceByClassRow[]>([]);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const refetch = useCallback(async () => {
    if (!schoolId) return;
    try {
      const [s, bc, cls] = await Promise.all([
        getTodayAttendanceSummary(schoolId),
        getTodayAttendanceByClass(schoolId),
        getClasses(schoolId),
      ]);
      setSummary(s);
      setByClass(bc);
      setAllClasses(cls);
    } catch (e) {
      console.error("AttendanceWidget fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Realtime subscription
  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel("attendance-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `school_id=eq.${schoolId}` },
        () => { refetch(); }
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    return () => { supabase.removeChannel(channel); setLive(false); };
  }, [schoolId, refetch]);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Merge: classes with no attendance show "Not yet taken"
  const classRows = allClasses.map((cls) => {
    const record = byClass.find((r) => r.class_id === cls.id);
    return { cls, record };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  const noAttendanceAtAll = !summary || (summary.total_present === 0 && summary.total_absent === 0);

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-slate-800">
          Today's Attendance — <span className="text-slate-500 font-normal">{today}</span>
        </h2>
        {live && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-xs font-semibold text-emerald-600">
            <Wifi size={10} className="animate-pulse" /> Live
          </span>
        )}
      </div>

      {noAttendanceAtAll ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-slate-500 font-medium">No attendance recorded yet today.</p>
            <p className="text-sm text-slate-400 mt-1">
              Teachers can submit attendance from their portal.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 flex flex-col items-center">
                <p className="text-3xl font-bold text-emerald-600">{summary?.total_present ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Total Present</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 flex flex-col items-center">
                <p className="text-3xl font-bold text-red-500">{summary?.total_absent ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Total Absent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 flex flex-col items-center">
                <p className="text-3xl font-bold text-blue-600">{summary?.total_classes_with_attendance ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">Classes Recorded</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 flex flex-col items-center">
                <RateRing rate={Number(summary?.attendance_rate ?? 0)} />
                <p className="text-xs text-slate-500 mt-1">Attendance Rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-class breakdown */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Class</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Present</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-center">Absent</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Taken By</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {classRows.map(({ cls, record }) => (
                  <tr
                    key={cls.id}
                    className={cn(
                      "transition-colors",
                      !record && "bg-red-50/40",
                      record && record.absent_count > record.present_count && "bg-red-50"
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800">{cls.name}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-emerald-600">
                      {record ? record.present_count : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold text-red-500">
                      {record ? record.absent_count : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 hidden sm:table-cell">
                      {record ? record.taken_by_name : (
                        <span className="text-red-400 font-medium">Not yet taken</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 hidden md:table-cell">
                      {record ? new Date(record.taken_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
