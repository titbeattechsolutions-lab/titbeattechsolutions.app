import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import { useAttendance, useSaveAttendance } from "@/hooks/useSchoolQuery";
import {
  getMyTeacherProfile, getTeacherClasses, getStudents,
  Teacher, Class, Student,
} from "@/supabase/schoolService";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Save } from "lucide-react";
import { cn } from "@/lib/utils";

type AttendanceStatus = { present: boolean; remark: string };

export default function AttendancePage() {
  const { schoolId, user } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const today = new Date().toISOString().split("T")[0];

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({});

  const [loadingInit, setLoadingInit] = useState(true);

  // React Query: existing attendance record (staleTime: 30s)
  const { data: existingRecord, isFetching: loadingAttendance } = useAttendance(
    selectedClassId, selectedDate
  );
  const saveAttendanceMutation = useSaveAttendance();
  const saving = saveAttendanceMutation.isPending;

  // Init: load teacher + classes
  useEffect(() => {
    if (!schoolId || !user) return;
    setLoadingInit(true);
    getMyTeacherProfile(schoolId, user.id)
      .then(async (t) => {
        if (!t) return;
        setTeacher(t);
        const cls = await getTeacherClasses(schoolId, t);
        setClasses(cls);
        if (cls.length === 1) setSelectedClassId(cls[0].id);
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoadingInit(false));
  }, [schoolId, user]); // eslint-disable-line

  // Sync records state when React Query delivers attendance data or class/date changes
  useEffect(() => {
    if (!selectedClassId || !selectedDate) return;
    if (existingRecord) {
      const loaded: Record<string, AttendanceStatus> = {};
      students.forEach((s) => {
        const rec = (existingRecord.records as Record<string, { present: boolean; remark?: string }>)[s.id];
        loaded[s.id] = { present: rec?.present ?? true, remark: rec?.remark ?? "" };
      });
      setRecords(loaded);
    } else if (!loadingAttendance && students.length > 0) {
      const defaults: Record<string, AttendanceStatus> = {};
      students.forEach((s) => { defaults[s.id] = { present: true, remark: "" }; });
      setRecords(defaults);
    }
  }, [existingRecord, loadingAttendance, selectedClassId, selectedDate]); // eslint-disable-line

  // Load students when class changes
  useEffect(() => {
    if (!schoolId || !selectedClassId) return;
    setStudents([]);
    setRecords({});
    getStudents(schoolId, { class_id: selectedClassId, status: "active" })
      .then(setStudents)
      .catch((e) => toast({ title: "Error loading students", description: e.message, variant: "destructive" }));
  }, [schoolId, selectedClassId]); // eslint-disable-line

  const togglePresence = (studentId: string) => {
    if (isReadOnly) return;
    setRecords((r) => ({ ...r, [studentId]: { ...r[studentId], present: !r[studentId].present } }));
  };

  const setRemark = (studentId: string, remark: string) => {
    setRecords((r) => ({ ...r, [studentId]: { ...r[studentId], remark } }));
  };

  const presentCount = Object.values(records).filter((r) => r.present).length;
  const absentCount = students.length - presentCount;

  // Read-only if record exists AND caller is NOT the taker on today's date
  const isReadOnly = !!existingRecord && !(
    selectedDate === today &&
    existingRecord.taken_by === teacher?.id
  );

  const handleSave = async () => {
    if (!schoolId || !teacher || !selectedClassId) return;
    if (students.length === 0) {
      toast({ title: "No students in this class", variant: "destructive" }); return;
    }
    const cls = classes.find((c) => c.id === selectedClassId);
    const payload = {
      class_id: selectedClassId,
      class_name: cls?.name ?? "",
      date: selectedDate,
      term: school?.current_term ?? "first",
      academic_year: school?.academic_year ?? "",
      taken_by: teacher.id,
      taken_by_name: `${teacher.first_name} ${teacher.last_name}`,
      records: Object.fromEntries(
        Object.entries(records).map(([sid, r]) => [sid, { present: r.present, remark: r.remark || undefined }])
      ),
      present_count: presentCount,
      absent_count: absentCount,
    };
    try {
      await saveAttendanceMutation.mutateAsync(payload);
      toast({ title: "Attendance saved", description: `${presentCount} present, ${absentCount} absent` });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505")) {
        toast({ title: "Already taken", description: "Attendance for this class and date already exists.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    }
  };

  if (loadingInit) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  if (!teacher) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="font-medium">Your account is not linked to a teacher record.</p>
        <p className="text-sm mt-1">Contact your school admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-800">Attendance</h1>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase">Class</label>
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger>
              <SelectValue placeholder="Select class…" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase">Date</label>
          <Input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {selectedClassId && (
        <>
          {/* Status banner */}
          {existingRecord && (
            <div className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm",
              isReadOnly
                ? "bg-amber-50 border border-amber-200 text-amber-700"
                : "bg-blue-50 border border-blue-200 text-blue-700"
            )}>
              {isReadOnly ? (
                <>
                  <CheckCircle2 size={14} className="shrink-0" />
                  Attendance already recorded by {existingRecord.taken_by_name}. Read-only.
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="shrink-0" />
                  You took this attendance — you can edit it (same day only).
                </>
              )}
            </div>
          )}

          {/* Summary bar */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-emerald-600 font-semibold">{presentCount} Present</span>
            <span className="text-red-500 font-semibold">{absentCount} Absent</span>
            <span className="text-slate-400 text-xs">{students.length} total</span>
          </div>

          {/* Student list */}
          {loadingAttendance ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : students.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">No active students in this class.</p>
          ) : (
            <Card>
              <CardContent className="pt-0 pb-0 divide-y divide-slate-100">
                {students.map((s, i) => {
                  const rec = records[s.id] ?? { present: true, remark: "" };
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2.5 px-1">
                      <span className="text-xs text-slate-400 w-5 text-right shrink-0">{i + 1}</span>
                      <span className="font-mono text-xs text-slate-400 w-20 shrink-0">{s.admission_no}</span>
                      <span className="flex-1 text-sm text-slate-700">
                        {s.last_name}, {s.first_name}
                      </span>

                      {/* Present / Absent toggle */}
                      <button
                        disabled={isReadOnly}
                        onClick={() => togglePresence(s.id)}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                          rec.present
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-red-100 text-red-600 hover:bg-red-200",
                          isReadOnly && "cursor-default opacity-70"
                        )}
                      >
                        {rec.present
                          ? <><CheckCircle2 size={12} /> Present</>
                          : <><XCircle size={12} /> Absent</>
                        }
                      </button>

                      {/* Remark */}
                      {!rec.present && (
                        <Input
                          disabled={isReadOnly}
                          placeholder="Reason…"
                          value={rec.remark}
                          onChange={(e) => setRemark(s.id, e.target.value)}
                          className="h-7 text-xs w-28 shrink-0"
                        />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Save button */}
          {!isReadOnly && students.length > 0 && (
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving
                ? <Loader2 size={14} className="mr-2 animate-spin" />
                : <Save size={14} className="mr-2" />
              }
              {existingRecord ? "Update Attendance" : "Submit Attendance"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
