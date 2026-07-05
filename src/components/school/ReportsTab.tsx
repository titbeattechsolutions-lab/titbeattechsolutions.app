import { useState, useMemo } from "react";
import { useApp } from "@/lib/school-store";
import { getGrade } from "@/lib/school-helpers";
import { ALL_CLASSES, getSubjectsForClass } from "@/lib/school-constants";
import { FileText, Search, Printer } from "lucide-react";

export default function ReportsTab() {
  const { state } = useApp();
  const { entries, schoolSettings, staffList } = state;

  const [selectedClass, setSelectedClass] = useState("");
  const [search, setSearch] = useState("");

  const students = useMemo(() => {
    if (!selectedClass) return [];
    const classEntries = entries.filter((e) => e.studentClass === selectedClass);
    const names = [...new Set(classEntries.map((e) => e.studentName))];
    return names.map((name) => {
      const studentEntries = classEntries.filter((e) => e.studentName === name);
      const avg = studentEntries.length
        ? Math.round(studentEntries.reduce((s, e) => s + e.total, 0) / studentEntries.length)
        : 0;
      return { name, entries: studentEntries, avg, grade: getGrade(avg) };
    }).sort((a, b) => b.avg - a.avg);
  }, [entries, selectedClass]);

  const filtered = useMemo(() =>
    students.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase())),
    [students, search]
  );

  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  const studentDetail = useMemo(() => {
    if (!selectedStudent) return null;
    return students.find((s) => s.name === selectedStudent) || null;
  }, [selectedStudent, students]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Reports</h2>

        <select value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setSelectedStudent(null); }}
          className="input-field">
          <option value="">Select class</option>
          {ALL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {selectedClass && students.length > 0 && !selectedStudent && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student..."
              className="input-field pl-10" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {!selectedClass ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Select a class to view reports</p>
          </div>
        ) : selectedStudent && studentDetail ? (
          /* Student detail report */
          <div className="space-y-4">
            <button onClick={() => setSelectedStudent(null)} className="text-xs font-bold text-primary">← Back to list</button>

            <div id="report-print-area" className="mobile-card p-5">
              <div className="text-center mb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{schoolSettings.name}</p>
                <h3 className="text-lg font-bold mt-1">{studentDetail.name}</h3>
                <p className="text-xs text-muted-foreground">{selectedClass} · {schoolSettings.term} · {schoolSettings.session}</p>
              </div>

              <div className="flex justify-center gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{studentDetail.avg}%</p>
                  <p className="text-xs text-muted-foreground">Average</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl font-bold ${studentDetail.grade.color}`}>{studentDetail.grade.grade}</p>
                  <p className="text-xs text-muted-foreground">Grade</p>
                </div>
              </div>

              {/* Subject breakdown */}
              <div className="space-y-2">
                <p className="section-title">Subject Scores</p>
                {studentDetail.entries.map((e) => {
                  const g = getGrade(e.total);
                  return (
                    <div key={e.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.subject}</p>
                        <p className="text-xs text-muted-foreground">CA: {e.ca1}+{e.ca2}+{e.ca3} | Exam: {e.exam}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className={`text-sm font-bold ${g.color}`}>{e.total}%</p>
                        <p className="text-xs text-muted-foreground">{g.grade}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Staff Signature Section */}
              {(() => {
                const staffMember = studentDetail.entries[0]?.enteredBy ? staffList.find((s) => s.name === studentDetail.entries[0].enteredBy) : null;
                return staffMember?.signature ? (
                  <div className="mt-6 pt-6 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Staff Authorization</p>
                    <div className="flex items-end justify-between">
                      <div>
                        <img src={staffMember.signature} alt="Signature" className="h-16 object-contain" />
                        <div className="mt-2">
                          <p className="text-xs font-semibold">{staffMember.name}</p>
                          <p className="text-xs text-muted-foreground">{staffMember.role}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString()}</p>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>

            <button onClick={() => window.print()}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
              <Printer className="w-4 h-4" /> Print Report
            </button>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm font-semibold">No score records for this class</p>
            <p className="text-xs text-muted-foreground mt-1">Add score entries first</p>
          </div>
        ) : (
          /* Student list */
          <div className="space-y-2">
            {filtered.map((s, i) => (
              <div key={s.name} onClick={() => setSelectedStudent(s.name)}
                className="mobile-card p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform">
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.entries.length} subjects</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${s.grade.color}`}>{s.avg}%</p>
                  <p className="text-xs text-muted-foreground">{s.grade.grade}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
