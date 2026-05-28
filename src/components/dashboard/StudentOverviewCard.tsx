import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getStudentSummary, getClasses, StudentSummary, Class } from "@/supabase/schoolService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users } from "lucide-react";

export default function StudentOverviewCard() {
  const { schoolId } = useAuth();

  const [classes, setClasses]           = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [summary, setSummary]           = useState<StudentSummary | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) return;
    getClasses(schoolId)
      .then(setClasses)
      .catch((e) => console.error("StudentOverviewCard: getClasses", e));
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    getStudentSummary(schoolId, selectedClass === "all" ? undefined : selectedClass)
      .then(setSummary)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [schoolId, selectedClass]);

  const selectedClassName =
    selectedClass === "all"
      ? "All Classes"
      : (classes.find((c) => c.id === selectedClass)?.name ?? "—");

  const malePercent   = summary && summary.total > 0 ? Math.round((summary.male   / summary.total) * 100) : 0;
  const femalePercent = summary && summary.total > 0 ? Math.round((summary.female / summary.total) * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <Users size={15} />
            </div>
            Student Overview
          </CardTitle>

          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="pt-5 pb-5">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-slate-300" size={22} />
          </div>
        ) : error ? (
          <div className="py-6 text-center">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        ) : !summary || summary.total === 0 ? (
          <div className="py-8 text-center">
            <Users size={28} className="mx-auto text-slate-200 mb-2" />
            <p className="text-slate-400 text-sm">
              No active students{selectedClass !== "all" ? ` in ${selectedClassName}` : ""}.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Grand total */}
            <div className="text-center">
              <p className="text-5xl font-black text-slate-800 leading-none">{summary.total}</p>
              <p className="text-xs text-slate-400 mt-2 font-medium uppercase tracking-wide">
                Total Students &mdash; {selectedClassName}
              </p>
            </div>

            {/* Gender progress bar */}
            {summary.total > 0 && (
              <div className="h-2 rounded-full overflow-hidden flex bg-slate-100">
                <div
                  className="bg-blue-400 transition-all duration-500"
                  style={{ width: `${malePercent}%` }}
                />
                <div
                  className="bg-pink-400 transition-all duration-500"
                  style={{ width: `${femalePercent}%` }}
                />
              </div>
            )}

            {/* Male / Female breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{summary.male}</p>
                <p className="text-[11px] text-blue-500 mt-0.5 font-semibold uppercase tracking-wide">
                  ♂&nbsp; Male
                </p>
                <p className="text-[10px] text-blue-400 mt-0.5">{malePercent}%</p>
              </div>
              <div className="rounded-xl bg-pink-50 border border-pink-100 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-pink-700">{summary.female}</p>
                <p className="text-[11px] text-pink-500 mt-0.5 font-semibold uppercase tracking-wide">
                  ♀&nbsp; Female
                </p>
                <p className="text-[10px] text-pink-400 mt-0.5">{femalePercent}%</p>
              </div>
            </div>

            {/* Unspecified notice */}
            {summary.unspecified > 0 && (
              <p className="text-[11px] text-slate-400 text-center">
                +{summary.unspecified} student{summary.unspecified > 1 ? "s" : ""} with unspecified gender
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
