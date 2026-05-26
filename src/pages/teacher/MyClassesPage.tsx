import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyTeacherProfile, getTeacherClasses, getStudents,
  getAttendanceSummary, getSubjects, Teacher, Class, Subject,
} from "@/supabase/schoolService";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSchool } from "@/hooks/useSchool";

interface ClassRoster {
  classId: string;
  students: { id: string; admission_no: string; first_name: string; last_name: string }[];
  attendancePct: number | null;
}

export default function MyClassesPage() {
  const { schoolId, user } = useAuth();
  const { school } = useSchool();
  const { toast } = useToast();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, ClassRoster>>({});
  const [loadingRoster, setLoadingRoster] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId || !user) return;
    setLoading(true);
    getMyTeacherProfile(schoolId, user.id)
      .then(async (t) => {
        if (!t) { setLoading(false); return; }
        setTeacher(t);
        const [cls, subs] = await Promise.all([
          getTeacherClasses(schoolId, t),
          getSubjects(schoolId),
        ]);
        setClasses(cls);
        setSubjects(subs);
      })
      .catch((e) => toast({ title: "Error", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [schoolId, user]); // eslint-disable-line

  const toggleExpand = async (cls: Class) => {
    if (expanded === cls.id) { setExpanded(null); return; }
    setExpanded(cls.id);
    if (rosters[cls.id]) return;

    setLoadingRoster(cls.id);
    try {
      const [students, summary] = await Promise.all([
        getStudents(schoolId, { class_id: cls.id, status: "active" }),
        school ? getAttendanceSummary(schoolId, cls.id, school.current_term) : Promise.resolve([]),
      ]);
      const totalDays = summary.length;
      const presentDays = summary.reduce((acc, d) => acc + (d.present_count > 0 ? 1 : 0), 0);
      const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null;
      setRosters((r) => ({
        ...r,
        [cls.id]: {
          classId: cls.id,
          students: students.map((s) => ({
            id: s.id, admission_no: s.admission_no,
            first_name: s.first_name, last_name: s.last_name,
          })),
          attendancePct,
        },
      }));
    } catch (e) {
      toast({ title: "Error loading roster", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingRoster(null);
    }
  };

  const classSubjects = (cls: Class) => {
    if (!teacher) return [];
    return subjects.filter((s) => teacher.subject_ids?.includes(s.id));
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  if (!teacher) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="font-medium">Your account is not linked to a teacher record yet.</p>
        <p className="text-sm mt-1">Contact your school admin to link your account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">My Classes</h1>
        <p className="text-sm text-slate-500">
          {teacher.first_name} {teacher.last_name} · {teacher.role.replace(/_/g, " ")}
        </p>
      </div>

      {classes.length === 0 ? (
        <p className="text-center text-slate-400 py-12 text-sm">
          No classes assigned. Ask your admin to assign classes to you.
        </p>
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => (
            <Card key={cls.id} className="overflow-hidden">
              <CardContent className="pt-4 pb-0">
                <div className="flex items-start justify-between pb-4">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800">{cls.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Users size={12} /> {cls.student_count} students
                      </span>
                      {classSubjects(cls).map((s) => (
                        <Badge key={s.id} variant="secondary" className="text-xs">{s.name}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-slate-800 shrink-0"
                    onClick={() => toggleExpand(cls)}
                  >
                    {expanded === cls.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span className="ml-1 text-xs">Roster</span>
                  </Button>
                </div>

                {expanded === cls.id && (
                  <div className="border-t border-slate-100 py-3">
                    {loadingRoster === cls.id ? (
                      <div className="flex justify-center py-4">
                        <Loader2 size={16} className="animate-spin text-slate-400" />
                      </div>
                    ) : rosters[cls.id] ? (
                      <>
                        {rosters[cls.id].attendancePct !== null && (
                          <p className="text-xs text-slate-500 mb-2">
                            Attendance this term: <strong>{rosters[cls.id].attendancePct}%</strong>
                          </p>
                        )}
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {rosters[cls.id].students.map((s, i) => (
                            <div key={s.id} className="flex items-center gap-3 text-sm py-1">
                              <span className="text-xs text-slate-400 w-5 text-right">{i + 1}</span>
                              <span className="font-mono text-xs text-slate-500">{s.admission_no}</span>
                              <span className="text-slate-700">{s.last_name}, {s.first_name}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
