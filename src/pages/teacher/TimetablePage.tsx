import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import {
  getClasses, getMyTeacherProfile,
  getTimetable, TimetableSlot, Class,
} from "@/supabase/schoolService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const PERIOD_COLORS: Record<string, string> = {
  lesson:      "bg-white border border-slate-200",
  short_break: "bg-yellow-50 border border-yellow-200",
  long_break:  "bg-orange-50 border border-orange-200",
  assembly:    "bg-blue-50 border border-blue-200",
  lunch:       "bg-green-50 border border-green-200",
  closing:     "bg-red-50 border border-red-200",
};

const PERIOD_LABELS: Record<string, string> = {
  lesson: "Lesson", short_break: "Short Break", long_break: "Long Break",
  assembly: "Assembly", lunch: "Lunch Break", closing: "Closing",
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

  useEffect(() => {
    if (!schoolId || !user) return;
    setLoading(true);
    Promise.all([
      getClasses(schoolId),
      getMyTeacherProfile(schoolId, user.id),
    ])
      .then(([cls, teacher]) => {
        setClasses(cls);
        setTeacherId(teacher?.id ?? null);
        if (cls.length) setSelectedClassId(cls[0].id);
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [schoolId, user]); // eslint-disable-line

  useEffect(() => {
    if (school) { setSelectedTerm(school.current_term); setSelectedYear(school.academic_year); }
  }, [school]);

  const loadSlots = useCallback(async () => {
    if (!schoolId || !selectedClassId || !selectedTerm || !selectedYear) return;
    setLoadingSlots(true);
    getTimetable(schoolId, selectedClassId, selectedTerm, selectedYear)
      .then(setSlots)
      .catch((e) => toast({ title: "Error loading timetable", description: e.message, variant: "destructive" }))
      .finally(() => setLoadingSlots(false));
  }, [schoolId, selectedClassId, selectedTerm, selectedYear]); // eslint-disable-line

  useEffect(() => { loadSlots(); }, [loadSlots]);

  const slotMap: Record<string, TimetableSlot> = {};
  slots.forEach((s) => { slotMap[`${s.day}|${s.period_number}`] = s; });

  const periodNumbers = [...new Set(slots.map((s) => s.period_number))].sort((a, b) => a - b);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Timetable</h1>
        <p className="text-sm text-slate-500 mt-0.5">Read-only view of your class schedule</p>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 uppercase">Class</label>
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select class…" /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 uppercase">Term</label>
          <Select value={selectedTerm} onValueChange={(v) => setSelectedTerm(v as typeof selectedTerm)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="first">1st Term</SelectItem>
              <SelectItem value="second">2nd Term</SelectItem>
              <SelectItem value="third">3rd Term</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 uppercase">Year</label>
          <Input className="h-9" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} />
        </div>
      </div>

      {loadingSlots ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : periodNumbers.length === 0 ? (
        <p className="text-center text-slate-400 py-10 text-sm">No timetable set for this class/term/year yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1 min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left text-slate-400 font-semibold uppercase px-2 py-1.5 w-24">Period</th>
                {DAYS.map((d) => (
                  <th key={d} className="text-slate-600 font-semibold uppercase text-center py-1.5 capitalize">{d.slice(0, 3)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodNumbers.map((pn) => {
                const refSlot = DAYS.map((d) => slotMap[`${d}|${pn}`]).find(Boolean);
                const pType = refSlot?.period_type ?? "lesson";
                const isNonLesson = pType !== "lesson";
                return (
                  <tr key={pn}>
                    <td className="px-2 py-1 align-middle">
                      <p className="font-semibold text-slate-700">P{pn}</p>
                      {refSlot && (
                        <p className="text-slate-400 text-[10px]">
                          {refSlot.start_time?.slice(0, 5)} – {refSlot.end_time?.slice(0, 5)}
                        </p>
                      )}
                    </td>
                    {isNonLesson ? (
                      <td colSpan={5}>
                        <div className={cn("rounded-lg py-2.5 text-center text-xs font-semibold tracking-wide uppercase", PERIOD_COLORS[pType])}>
                          {PERIOD_LABELS[pType]}
                        </div>
                      </td>
                    ) : (
                      DAYS.map((day) => {
                        const slot = slotMap[`${day}|${pn}`];
                        const isMySlot = slot?.teacher_id && slot.teacher_id === teacherId;
                        return (
                          <td key={day} className="align-top">
                            <div className={cn(
                              "min-h-[52px] p-2 rounded-lg text-left",
                              slot
                                ? isMySlot
                                  ? "bg-indigo-50 border border-indigo-200"
                                  : "bg-white border border-slate-200"
                                : "bg-slate-50 border border-dashed border-slate-100"
                            )}>
                              {slot ? (
                                <>
                                  <p className="font-semibold text-slate-800 text-[11px] line-clamp-1">{slot.subject_name ?? "—"}</p>
                                  {slot.teacher_name && (
                                    <p className={cn("text-[10px] mt-0.5 truncate", isMySlot ? "text-indigo-600 font-medium" : "text-slate-500")}>
                                      {slot.teacher_name}
                                    </p>
                                  )}
                                  {slot.room && <p className="text-slate-400 text-[10px]">Room {slot.room}</p>}
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
      )}
    </div>
  );
}
