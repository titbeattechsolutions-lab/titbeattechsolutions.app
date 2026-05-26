import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, School, Users, GraduationCap, CreditCard } from "lucide-react";
import SessionLog from "@/components/SessionLog";

interface Stats {
  totalSchools: number;
  activeSchools: number;
  suspendedSchools: number;
  totalStudents: number;
  totalTeachers: number;
  totalPaymentsSuccess: number;
  totalRevenueCollected: number;
  schoolsOnStarter: number;
  schoolsOnPro: number;
  schoolsOnEnterprise: number;
}

export default function PlatformStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const [schoolsRes, studentsRes, teachersRes, paymentsRes, billingRes] = await Promise.allSettled([
        db.from("schools").select("id,status", { count: "exact" }),
        db.from("students").select("id", { count: "exact" }),
        db.from("teachers").select("id", { count: "exact" }),
        db.from("payments").select("amount,status").eq("status", "success"),
        db.from("billing").select("plan"),
      ]);

      const schools = schoolsRes.status === "fulfilled" ? (schoolsRes.value.data ?? []) as { id: string; status: string }[] : [];
      const studentsCount = studentsRes.status === "fulfilled" ? (studentsRes.value.count ?? 0) : 0;
      const teachersCount = teachersRes.status === "fulfilled" ? (teachersRes.value.count ?? 0) : 0;
      const payments = paymentsRes.status === "fulfilled" ? (paymentsRes.value.data ?? []) as { amount: number; status: string }[] : [];
      const billing = billingRes.status === "fulfilled" ? (billingRes.value.data ?? []) as { plan: string }[] : [];

      setStats({
        totalSchools: schools.length,
        activeSchools: schools.filter((s) => s.status === "active").length,
        suspendedSchools: schools.filter((s) => s.status === "suspended").length,
        totalStudents: studentsCount,
        totalTeachers: teachersCount,
        totalPaymentsSuccess: payments.length,
        totalRevenueCollected: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        schoolsOnStarter: billing.filter((b) => b.plan === "starter").length,
        schoolsOnPro: billing.filter((b) => b.plan === "pro").length,
        schoolsOnEnterprise: billing.filter((b) => b.plan === "enterprise").length,
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!stats) return null;

  const cards = [
    { label: "Total Schools",        value: stats.totalSchools,            icon: School,       color: "bg-violet-50 text-violet-600" },
    { label: "Active Schools",        value: stats.activeSchools,           icon: School,       color: "bg-emerald-50 text-emerald-600" },
    { label: "Suspended",             value: stats.suspendedSchools,        icon: School,       color: "bg-red-50 text-red-600" },
    { label: "Total Students",        value: stats.totalStudents,           icon: Users,        color: "bg-blue-50 text-blue-600" },
    { label: "Total Teachers",        value: stats.totalTeachers,           icon: GraduationCap,color: "bg-indigo-50 text-indigo-600" },
    { label: "Successful Payments",   value: stats.totalPaymentsSuccess,    icon: CreditCard,   color: "bg-teal-50 text-teal-600" },
    { label: "Revenue Collected (₦)", value: stats.totalRevenueCollected.toLocaleString("en-NG"), icon: CreditCard, color: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">Platform Stats</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${c.color}`}>
                  <c.icon size={16} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{c.label}</p>
                  <p className="text-2xl font-bold text-slate-800">{c.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan distribution */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Plan Distribution</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { plan: "Starter", count: stats.schoolsOnStarter,    color: "border-amber-300 bg-amber-50 text-amber-700" },
            { plan: "Pro",     count: stats.schoolsOnPro,        color: "border-blue-300 bg-blue-50 text-blue-700" },
            { plan: "Enterprise", count: stats.schoolsOnEnterprise, color: "border-violet-300 bg-violet-50 text-violet-700" },
          ].map((p) => (
            <div key={p.plan} className={`rounded-xl border-2 p-4 text-center ${p.color}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">{p.plan}</p>
              <p className="text-3xl font-bold mt-1">{p.count}</p>
              <p className="text-xs mt-0.5">school{p.count !== 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Platform Session Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Platform Session Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionLog superadmin />
        </CardContent>
      </Card>
    </div>
  );
}
