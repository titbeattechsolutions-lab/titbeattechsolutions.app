import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import {
  getClasses, getSubjects, getTeachers,
  getTimetable, saveTimetableSlot, bulkSaveTimetable, deleteTimetableSlot,
  Class, Subject, Teacher, TimetableSlot,
} from "@/supabase/schoolService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Printer, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
type Day = typeof DAYS[number];

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

const DEFAULT_PERIODS: Omit<TimetableSlot, "id"|"school_id"|"class_id"|"class_name"|"academic_year"|"term"|"subject_id"|"subject_name"|"teacher_id"|"teacher_name"|"room"|"notes"|"created_at"|"updated_at">[] = [
  { day: "monday", period_number: 1,  period_type: "assembly",    start_time: "08:00", end_time: "08:30" },
  { day: "monday", period_number: 2,  period_type: "lesson",      start_time: "08:30", end_time: "09:10" },
  { day: "monday", period_number: 3,  period_type: "lesson",      start_time: "09:10", end_time: "09:50" },
  { day: "monday", period_number: 4,  period_type: "lesson",      start_time: "09:50", end_time: "10:30" },
  { day: "monday", period_number: 5,  period_type: "short_break", start_time: "10:30", end_time: "10:45" },
  { day: "monday", period_number: 6,  period_type: "lesson",      start_time: "10:45", end_time: "11:25" },
  { day: "monday", period_number: 7,  period_type: "lesson",      start_time: "11:25", end_time: "12:05" },
  { day: "monday", period_number: 8,  period_type: "lesson",      start_time: "12:05", end_time: "12:45" },
  { day: "monday", period_number: 9,  period_type: "lunch",       start_time: "12:45", end_time: "13:30" },
  { day: "monday", period_number: 10, period_type: "lesson",      start_time: "13:30", end_time: "14:10" },
  { day: "monday", period_number: 11, period_type: "lesson",      start_time: "14:10", end_time: "14:50" },
  { day: "monday", period_number: 12, period_type: "closing",     start_time: "14:50", end_time: "15:00" },
];

interface SlotDraft {
  period_type: string;
  subject_id: string;
  teacher_id: string;
  room: string;
  start_time: string;
  end_time: string;
  notes: string;
}

