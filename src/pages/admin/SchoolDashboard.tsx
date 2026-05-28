import { useSchool } from "@/hooks/useSchool";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Loader2, WifiOff } from "lucide-react";

export default function SchoolDashboard() {
  const { school, loading, error } = useSchool();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="animate-spin text-slate-400 h-8 w-8" />
      </div>
    );
  }

  if (error && !school) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
        <WifiOff className="text-slate-400 h-10 w-10" />
        <p className="text-slate-700 font-semibold text-lg">Could not reach the server</p>
        <p className="text-slate-400 text-sm max-w-xs text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <DashboardLayout
      schoolName={school?.name}
      plan={undefined}
      features={school?.features as Record<string, boolean> | undefined}
    />
  );
}
