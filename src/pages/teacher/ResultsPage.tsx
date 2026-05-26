import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import { useResults, useSaveResult, useBulkSaveResults } from "@/hooks/useSchoolQuery";
import {
  getMyTeacherProfile, getTeacherClasses, getStudents, getSubjects,
  Teacher, Class, Student, Subject, Result,
} from "@/supabase/schoolService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type ScoreRow = {
  student: Student;
  ca1: string;
  ca2: string;
  exam: string;
  saved: Result | null;
  dirty: boolean;
  saving: boolean;
};

const GRADE_COLOR: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-700",
  B2: "bg-emerald-50 text-emerald-600",
  B3: "bg-blue-50 text-blue-600",
  C4: "bg-blue-50 text-blue-500",
  C5: "bg-sky-50 text-sky-600",
  C6: "bg-sky-50 text-sky-500",
  D7: "bg-amber-50 text-amber-600",
  E8: "bg-orange-50 text-orange-600",
  F9: "bg-red-50 text-red-600",
};

export default function ResultsPage() {
  const { schoolId, user } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<"first" | "second" | "third">("first");
  const [selectedYear, setSelectedYear] = useState("");

  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const resultsEnabled = !!selectedClassId && !!selectedSubjectId && !!selectedTerm && !!selectedYear;
  const { data: existingResults = [], isFetching: loadingRows, refetch: refetchResults } = useResults(
    resultsEnabled ? { class_id: selectedClassId, subject_id: selectedSubjectId, term: selectedTerm, academic_year: selectedYear } : { class_id: "", subject_id: "", term: selectedTerm, academic_year: selectedYear }
  );
  const saveResultMutation = useSaveResult();
  const bulkSaveMutation = useBulkSaveResults();
  const savingAll = bulkSaveMutation.isPending;

  // Init: teacher + classes + subjects
  useEffect(() => {
    if (!schoolId || !user) return;
    setLoadingInit(true);
    getMyTeacherProfile(schoolId, user.id)
      .then(async (t) => {
        if (!t) return;
        setTeacher(t);
        const [cls, subs] = await Promise.all([
          getTeacherClasses(schoolId, t),
          getSubjects(schoolId),
        ]);
        setClasses(cls);
        setSubjects(subs);
        if (cls.length === 1) setSelectedClassId(cls[0].id);
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoadingInit(false));
  }, [schoolId, user]); // eslint-disable-line

  // When school loads, set defaults
  useEffect(() => {
    if (school) {
      setSelectedTerm(school.current_term);
      setSelectedYear(school.academic_year);
    }
  }, [school]);

  // Sync rows whenever React Query delivers fresh results
  const [students, setStudents] = useState<Student[]>([]);
  useEffect(() => {
    if (!schoolId || !selectedClassId) return;
    getStudents(schoolId, { class_id: selectedClassId, status: "active" })
      .then(setStudents)
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }));
  }, [schoolId, selectedClassId]); // eslint-disable-line

  useEffect(() => {
    if (!resultsEnabled || loadingRows) return;
    const resultMap: Record<string, Result> = {};
    existingResults.forEach((r) => { if (r.student_id) resultMap[r.student_id] = r; });
    setRows(students.map((s) => {
      const existing = resultMap[s.id];
      return {
        student: s,
        ca1: existing?.score_ca1 != null ? String(existing.score_ca1) : "",
        ca2: existing?.score_ca2 != null ? String(existing.score_ca2) : "",
        exam: existing?.score_exam != null ? String(existing.score_exam) : "",
        saved: existing ?? null,
        dirty: false,
        saving: false,
      };
    }));
  }, [existingResults, students, loadingRows, resultsEnabled]); // eslint-disable-line

  const updateRow = (idx: number, field: "ca1" | "ca2" | "exam", val: string) => {
    setRows((prev) => prev.map((r, i) =>
      i === idx ? { ...r, [field]: val, dirty: true } : r
    ));
  };

  const validateScore = (val: string, max: number): number | null => {
    if (val === "" || val === null) return null;
    const n = parseFloat(val);
    if (isNaN(n) || n < 0 || n > max) return null;
    return n;
  };

  const buildPayload = (row: ScoreRow): Omit<Result, "score_total" | "grade" | "remark"> | null => {
    if (!teacher || !school) return null;
    const cls = classes.find((c) => c.id === selectedClassId);
    const sub = subjects.find((s) => s.id === selectedSubjectId);
    if (!cls || !sub) return null;

    const ca1 = validateScore(row.ca1, 20);
    const ca2 = validateScore(row.ca2, 20);
    const exam = validateScore(row.exam, 60);

    return {
      ...(row.saved?.id ? { id: row.saved.id } : {}),
      school_id: schoolId!,
      student_id: row.student.id,
      student_name: `${row.student.first_name} ${row.student.last_name}`,
      admission_no: row.student.admission_no,
      class_id: selectedClassId,
      class_name: cls.name,
      subject_id: selectedSubjectId,
      subject_name: sub.name,
      teacher_id: teacher.id,
      academic_year: selectedYear,
      term: selectedTerm,
      score_ca1: ca1,
      score_ca2: ca2,
      score_exam: exam,
      teacher_comment: row.saved?.teacher_comment ?? null,
    };
  };

  const saveRow = async (idx: number) => {
    const row = rows[idx];
    const payload = buildPayload(row);
    if (!payload) return;
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, saving: true } : r));
    try {
      const saved = await saveResultMutation.mutateAsync(payload);
      setRows((prev) => prev.map((r, i) =>
        i === idx ? {
          ...r, saved,
          ca1: saved.score_ca1 != null ? String(saved.score_ca1) : "",
          ca2: saved.score_ca2 != null ? String(saved.score_ca2) : "",
          exam: saved.score_exam != null ? String(saved.score_exam) : "",
          dirty: false, saving: false,
        } : r
      ));
    } catch (e) {
      toast({ title: "Error saving row", description: (e as Error).message, variant: "destructive" });
      setRows((prev) => prev.map((r, i) => i === idx ? { ...r, saving: false } : r));
    }
  };

  const saveAll = async () => {
    const dirty = rows.filter((r) => r.dirty);
    if (dirty.length === 0) {
      toast({ title: "Nothing to save", description: "Edit some scores first." }); return;
    }
    try {
      const payloads = dirty.map((r) => buildPayload(r)).filter((p): p is NonNullable<typeof p> => p !== null);
      const saved = await bulkSaveMutation.mutateAsync(payloads);
      const savedMap: Record<string, Result> = {};
      saved.forEach((r) => { if (r.student_id) savedMap[r.student_id] = r; });
      setRows((prev) => prev.map((r) => {
        const s = savedMap[r.student.id];
        if (!s) return r;
        return { ...r, saved: s, ca1: s.score_ca1 != null ? String(s.score_ca1) : "", ca2: s.score_ca2 != null ? String(s.score_ca2) : "", exam: s.score_exam != null ? String(s.score_exam) : "", dirty: false, saving: false };
      }));
      toast({ title: `${saved.length} result(s) saved` });
    } catch (e) {
      toast({ title: "Bulk save failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const teacherSubjects = subjects.filter((s) => teacher?.subject_ids?.includes(s.id));
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId);
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  if (loadingInit) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  if (!teacher) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="font-medium">Your account is not linked to a teacher record.</p>
      </div>
    );
  }

  const dirtyCount = rows.filter((r) => r.dirty).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-slate-800">Results Entry</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchResults()} disabled={loadingRows}>
            <RefreshCw size={14} className={cn("mr-1", loadingRows && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" onClick={saveAll} disabled={savingAll || dirtyCount === 0}>
            {savingAll ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            Save All {dirtyCount > 0 && `(${dirtyCount})`}
          </Button>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 uppercase">Class</label>
          <Select value={selectedClassId} onValueChange={(v) => { setSelectedClassId(v); setRows([]); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Class…" /></SelectTrigger>
            <SelectContent>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500 uppercase">Subject</label>
          <Select value={selectedSubjectId} onValueChange={(v) => { setSelectedSubjectId(v); setRows([]); }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Subject…" /></SelectTrigger>
            <SelectContent>
              {(teacherSubjects.length > 0 ? teacherSubjects : subjects).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
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
          <Input
            className="h-9"
            placeholder="e.g. 2025/2026"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          />
        </div>
      </div>

      {selectedClassId && selectedSubjectId && (
        <>
          {/* Context header */}
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Badge variant="outline">{selectedClass?.name}</Badge>
            <span>·</span>
            <Badge variant="outline">{selectedSubject?.name}</Badge>
            <span>·</span>
            <span>{selectedTerm.charAt(0).toUpperCase() + selectedTerm.slice(1)} term, {selectedYear}</span>
          </div>

          {loadingRows ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">No active students in this class.</p>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-24">CA1 /20</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-24">CA2 /20</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-24">Exam /60</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-20">Total</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-16">Grade</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-16">Save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, idx) => (
                    <tr
                      key={row.student.id}
                      className={cn(
                        "transition-colors",
                        row.dirty ? "bg-amber-50" : "hover:bg-slate-50"
                      )}
                    >
                      <td className="px-4 py-2 text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-slate-800">{row.student.last_name}, {row.student.first_name}</div>
                        <div className="text-xs text-slate-400 font-mono">{row.student.admission_no}</div>
                      </td>

                      {/* CA1 */}
                      <td className="px-2 py-2 text-center">
                        <Input
                          type="number" min={0} max={20} step={0.5}
                          value={row.ca1}
                          onChange={(e) => updateRow(idx, "ca1", e.target.value)}
                          className={cn("h-8 text-center w-20 mx-auto text-sm",
                            row.ca1 !== "" && (validateScore(row.ca1, 20) === null) && "border-red-400 focus:ring-red-400"
                          )}
                          placeholder="—"
                        />
                      </td>

                      {/* CA2 */}
                      <td className="px-2 py-2 text-center">
                        <Input
                          type="number" min={0} max={20} step={0.5}
                          value={row.ca2}
                          onChange={(e) => updateRow(idx, "ca2", e.target.value)}
                          className={cn("h-8 text-center w-20 mx-auto text-sm",
                            row.ca2 !== "" && (validateScore(row.ca2, 20) === null) && "border-red-400 focus:ring-red-400"
                          )}
                          placeholder="—"
                        />
                      </td>

                      {/* Exam */}
                      <td className="px-2 py-2 text-center">
                        <Input
                          type="number" min={0} max={60} step={0.5}
                          value={row.exam}
                          onChange={(e) => updateRow(idx, "exam", e.target.value)}
                          className={cn("h-8 text-center w-20 mx-auto text-sm",
                            row.exam !== "" && (validateScore(row.exam, 60) === null) && "border-red-400 focus:ring-red-400"
                          )}
                          placeholder="—"
                        />
                      </td>

                      {/* Total — READ-ONLY, DB computed */}
                      <td className="px-2 py-2 text-center">
                        <span className="text-sm font-semibold text-slate-700">
                          {row.dirty
                            ? <span className="text-slate-300 text-xs">—</span>
                            : row.saved?.score_total != null
                              ? row.saved.score_total
                              : <span className="text-slate-300 text-xs">—</span>
                          }
                        </span>
                      </td>

                      {/* Grade — DB computed */}
                      <td className="px-2 py-2 text-center">
                        {!row.dirty && row.saved?.grade ? (
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs font-bold",
                            GRADE_COLOR[row.saved.grade] ?? "bg-slate-100 text-slate-600"
                          )}>
                            {row.saved.grade}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Per-row save */}
                      <td className="px-2 py-2 text-center">
                        <Button
                          size="icon"
                          variant={row.dirty ? "default" : "ghost"}
                          className="h-7 w-7"
                          disabled={!row.dirty || row.saving}
                          onClick={() => saveRow(idx)}
                        >
                          {row.saving
                            ? <Loader2 size={12} className="animate-spin" />
                            : <Save size={12} />
                          }
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