export default function TimetablePage() {
  const { schoolId } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<"first"|"second"|"third">("first");
  const [selectedYear, setSelectedYear] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ day: Day; period_number: number; existing?: TimetableSlot } | null>(null);
  const [draft, setDraft] = useState<SlotDraft>({ period_type: "lesson", subject_id: "", teacher_id: "", room: "", start_time: "", end_time: "", notes: "" });

  // Load classes, subjects, teachers
  useEffect(() => {
    if (!schoolId) return;
    setLoadingInit(true);
    Promise.all([getClasses(schoolId), getSubjects(schoolId), getTeachers(schoolId)])
      .then(([cls, subs, tchs]) => {
        setClasses(cls);
        setSubjects(subs);
        setTeachers(tchs);
        if (cls.length) setSelectedClassId(cls[0].id);
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoadingInit(false));
  }, [schoolId]); // eslint-disable-line

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

  // Build a lookup: day+periodNum → slot
  const slotMap: Record<string, TimetableSlot> = {};
  slots.forEach((s) => { slotMap[`${s.day}|${s.period_number}`] = s; });

  // Derive unique period numbers from slots or defaults (for the current day)
  const periodNumbers = [...new Set(
    (slots.length > 0 ? slots : DEFAULT_PERIODS.map((p) => ({ ...p, day: "monday" as Day })))
      .map((s) => s.period_number)
  )].sort((a, b) => a - b);

  const openDrawer = (day: Day, period_number: number) => {
    const existing = slotMap[`${day}|${period_number}`];
    setEditTarget({ day, period_number, existing });
    setDraft({
      period_type:  existing?.period_type ?? "lesson",
      subject_id:   existing?.subject_id ?? "",
      teacher_id:   existing?.teacher_id ?? "",
      room:         existing?.room ?? "",
      start_time:   existing?.start_time ?? "",
      end_time:     existing?.end_time ?? "",
      notes:        existing?.notes ?? "",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!schoolId || !editTarget || !selectedClassId) return;
    setSaving(true);
    const cls = classes.find((c) => c.id === selectedClassId);
    const sub = subjects.find((s) => s.id === draft.subject_id);
    const tch = teachers.find((t) => t.id === draft.teacher_id);
    try {
      const saved = await saveTimetableSlot(schoolId, {
        ...(editTarget.existing?.id ? { id: editTarget.existing.id } : {}),
        class_id: selectedClassId,
        class_name: cls?.name ?? "",
        academic_year: selectedYear,
        term: selectedTerm,
        day: editTarget.day,
        period_number: editTarget.period_number,
        period_type: draft.period_type as TimetableSlot["period_type"],
        start_time: draft.start_time || "00:00",
        end_time: draft.end_time || "00:00",
        subject_id: draft.subject_id || null,
        subject_name: sub?.name ?? null,
        teacher_id: draft.teacher_id || null,
        teacher_name: tch ? `${tch.first_name} ${tch.last_name}` : null,
        room: draft.room || null,
        notes: draft.notes || null,
      });
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.day === saved.day && s.period_number === saved.period_number);
        return idx >= 0 ? prev.map((s, i) => i === idx ? saved : s) : [...prev, saved];
      });
      toast({ title: "Slot saved" });
      setDrawerOpen(false);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slotId: string) => {
    if (!schoolId) return;
    try {
      await deleteTimetableSlot(schoolId, slotId);
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      toast({ title: "Slot deleted" });
      setDrawerOpen(false);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleLoadTemplate = async () => {
    if (!schoolId || !selectedClassId) return;
    const cls = classes.find((c) => c.id === selectedClassId);
    setSaving(true);
    try {
      const templateSlots = DAYS.flatMap((day) =>
        DEFAULT_PERIODS.map((p) => ({
          class_id: selectedClassId,
          class_name: cls?.name ?? "",
          academic_year: selectedYear,
          term: selectedTerm,
          day,
          period_number: p.period_number,
          period_type: p.period_type as TimetableSlot["period_type"],
          start_time: p.start_time,
          end_time: p.end_time,
          subject_id: null, subject_name: null,
          teacher_id: null, teacher_name: null,
          room: null, notes: null,
        }))
      );
      const saved = await bulkSaveTimetable(schoolId, templateSlots);
      setSlots(saved);
      toast({ title: "Default template loaded", description: `${saved.length} periods created` });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loadingInit) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <>
      {/* Print styles */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-xl font-bold text-slate-800">Timetable</h1>
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" onClick={loadSlots} disabled={loadingSlots}>
              <RefreshCw size={14} className={cn("mr-1", loadingSlots && "animate-spin")} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer size={14} className="mr-1" /> Print
            </Button>
            {slots.length === 0 && (
              <Button size="sm" onClick={handleLoadTemplate} disabled={saving || !selectedClassId}>
                {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
                Load Default Template
              </Button>
            )}
          </div>
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 no-print">
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
            <Input className="h-9" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} placeholder="e.g. 2025/2026" />
          </div>
        </div>

        {/* Grid */}
        {loadingSlots ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : !selectedClassId ? (
          <p className="text-center text-slate-400 py-10 text-sm">Select a class to view its timetable.</p>
        ) : periodNumbers.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-slate-400 text-sm mb-3">No timetable yet for this class/term/year.</p>
            <Button size="sm" onClick={handleLoadTemplate} disabled={saving}>
              {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
              Load Default Template
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-1 min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-left text-slate-400 font-semibold uppercase px-2 py-1.5 w-28">Period</th>
                  {DAYS.map((d) => (
                    <th key={d} className="text-slate-600 font-semibold uppercase text-center py-1.5 capitalize">{d.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodNumbers.map((pn) => {
                  // Use the first slot found for this period to get type/times (same across days)
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
                          return (
                            <td key={day} className="align-top">
                              <button
                                onClick={() => openDrawer(day, pn)}
                                className={cn(
                                  "w-full min-h-[52px] p-2 rounded-lg text-left transition-all hover:ring-2 hover:ring-blue-300",
                                  slot ? "bg-white border border-slate-200 shadow-sm" : "bg-slate-50 border border-dashed border-slate-200 no-print"
                                )}
                              >
                                {slot ? (
                                  <>
                                    <p className="font-semibold text-slate-800 leading-tight text-[11px] line-clamp-1">{slot.subject_name ?? "—"}</p>
                                    {slot.teacher_name && <p className="text-slate-500 text-[10px] mt-0.5 truncate">{slot.teacher_name}</p>}
                                    {slot.room && <p className="text-slate-400 text-[10px]">Room {slot.room}</p>}
                                  </>
                                ) : (
                                  <p className="text-[10px] text-slate-400 italic no-print">+ Add</p>
                                )}
                              </button>
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

      {/* Edit Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editTarget ? `${editTarget.day.charAt(0).toUpperCase() + editTarget.day.slice(1)} · Period ${editTarget.period_number}` : "Edit Slot"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 uppercase">Period Type</label>
              <Select value={draft.period_type} onValueChange={(v) => setDraft((d) => ({ ...d, period_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {draft.period_type === "lesson" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Subject</label>
                  <Select value={draft.subject_id} onValueChange={(v) => setDraft((d) => ({ ...d, subject_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Teacher</label>
                  <Select value={draft.teacher_id} onValueChange={(v) => setDraft((d) => ({ ...d, teacher_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 uppercase">Room</label>
                  <Input value={draft.room} onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))} placeholder="e.g. B12" />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 uppercase">Start Time</label>
                <Input type="time" value={draft.start_time} onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 uppercase">End Time</label>
                <Input type="time" value={draft.end_time} onChange={(e) => setDraft((d) => ({ ...d, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500 uppercase">Notes</label>
              <Input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <SheetFooter className="flex gap-2 flex-col sm:flex-row">
            {editTarget?.existing && (
              <Button variant="destructive" size="sm" onClick={() => handleDelete(editTarget.existing!.id)} disabled={saving} className="sm:mr-auto">
                <Trash2 size={14} className="mr-1" /> Delete
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : null} Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
