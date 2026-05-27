import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import {
  getClasses, getMyTeacherProfile,
  getTimetable, TimetableSlot, Class,
} from "@/supabase/schoolService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday",
};

const BREAK_BAND_STYLES: Record<string, string> = {
  short_break: "bg-yellow-100 border border-yellow-300 text-yellow-800",
  long_break:  "bg-orange-100 border border-orange-300 text-orange-800",
  assembly:    "bg-blue-100 border border-blue-300 text-blue-800",
  lunch:       "bg-green-100 border border-green-300 text-green-800",
  closing:     "bg-red-100 border border-red-300 text-red-800",
};

const PERIOD_LABELS: Record<string, string> = {
  lesson: "Lesson", short_break: "Short Break", long_break: "Long Break",
  assembly: "Assembly", lunch: "Lunch Break", closing: "Closing",
};

const TERM_LABELS: Record<string, string> = {
  first: "First Term", second: "Second Term", third: "Third Term",
};

export default function TeacherTimetablePage() {
  const { schoolId, user } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [classes, setClasses] = useState<Class[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<"first" | "second" | "third">("first");
  const [selectedYear, setSelectedYear] = useState("");
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);

  useEffect(() => {
    if (!schoolId || !user) return;
    setLoading(true);
    Promise.all([getClasses(schoolId), getMyTeacherProfile(schoolId, user.id)])
      .then(([cls, teacher]) => {
        setClasses(cls);
        setTeacherId(teacher?.id ?? null);
        if (cls.length) { setSelectedClassId(cls[0].id); setSelectedClass(cls[0]); }
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [schoolId, user]); // eslint-disable-line

  useEffect(() => {
    if (school) { setSelectedTerm(school.current_term); setSelectedYear(school.academic_year); }
  }, [school]);

  useEffect(() => {
    setSelectedClass(classes.find((c) => c.id === selectedClassId) ?? null);
  }, [selectedClassId, classes]);

  const loadSlots = useCallback(async () => {
    if (!schoolId || !selectedClassId || !selectedTerm || !selectedYear) return;
    setLoadingSlots(true);
    try {
      const data = await getTimetable(schoolId, selectedClassId, selectedTerm, selectedYear);
      setSlots(data);
    } catch (e) {
      toast({ title: "Error loading timetable", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingSlots(false);
    }
  }, [schoolId, selectedClassId, selectedTerm, selectedYear]); // eslint-disable-line

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const slotMap: Record<string, TimetableSlot> = {};
  slots.forEach((s) => { slotMap[`${s.day}|${s.period_number}`] = s; });

  const periodNumbers = [...new Set(slots.map((s) => s.period_number))].sort((a, b) => a - b);

  const getPeriodMeta = (pn: number) => {
    const existing = DAYS.map((d) => slotMap[`${d}|${pn}`]).find(Boolean);
    return {
      period_type: existing?.period_type ?? "lesson",
      start_time:  existing?.start_time ?? "",
      end_time:    existing?.end_time ?? "",
    };
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" size={24} /></div>;
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body > * { visibility: hidden; }
          #tt-teacher-print, #tt-teacher-print * { visibility: visible; }
          #tt-teacher-print { position: fixed; inset: 0; padding: 24px; background: white; }
          #tt-teacher-print table { width: 100%; border-collapse: collapse; font-size: 11px; }
          #tt-teacher-print th, #tt-teacher-print td { border: 1px solid #cbd5e1; padding: 5px 7px; }
        }
      `}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Timetable</h1>
            <p className="text-sm text-slate-500 mt-0.5">Read-only — your slots are highlighted in indigo</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="no-print">
            <Printer size={14} className="mr-1.5" /> Print Timetable
          </Button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase">Class</label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select class…" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase">Term</label>
            <Select value={selectedTerm} onValueChange={(v) => setSelectedTerm(v as typeof selectedTerm)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="first">First Term</SelectItem>
                <SelectItem value="second">Second Term</SelectItem>
                <SelectItem value="third">Third Term</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase">Academic Year</label>
            <Input className="h-9" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} />
          </div>
        </div>

        {/* Grid */}
        {loadingSlots ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={22} /></div>
        ) : periodNumbers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
            <p className="text-slate-400 text-sm">No timetable set for this class/term/year yet.</p>
          </div>
        ) : (
          <div id="tt-teacher-print">
            {/* Print header */}
            <div className="hidden print:block mb-4">
              <p className="text-lg font-bold">{school?.name ?? "School"} — Timetable</p>
              <p className="text-sm text-slate-600">
                Class: <strong>{selectedClass?.name ?? "—"}</strong> &nbsp;|&nbsp;
                {TERM_LABELS[selectedTerm]} &nbsp;|&nbsp; {selectedYear}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs min-w-[640px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 w-24 text-slate-500 font-semibold uppercase text-[11px]">Period</th>
                    {DAYS.map((d) => (
                      <th key={d} className="text-center px-3 py-2.5 text-slate-600 font-semibold uppercase text-[11px]">
                        {DAY_LABELS[d]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodNumbers.map((pn, idx) => {
                    const meta = getPeriodMeta(pn);
                    const isBreak = meta.period_type !== "lesson";
                    return (
                      <tr key={pn} className={cn("border-b border-slate-100", idx % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                        <td className="px-3 py-2 align-middle whitespace-nowrap">
                          <p className="font-bold text-slate-700 text-[11px]">
                            {pn === 0 ? "Asm" : isBreak ? "" : `P${pn}`}
                          </p>
                          <p className="text-slate-400 text-[10px] mt-0.5">
                            {meta.start_time.slice(0, 5)} – {meta.end_time.slice(0, 5)}
                          </p>
                        </td>
                        {isBreak ? (
                          <td colSpan={5} className="px-2 py-1.5">
                            <div className={cn(
                              "w-full rounded-lg py-2.5 text-center text-[11px] font-semibold tracking-widest uppercase",
                              BREAK_BAND_STYLES[meta.period_type] ?? "bg-slate-100 text-slate-600"
                            )}>
                              {PERIOD_LABELS[meta.period_type]}
                            </div>
                          </td>
                        ) : (
                          DAYS.map((day) => {
                            const slot = slotMap[`${day}|${pn}`];
                            const isMySlot = slot?.teacher_id === teacherId && teacherId !== null;
                            return (
                              <td key={day} className="px-1.5 py-1.5 align-top">
                                <div className={cn(
                                  "min-h-[54px] p-2 rounded-lg",
                                  slot
                                    ? isMySlot
                                      ? "bg-indigo-50 border border-indigo-300"
                                      : "bg-white border border-slate-200"
                                    : "bg-slate-50 border border-dashed border-slate-100"
                                )}>
                                  {slot ? (
                                    <>
                                      <p className="font-semibold text-slate-800 text-[11px] line-clamp-1 leading-tight">
                                        {slot.subject_name ?? <span className="italic text-slate-400">No subject</span>}
                                      </p>
                                      {slot.teacher_name && (
                                        <p className={cn("text-[10px] mt-0.5 truncate", isMySlot ? "text-indigo-600 font-semibold" : "text-slate-500")}>
                                          {slot.teacher_name}
                                        </p>
                                      )}
                                      {slot.room && <p className="text-slate-400 text-[10px]">Rm {slot.room}</p>}
                                    </>
                                  ) : (
                                    <p className="text-[10px] text-slate-300">—</p>
                                  )}
                                </div>
                              </td>
                            );
                          })
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
