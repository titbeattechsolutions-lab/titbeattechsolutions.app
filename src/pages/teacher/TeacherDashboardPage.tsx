import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/hooks/useSchool";
import { BookOpen, ClipboardCheck, BarChart2, CalendarClock, UserCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DASHBOARD_ACTIONS = [
  {
    to: "/teacher/classes",
    label: "My Classes",
    description: "View and manage your assigned classes.",
    icon: BookOpen,
    color: "bg-blue-100 text-blue-600",
  },
  {
    to: "/teacher/attendance",
    label: "Attendance",
    description: "Mark daily student attendance.",
    icon: ClipboardCheck,
    color: "bg-emerald-100 text-emerald-600",
  },
  {
    to: "/teacher/results",
    label: "Results Entry",
    description: "Upload and manage student CA and exam scores.",
    icon: BarChart2,
    color: "bg-purple-100 text-purple-600",
  },
  {
    to: "/teacher/timetable",
    label: "Timetable",
    description: "View your weekly teaching schedule.",
    icon: CalendarClock,
    color: "bg-orange-100 text-orange-600",
  },
  {
    to: "/teacher/profile",
    label: "My Profile",
    description: "Update your personal and contact details.",
    icon: UserCircle,
    color: "bg-slate-100 text-slate-600",
  },
];

export default function TeacherDashboardPage() {
  const { profile } = useAuth();
  const { school } = useSchool();

  const firstName = profile?.firstName || "Teacher";
  
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Hero Section */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-60 pointer-events-none" />
        
        <div className="relative z-10 space-y-2 text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
            Welcome back, {firstName}! 👋
          </h1>
          <p className="text-slate-500 text-sm sm:text-base">
            What would you like to manage for <span className="font-medium text-slate-700">{school?.name || "your school"}</span> today?
          </p>
        </div>
        
        {school?.logo && (
          <div className="relative z-10 shrink-0 bg-white p-2 rounded-xl shadow-sm border border-slate-100">
            <img src={school.logo} alt="School Logo" className="w-16 h-16 object-contain" />
          </div>
        )}
      </div>

      {/* Super-App Action Grid */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 px-1">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DASHBOARD_ACTIONS.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="group block bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-100 transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className={cn("p-3 rounded-xl", action.color)}>
                  <action.icon size={24} strokeWidth={2} />
                </div>
                <div className="text-slate-300 group-hover:text-indigo-600 transition-colors">
                  <ArrowRight size={20} />
                </div>
              </div>
              
              <div className="mt-4 space-y-1">
                <h3 className="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">
                  {action.label}
                </h3>
                <p className="text-slate-500 text-sm leading-snug">
                  {action.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
      
      {/* Promotional / Status Zone (OPay Style) */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 shadow-sm text-white flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-lg">Offline Mode Enabled</h3>
          <p className="text-emerald-50 text-sm max-w-md mt-1">
            Your recent data is safely cached. You can continue viewing your timetable and classes even if you lose your internet connection.
          </p>
        </div>
      </div>
    </div>
  );
}
