import { useSchool } from "@/hooks/useSchool";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Loader2 } from "lucide-react";

export default function SchoolDashboard() {
  const { school, loading } = useSchool();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="animate-spin text-slate-400 h-8 w-8" />
      </div>
    );
  }

  return (
    <DashboardLayout
      schoolName={school?.name}
      plan={school ? undefined : undefined}
      features={school?.features as Record<string, boolean> | undefined}
    />
  );
}
