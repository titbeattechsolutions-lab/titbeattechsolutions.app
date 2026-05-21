import { useState, useMemo } from "react";
import { useApp } from "@/lib/school-store";
import LoginActivityDashboard from "@/components/LoginActivityDashboard";
import { GraduationCap, Users, BookOpen, ClipboardList, TrendingUp } from "lucide-react";

export default function DashboardTab() {
  const { state } = useApp();
  const { entries, staffList, attendance, schoolSettings, classRolls } = state;

  const stats = useMemo(() => {
    const totalStudents = Object.values(classRolls).reduce((sum, roll) => sum + roll.length, 0);
    const activeStaff = staffList.filter((s) => s.status === "active").length;
    const todayAtt = attendance.filter((a) => a.date === new Date().toISOString().slice(0, 10));
    const presentToday = todayAtt.filter((a) => a.status === "present").length;
    return { totalStudents, activeStaff, totalEntries: entries.length, presentToday };
  }, [entries, staffList, attendance, classRolls]);

  const recentEntries = useMemo(() => entries.slice(-5).reverse(), [entries]);

  return (
    <div className="p-4 space-y-6 pb-8">
      {/* Header */}
      <div className="pt-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{schoolSettings.name}</h1>
            <p className="text-xs text-muted-foreground">{schoolSettings.session} · {schoolSettings.term}</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Users, label: "Students", value: stats.totalStudents, accent: "bg-primary/10 text-primary" },
          { icon: BookOpen, label: "Staff Active", value: stats.activeStaff, accent: "bg-accent/10 text-accent" },
          { icon: ClipboardList, label: "Score Records", value: stats.totalEntries, accent: "bg-warning/10 text-warning" },
          { icon: TrendingUp, label: "Present Today", value: stats.presentToday, accent: "bg-primary/10 text-primary" },
        ].map(({ icon: Icon, label, value, accent }) => (
          <div key={label} className="mobile-card p-4">
            <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-3`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Quick Info */}
      <div className="mobile-card p-4 space-y-3">
        <p className="section-title">School Info</p>
        <div className="space-y-2">
          {[
            { label: "Motto", value: schoolSettings.motto },
            { label: "Resumption", value: schoolSettings.resumptionDate },
            { label: "Term", value: schoolSettings.term },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-border last:border-0">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm font-semibold text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Entries */}
      {recentEntries.length > 0 && (
        <div className="space-y-3">
          <p className="section-title px-1">Recent Score Entries</p>
          <div className="space-y-2">
            {recentEntries.map((e) => (
              <div key={e.id} className="mobile-card p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{e.total}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{e.studentName}</p>
                  <p className="text-xs text-muted-foreground truncate">{e.subject} · {e.studentClass}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">No records yet</p>
          <p className="text-xs text-muted-foreground mt-1">Start by adding score entries</p>
        </div>
      )}
    </div>
  );
}
