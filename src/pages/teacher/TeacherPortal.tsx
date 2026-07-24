import { useSchool } from "@/hooks/useSchool";
import TeacherLayout from "@/layouts/TeacherLayout";
import { Loader2 } from "lucide-react";

export default function TeacherPortal() {
  const { school, loading } = useSchool();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="animate-spin text-slate-400 h-8 w-8" />
      </div>
    );
  }

  return <TeacherLayout schoolName={school?.name} schoolLogo={school?.logo} />;
}
