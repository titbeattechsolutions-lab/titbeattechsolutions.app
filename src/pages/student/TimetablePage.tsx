import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import {
  getClasses, getTimetable,
  TimetableSlot, Class,
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

const BREAK_BAND_BG: Record<string, string> = {
  assembly:    "#DBEAFE",
  short_break: "#FEF9C3",
  long_break:  "#FFEDD5",
  lunch:       "#DCFCE7",
  closing:     "#FEE2E2",
};
const BREAK_BAND_TEXT: Record<string, string> = {
  assembly:    "#1E40AF",
  short_break: "#854D0E",
  long_break:  "#9A3412",
  lunch:       "#166534",
  closing:     "#991B1B",
};
const BREAK_BAND_BORDER: Record<string, string> = {
  assembly:    "#BFDBFE",
  short_break: "#FDE68A",
  long_break:  "#FED7AA",
  lunch:       "#BBF7D0",
  closing:     "#FECACA",
};
const PERIOD_EMOJIS: Record<string, string> = {
  assembly: "🎒", short_break: "☕️", long_break: "☕️", lunch: "🍽️", closing: "🏠",
};
const PERIOD_LABELS: Record<string, string> = {
  lesson: "Lesson", short_break: "Short Break", long_break: "Long Break",
  assembly: "Assembly", lunch: "Lunch Break", closing: "Closing",
};
const DEFAULT_PERIOD_NUMBERS = [0,1,2,3,4,5,6,7,8,9,10,11,12];
const DEFAULT_META: Record<number, { period_type: string; start_time: string; end_time: string }> = {
  0:  { period_type: "assembly",    start_time: "07:30", end_time: "08:00" },
  1:  { period_type: "lesson",      start_time: "08:00", end_time: "08:40" },
  2:  { period_type: "lesson",      start_time: "08:40", end_time: "09:20" },
  3:  { period_type: "lesson",      start_time: "09:20", end_time: "10:00" },
  4:  { period_type: "short_break", start_time: "10:00", end_time: "10:20" },
  5:  { period_type: "lesson",      start_time: "10:20", end_time: "11:00" },
  6:  { period_type: "lesson",      start_time: "11:00", end_time: "11:40" },
  7:  { period_type: "lesson",      start_time: "11:40", end_time: "12:20" },
  8:  { period_type: "lunch",       start_time: "12:20", end_time: "13:00" },
  9:  { period_type: "lesson",      start_time: "13:00", end_time: "13:40" },
  10: { period_type: "lesson",      start_time: "13:40", end_time: "14:20" },
  11: { period_type: "lesson",      start_time: "14:20", end_time: "15:00" },
  12: { period_type: "closing",     start_time: "15:00", end_time: "15:10" },
};

const TERM_LABELS: Record<string, string> = {
  first: "First Term", second: "Second Term", third: "Third Term",
};

export default function StudentTimetablePage() {
  const { schoolId } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [classes, setClasses] = useState<Class[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<"first" | "second" | "third">("first");
  const [selectedYear, setSelectedYear] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    getClasses(schoolId)
      .then((cls) => {
        setClasses(cls);
        if (cls.length) setSelectedClassId(cls[0].id);
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [schoolId]); // eslint-disable-line

  useEffect(() => {
    if (school) { setSelectedTerm(school.current_term); setSelectedYear(school.academic_year); }
  }, [school]);

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

  const periodNumbers = (() => {
    const fromDb = slots.map((s) => s.period_number);
    return [...new Set([...DEFAULT_PERIOD_NUMBERS, ...fromDb])].sort((a, b) => a - b);
  })();

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  const getPeriodMeta = (pn: number) => {
    const existing = DAYS.map((d) => slotMap[`${d}|${pn}`]).find(Boolean);
    if (existing) return { period_type: existing.period_type, start_time: existing.start_time, end_time: existing.end_time };
    return DEFAULT_META[pn] ?? { period_type: "lesson", start_time: "", end_time: "" };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={26} />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body > * { visibility: hidden; }
          #tt-student-print, #tt-student-print * { visibility: visible; }
          #tt-student-print { position: fixed; inset: 0; padding: 24px; background: white; }
          #tt-student-print table { width: 100%; border-collapse: collapse; font-size: 11px; }
          #tt-student-print th, #tt-student-print td { border: 1px solid #cbd5e1; padding: 5px 7px; }
        }
      `}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Timetable</h1>
            <p className="text-sm text-slate-500 mt-0.5">Read-only class schedule</p>
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
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-slate-400" size={22} />
          </div>
        ) : !selectedClassId ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
            <p className="text-slate-400 text-sm">Select a class to view its timetable.</p>
          </div>
        ) : periodNumbers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
            <p className="text-slate-400 text-sm">No timetable has been set up for this class yet.</p>
          </div>
        ) : (
          <div id="tt-student-print">
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
                          <td
                            colSpan={5}
                            style={{
                              background: BREAK_BAND_BG[meta.period_type] ?? "#f1f5f9",
                              border: `1px solid ${BREAK_BAND_BORDER[meta.period_type] ?? "#e2e8f0"}`,
                              padding: "6px 8px",
                              textAlign: "center",
                              fontWeight: 700,
                              fontSize: "11px",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: BREAK_BAND_TEXT[meta.period_type] ?? "#334155",
                            }}
                          >
                            {PERIOD_EMOJIS[meta.period_type] ?? ""}{" "}{PERIOD_LABELS[meta.period_type]}
                          </td>
                        ) : (
                          DAYS.map((day) => {
                            const slot = slotMap[`${day}|${pn}`];
                            return (
                              <td key={day} className="px-1.5 py-1.5 align-top">
                                <div className={cn(
                                  "min-h-[54px] p-2 rounded-lg",
                                  slot ? "bg-white border border-slate-200" : "bg-slate-50"
                                )}>
                                  {slot ? (
                                    <>
                                      <p className="font-semibold text-slate-800 text-[11px] line-clamp-1 leading-tight">
                                        {slot.subject_name ?? <span className="italic text-slate-400">—</span>}
                                      </p>
                                      {slot.teacher_name && (
                                        <p className="text-slate-500 text-[10px] mt-0.5 truncate">{slot.teacher_name}</p>
                                      )}
                                      {slot.room && (
                                        <p className="text-slate-400 text-[10px]">Rm {slot.room}</p>
                                      )}
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
