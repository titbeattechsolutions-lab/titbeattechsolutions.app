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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Printer, RefreshCw, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
type Day = typeof DAYS[number];

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

const PERIOD_LABELS: Record<string, string> = {
  lesson:      "Lesson",
  short_break: "Break",
  long_break:  "Long Break",
  assembly:    "Assembly",
  lunch:       "Lunch Break",
  closing:     "Closing Time – 3:00PM (NAPPS)",
};

const DEFAULT_BREAK_LABEL = "Lesson Break";
const NAPPS_CLOSING_TIME   = "15:00";

const PERIOD_EMOJIS: Record<string, string> = {
  assembly:    "🎒",
  short_break: "☕️",
  long_break:  "☕️",
  lunch:       "🍽️",
  closing:     "🏠",
};

const TERM_LABELS: Record<string, string> = {
  first: "First Term", second: "Second Term", third: "Third Term",
};

interface DefaultPeriod {
  period_number: number;
  period_type: TimetableSlot["period_type"];
  start_time: string;
  end_time: string;
}

const DEFAULT_PERIODS: DefaultPeriod[] = [
  { period_number: 0,  period_type: "assembly",    start_time: "07:30", end_time: "08:00" },
  { period_number: 1,  period_type: "lesson",      start_time: "08:00", end_time: "08:40" },
  { period_number: 2,  period_type: "lesson",      start_time: "08:40", end_time: "09:20" },
  { period_number: 3,  period_type: "lesson",      start_time: "09:20", end_time: "10:00" },
  { period_number: 4,  period_type: "lesson",      start_time: "10:00", end_time: "10:40" },
  { period_number: 5,  period_type: "short_break", start_time: "10:40", end_time: "11:10" },
  { period_number: 6,  period_type: "lesson",      start_time: "11:10", end_time: "11:50" },
  { period_number: 7,  period_type: "lesson",      start_time: "11:50", end_time: "12:30" },
  { period_number: 8,  period_type: "lunch",       start_time: "12:30", end_time: "13:10" },
  { period_number: 9,  period_type: "lesson",      start_time: "13:10", end_time: "13:50" },
  { period_number: 10, period_type: "lesson",      start_time: "13:50", end_time: "14:30" },
  { period_number: 11, period_type: "lesson",      start_time: "14:30", end_time: "15:00" },
  { period_number: 12, period_type: "closing",     start_time: "15:00", end_time: "15:10" },
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

const EMPTY_DRAFT: SlotDraft = {
  period_type: "lesson", subject_id: "", teacher_id: "",
  room: "", start_time: "", end_time: "", notes: "",
};

export default function TimetablePage() {
  const { schoolId } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<"first" | "second" | "third">("first");
  const currentYear = new Date().getFullYear();
  const defaultYear = `${currentYear}/${currentYear + 1}`;
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{ day: Day; period_number: number; existing?: TimetableSlot } | null>(null);
  const [draft, setDraft] = useState<SlotDraft>(EMPTY_DRAFT);

  // ── Load initial data ──────────────────────────────────────────────
  const loadInit = useCallback(async () => {
    if (!schoolId) return;
    setLoadingInit(true);
    setInitError(null);
    try {
      const [cls, subs, tchs] = await Promise.all([
        getClasses(schoolId), getSubjects(schoolId), getTeachers(schoolId),
      ]);
      setClasses(cls);
      setSubjects(subs);
      setTeachers(tchs);
      if (cls.length) setSelectedClassId(cls[0].id);
    } catch (e) {
      const msg = (e as Error).message;
      setInitError(msg);
      toast({ title: "Error loading data", description: msg, variant: "destructive" });
    } finally {
      setLoadingInit(false);
    }
  }, [schoolId]); // eslint-disable-line

  useEffect(() => { loadInit(); }, [loadInit]);

  useEffect(() => {
    if (school) {
      setSelectedTerm(school.current_term);
      setSelectedYear(school.academic_year);
    }
  }, [school]);

  // ── Load timetable slots whenever filters change ───────────────────
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

  // ── Derived data ───────────────────────────────────────────────────
  const slotMap: Record<string, TimetableSlot> = {};
  slots.forEach((s) => { slotMap[`${s.day}|${s.period_number}`] = s; });

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // Period list: ALWAYS show all 13 DEFAULT rows, plus any extra periods saved in DB
  const periodNumbers = (() => {
    const base = DEFAULT_PERIODS.map((p) => p.period_number);
    const fromDb = slots.map((s) => s.period_number);
    return [...new Set([...base, ...fromDb])].sort((a, b) => a - b);
  })();

  // Normalise DB TIME format "HH:MM:SS" → "HH:MM"
  const normTime = (t: string) => (t ?? "").slice(0, 5);

  // For each period number, determine the canonical type + times (from any day's slot, or template)
  const getPeriodMeta = (pn: number): { period_type: string; start_time: string; end_time: string } => {
    const existing = DAYS.map((d) => slotMap[`${d}|${pn}`]).find(Boolean);
    if (existing) return {
      period_type: existing.period_type,
      start_time: normTime(existing.start_time),
      end_time:   normTime(existing.end_time),
    };
    const def = DEFAULT_PERIODS.find((p) => p.period_number === pn);
    return { period_type: def?.period_type ?? "lesson", start_time: def?.start_time ?? "", end_time: def?.end_time ?? "" };
  };

  // Returns the display label for a break row (custom from notes, or default)
  const getBreakLabel = (pn: number): string => {
    const meta = getPeriodMeta(pn);
    if (meta.period_type === "short_break") {
      const existing = DAYS.map((d) => slotMap[`${d}|${pn}`]).find(Boolean);
      return existing?.notes || DEFAULT_BREAK_LABEL;
    }
    return PERIOD_LABELS[meta.period_type] ?? meta.period_type;
  };

  // ── Open drawer ────────────────────────────────────────────────────
  const openDrawer = (day: Day, pn: number) => {
    const existing = slotMap[`${day}|${pn}`];
    const meta = getPeriodMeta(pn);
    setEditTarget({ day, period_number: pn, existing });
    setDraft({
      period_type:  existing?.period_type ?? meta.period_type,
      subject_id:   existing?.subject_id ?? "",
      teacher_id:   existing?.teacher_id ?? "",
      room:         existing?.room ?? "",
      start_time:   existing ? normTime(existing.start_time) : meta.start_time,
      end_time:     existing ? normTime(existing.end_time)   : meta.end_time,
      notes:        existing?.notes ?? "",
    });
    setDrawerOpen(true);
  };

  // Open drawer for break/non-lesson row (any day click opens shared drawer)
  const openBreakDrawer = (pn: number) => {
    const meta = getPeriodMeta(pn);
    // Find any saved slot for this period across all days
    const existing = DAYS.map((d) => slotMap[`${d}|${pn}`]).find(Boolean);
    setEditTarget({ day: "monday", period_number: pn, existing });
    setDraft({
      period_type:  meta.period_type,
      subject_id:   "",
      teacher_id:   "",
      room:         "",
      start_time:   meta.start_time,
      end_time:     meta.end_time,
      notes:        existing?.notes ?? "",
    });
    setDrawerOpen(true);
  };

  // ── Save single slot ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!schoolId || !editTarget || !selectedClassId) return;
    setSaving(true);
    const cls = selectedClass;
    const sub = subjects.find((s) => s.id === draft.subject_id);
    const tch = teachers.find((t) => t.id === draft.teacher_id);
    const isLesson = draft.period_type === "lesson";

    // NAPPS enforcement: no lesson may end after 3:00PM
    if (isLesson && draft.end_time > NAPPS_CLOSING_TIME) {
      toast({
        title: "NAPPS restriction",
        description: "Lesson periods cannot end after 3:00PM (NAPPS standard). Adjust the end time.",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    try {
      // For non-lesson types, save the same slot across ALL days
      const daysToSave: Day[] = isLesson ? [editTarget.day] : [...DAYS];

      const saved: TimetableSlot[] = [];
      for (const day of daysToSave) {
        const existingForDay = slotMap[`${day}|${editTarget.period_number}`];
        const result = await saveTimetableSlot(schoolId, {
          ...(existingForDay?.id ? { id: existingForDay.id } : {}),
          class_id:      selectedClassId,
          class_name:    cls?.name ?? "",
          academic_year: selectedYear,
          term:          selectedTerm,
          day,
          period_number: editTarget.period_number,
          period_type:   draft.period_type as TimetableSlot["period_type"],
          start_time:    draft.start_time || "00:00",
          end_time:      draft.end_time || "00:00",
          subject_id:    isLesson ? (draft.subject_id || null) : null,
          subject_name:  isLesson ? (sub?.name ?? null) : null,
          teacher_id:    isLesson ? (draft.teacher_id || null) : null,
          teacher_name:  isLesson ? (tch ? `${tch.first_name} ${tch.last_name}` : null) : null,
          room:          isLesson ? (draft.room || null) : null,
          notes:         draft.notes || null,
        });
        saved.push(result);
      }

      setSlots((prev) => {
        let updated = [...prev];
        saved.forEach((s) => {
          const idx = updated.findIndex((x) => x.day === s.day && x.period_number === s.period_number);
          if (idx >= 0) updated[idx] = s;
          else updated.push(s);
        });
        return updated;
      });

      toast({ title: "Saved", description: isLesson ? "Lesson slot saved." : `${PERIOD_LABELS[draft.period_type]} updated for all days.` });
      setDrawerOpen(false);
    } catch (e) {
      toast({ title: "Error saving", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete slot ────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!schoolId || !editTarget) return;
    setSaving(true);
    const isLesson = draft.period_type === "lesson";
    try {
      const daysToDelete: Day[] = isLesson ? [editTarget.day] : [...DAYS];
      for (const day of daysToDelete) {
        const slot = slotMap[`${day}|${editTarget.period_number}`];
        if (slot?.id) await deleteTimetableSlot(schoolId, slot.id);
      }
      setSlots((prev) => {
        if (isLesson) return prev.filter((s) => !(s.day === editTarget.day && s.period_number === editTarget.period_number));
        return prev.filter((s) => s.period_number !== editTarget.period_number);
      });
      toast({ title: "Deleted" });
      setDrawerOpen(false);
    } catch (e) {
      toast({ title: "Error deleting", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Load template ──────────────────────────────────────────────────
  const handleLoadTemplate = async () => {
    if (!schoolId || !selectedClassId || !selectedYear) {
      toast({ title: "Select class and year first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const cls = selectedClass;
      const templateSlots = DAYS.flatMap((day) =>
        DEFAULT_PERIODS.map((p) => ({
          class_id:      selectedClassId,
          class_name:    cls?.name ?? "",
          academic_year: selectedYear,
          term:          selectedTerm,
          day,
          period_number: p.period_number,
          period_type:   p.period_type,
          start_time:    p.start_time,
          end_time:      p.end_time,
          subject_id:    null as null,
          subject_name:  null as null,
          teacher_id:    null as null,
          teacher_name:  null as null,
          room:          null as null,
          notes:         null,
        }))
      );
      const saved = await bulkSaveTimetable(schoolId, templateSlots);
      setSlots(saved);
      toast({ title: "Template loaded", description: `${saved.length} period slots created across all 5 days.` });
    } catch (e) {
      toast({ title: "Error loading template", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Save All ───────────────────────────────────────────────────────
  const handleSaveAll = async () => {
    if (!schoolId || slots.length === 0) return;
    setSavingAll(true);
    try {
      const saved = await bulkSaveTimetable(schoolId, slots.map(({ id, school_id, created_at, updated_at, ...rest }) => ({ ...rest, id })));
      setSlots(saved);
      toast({ title: "All slots saved", description: `${saved.length} periods saved successfully.` });
    } catch (e) {
      toast({ title: "Error saving all", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingAll(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  if (initError && classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-700 font-semibold">Failed to load timetable data</p>
        <p className="text-slate-400 text-sm max-w-xs text-center">{initError}</p>
        <button
          onClick={loadInit}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const canShowGrid = selectedClassId && selectedYear;

  return (
    <>
      {/* ── Print styles ── */}
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
          .no-print { display: none !important; }
          nav, aside, header, [data-sidebar], [role="navigation"],
          .sidebar, [class*="sidebar"], [class*="navbar"], [class*="nav-bar"] {
            display: none !important;
          }
          body > *:not(#timetable-print-root) { visibility: hidden; }
          #timetable-print-area, #timetable-print-area * { visibility: visible; }
          #timetable-print-area { position: fixed; inset: 0; padding: 20px; background: white; overflow: visible; }
          #timetable-print-area table { width: 100%; border-collapse: collapse; font-size: 11px; }
          #timetable-print-area th { background: #1e293b !important; color: white !important; padding: 6px 8px; }
          #timetable-print-area td { border: 1px solid #cbd5e1; padding: 5px 7px; }
          #timetable-print-area .break-band-print { text-align: center; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; padding: 7px; }
          #timetable-print-area button { pointer-events: none; }
        }
      `}</style>

      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Timetable</h1>
            <p className="text-sm text-slate-500 mt-0.5">Weekly class schedule</p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <Button variant="outline" size="sm" onClick={loadSlots} disabled={loadingSlots}>
              <RefreshCw size={14} className={cn("mr-1.5", loadingSlots && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={handleLoadTemplate}
              disabled={saving || !canShowGrid}
            >
              {saving
                ? <Loader2 size={14} className="mr-1.5 animate-spin" />
                : <Plus size={14} className="mr-1.5" />}
              Load Template
            </Button>
            <Button
              variant="default" size="sm"
              onClick={handleSaveAll}
              disabled={savingAll || slots.length === 0}
            >
              {savingAll
                ? <Loader2 size={14} className="mr-1.5 animate-spin" />
                : <Save size={14} className="mr-1.5" />}
              Save All
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer size={14} className="mr-1.5" />
              Print Timetable
            </Button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Class</label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select class…" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Term</label>
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
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Academic Year</label>
            <Input
              className="h-9"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              placeholder="e.g. 2025/2026"
            />
          </div>
        </div>

        {/* ── Grid ── */}
        {loadingSlots ? (
          <div className="flex justify-center py-14">
            <Loader2 className="animate-spin text-slate-400" size={24} />
          </div>
        ) : !canShowGrid ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
            <p className="text-slate-400 text-sm">Select a class and academic year to view the timetable.</p>
          </div>
        ) : (
          <div id="timetable-print-area">
            {/* Print-only header */}
            <div className="hidden print:block mb-4">
              <p className="text-lg font-bold">{school?.name ?? "School"} — Timetable</p>
              <p className="text-sm text-slate-600">
                Class: <strong>{selectedClass?.name ?? "—"}</strong> &nbsp;|&nbsp;
                {TERM_LABELS[selectedTerm]} &nbsp;|&nbsp; {selectedYear}
              </p>
            </div>

            {periodNumbers.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm mb-4">No timetable yet. Load the default template to get started.</p>
                <Button size="sm" onClick={handleLoadTemplate} disabled={saving} className="no-print">
                  {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Plus size={14} className="mr-1.5" />}
                  Load Default Template
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs min-w-[680px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2.5 w-28 text-slate-500 font-semibold uppercase text-[11px]">Period</th>
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
                        <tr key={pn} className={cn("border-b border-slate-100", idx % 2 === 0 ? "bg-white" : "bg-slate-50/50")}>
                          {/* Period label cell */}
                          <td className="px-3 py-2 align-middle whitespace-nowrap">
                            <p className="font-bold text-slate-700 text-[11px]">
                              {pn === 0 ? "Asm" : isBreak ? "" : `P${pn}`}
                            </p>
                            <p className="text-slate-400 text-[10px] mt-0.5">
                              {meta.start_time.slice(0, 5)} – {meta.end_time.slice(0, 5)}
                            </p>
                            {meta.period_type === "lesson" && meta.end_time > NAPPS_CLOSING_TIME && (
                              <span className="text-[9px] font-semibold text-red-500">&#9888; After NAPPS limit</span>
                            )}
                          </td>

                          {isBreak ? (
                            /* ── Full-width break band spanning all 5 day columns ── */
                            <td
                              colSpan={5}
                              style={{
                                background: BREAK_BAND_BG[meta.period_type] ?? "#f1f5f9",
                                border: `1px solid ${BREAK_BAND_BORDER[meta.period_type] ?? "#e2e8f0"}`,
                                padding: "6px 8px",
                              }}
                            >
                              {/* Screen: clickable */}
                              <button
                                onClick={() => openBreakDrawer(pn)}
                                className="break-band no-print w-full rounded-md py-2 text-center text-[11px] font-bold tracking-widest uppercase transition-all hover:opacity-80"
                                style={{
                                  color: BREAK_BAND_TEXT[meta.period_type] ?? "#334155",
                                  background: "transparent",
                                  border: "none",
                                }}
                              >
                                {PERIOD_EMOJIS[meta.period_type] ?? ""}{" "}
                                {getBreakLabel(pn)}
                                <span className="ml-2 text-[10px] font-normal opacity-50">
                                  {meta.period_type === "closing" ? "NAPPS" : "click to edit"}
                                </span>
                              </button>
                              {/* Print: static div */}
                              <div
                                className="break-band-print hidden print:block w-full text-center"
                                style={{ color: BREAK_BAND_TEXT[meta.period_type] ?? "#334155" }}
                              >
                                {PERIOD_EMOJIS[meta.period_type] ?? ""}{" "}
                                {getBreakLabel(pn)}
                              </div>
                            </td>
                          ) : (
                            /* ── Lesson cells — one per day ── */
                            DAYS.map((day) => {
                              const slot = slotMap[`${day}|${pn}`];
                              return (
                                <td key={day} className="px-1.5 py-1.5 align-top">
                                  <button
                                    onClick={() => openDrawer(day, pn)}
                                    className={cn(
                                      "w-full min-h-[56px] p-2 rounded-lg text-left transition-all",
                                      "hover:ring-2 hover:ring-blue-400 hover:shadow-sm",
                                      slot
                                        ? "bg-white border border-slate-200 shadow-sm"
                                        : "bg-slate-50 border border-dashed border-slate-200 no-print"
                                    )}
                                  >
                                    {slot ? (
                                      <>
                                        <p className="font-semibold text-slate-800 text-[11px] leading-tight line-clamp-1">
                                          {slot.subject_name ?? <span className="italic text-slate-400">No subject</span>}
                                        </p>
                                        {slot.teacher_name && (
                                          <p className="text-slate-500 text-[10px] mt-0.5 truncate">{slot.teacher_name}</p>
                                        )}
                                        {slot.room && (
                                          <p className="text-slate-400 text-[10px]">Rm {slot.room}</p>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-[10px] text-slate-400 italic no-print">+ Add lesson</p>
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
        )}
      </div>

      {/* ── Edit Drawer ── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-2">
            <SheetTitle>
              {editTarget
                ? (() => {
                    const m = getPeriodMeta(editTarget.period_number);
                    const isBreakRow = m.period_type !== "lesson";
                    if (isBreakRow) return getBreakLabel(editTarget.period_number);
                    return `${DAY_LABELS[editTarget.day] ?? editTarget.day} · P${editTarget.period_number}`;
                  })()
                : "Edit Slot"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 py-4 px-1">
            {/* Period Type */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase">Period Type</label>
              <Select
                value={draft.period_type}
                onValueChange={(v) => setDraft((d) => ({ ...d, period_type: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lesson-specific fields */}
            {draft.period_type === "lesson" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Subject</label>
                  <Select
                    value={draft.subject_id}
                    onValueChange={(v) => setDraft((d) => ({ ...d, subject_id: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Teacher</label>
                  <Select
                    value={draft.teacher_id}
                    onValueChange={(v) => setDraft((d) => ({ ...d, teacher_id: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.first_name} {t.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase">Room</label>
                  <Input
                    value={draft.room}
                    onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))}
                    placeholder="e.g. B12"
                  />
                </div>
              </>
            )}

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Start Time</label>
                <Input
                  type="time"
                  value={draft.start_time}
                  onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">End Time</label>
                <Input
                  type="time"
                  value={draft.end_time}
                  onChange={(e) => setDraft((d) => ({ ...d, end_time: e.target.value }))}
                />
              </div>
            </div>

            {/* Break Label config — only for configurable breaks */}
            {draft.period_type === "short_break" && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <label className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Break Type &amp; Label</label>
                <Select
                  value={draft.notes ? "custom" : "default"}
                  onValueChange={(v) => {
                    if (v === "default") setDraft((d) => ({ ...d, notes: "" }));
                    else setDraft((d) => ({ ...d, notes: d.notes || DEFAULT_BREAK_LABEL }));
                  }}
                >
                  <SelectTrigger className="h-8 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Lesson Break (default)</SelectItem>
                    <SelectItem value="custom">Custom label</SelectItem>
                  </SelectContent>
                </Select>
                {draft.notes !== "" && (
                  <Input
                    value={draft.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="e.g. Assembly Break"
                    className="h-8 bg-white"
                  />
                )}
                <p className="text-[10px] text-amber-700">This label appears on the break band row across all days.</p>
              </div>
            )}

            {/* Notes — only for lesson/other period types */}
            {draft.period_type !== "short_break" && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Notes</label>
                <Textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Optional notes…"
                  rows={2}
                  className="resize-none"
                />
              </div>
            )}
          </div>

          <SheetFooter className="flex gap-2 flex-col sm:flex-row pt-2 px-1">
            {editTarget?.existing && (
              <Button
                variant="destructive" size="sm"
                onClick={handleDelete}
                disabled={saving}
                className="sm:mr-auto"
              >
                <Trash2 size={14} className="mr-1.5" /> Delete
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
