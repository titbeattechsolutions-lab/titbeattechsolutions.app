import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import { getTeachers, getClasses, getRecentActivity, updateSchoolProfile } from "@/supabase/schoolService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, GraduationCap, BookOpen, CalendarDays, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AttendanceWidget from "@/components/dashboard/AttendanceWidget";
import SessionLog from "@/components/SessionLog";
import StudentOverviewCard from "@/components/dashboard/StudentOverviewCard";

const TERM_LABELS = { first: "1st Term", second: "2nd Term", third: "3rd Term" };

export default function OverviewPage() {
  const { schoolId } = useAuth();
  const { school, setSchool, loading: schoolLoading } = useSchool();
  const { toast } = useToast();

  const [teacherCount, setTeacherCount] = useState<number | null>(null);
  const [classCount, setClassCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<{ id: number; action: string; details: string | null; timestamp: string }[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!schoolId) return;
    setLoadingStats(true);
    Promise.all([
      getTeachers(schoolId),
      getClasses(schoolId),
      getRecentActivity(schoolId, 10),
    ]).then(([teachers, classes, logs]) => {
      setTeacherCount(teachers.length);
      setClassCount(classes.length);
      setActivity(logs);
    }).catch((e) => console.error(e))
      .finally(() => setLoadingStats(false));
  }, [schoolId]);

  const handleTermChange = async (term: string) => {
    if (!schoolId || !school) return;
    try {
      const updated = await updateSchoolProfile(schoolId, { current_term: term as "first" | "second" | "third" });
      setSchool(updated);
      toast({ title: "Term updated", description: `Now in ${TERM_LABELS[term as keyof typeof TERM_LABELS]}` });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (schoolLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="animate-spin text-slate-400" /></div>;
  }

  const stats = [
    { label: "Total Students",  value: school?.current_students ?? 0, icon: Users,          color: "bg-blue-50 text-blue-600" },
    { label: "Total Teachers",  value: teacherCount ?? "—",           icon: GraduationCap,  color: "bg-emerald-50 text-emerald-600" },
    { label: "Total Classes",   value: classCount ?? "—",             icon: BookOpen,       color: "bg-purple-50 text-purple-600" },
    { label: "Current Term",    value: TERM_LABELS[school?.current_term as keyof typeof TERM_LABELS] ?? "—", icon: CalendarDays, color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Overview</h1>
          <p className="text-sm text-slate-500">{school?.academic_year} Academic Year</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Current Term:</span>
          <Select value={school?.current_term ?? "first"} onValueChange={handleTermChange}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="first">1st Term</SelectItem>
              <SelectItem value="second">2nd Term</SelectItem>
              <SelectItem value="third">3rd Term</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.color}`}>
                  <s.icon size={18} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {loadingStats && s.label !== "Current Term" ? <Loader2 size={16} className="animate-spin inline" /> : s.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Student Overview — gender breakdown with class filter */}
      <StudentOverviewCard />

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No recent activity</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((log) => (
                <li key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div>
                    <Badge variant="outline" className="text-xs mr-2">{log.action}</Badge>
                    <span className="text-sm text-slate-600">{log.details ?? ""}</span>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Live attendance widget */}
      <Card>
        <CardContent className="pt-5">
          <AttendanceWidget />
        </CardContent>
      </Card>

      {/* Session log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Logins &amp; Logouts</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionLog />
        </CardContent>
      </Card>
    </div>
  );
}
