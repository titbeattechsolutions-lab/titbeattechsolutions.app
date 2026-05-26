import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  BarChart2,
  Wallet,
  CreditCard,
  CalendarDays,
  CalendarClock,
  Megaphone,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronRight,
  PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  featureKey?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/school/overview",    label: "Overview",      icon: LayoutDashboard },
  { to: "/school/students",    label: "Students",      icon: Users },
  { to: "/school/teachers",    label: "Teachers",      icon: GraduationCap },
  { to: "/school/classes",     label: "Classes",       icon: BookOpen },
  { to: "/school/subjects",    label: "Subjects",      icon: ClipboardList },
  { to: "/school/attendance",  label: "Attendance",    icon: CalendarDays },
  { to: "/school/results",     label: "Results",       icon: BarChart2 },
  { to: "/school/fees",        label: "Fees",          icon: Wallet,      featureKey: "fees" },
  { to: "/school/payments",    label: "Payments",      icon: CreditCard,  featureKey: "fees" },
  { to: "/school/timetable",   label: "Timetable",     icon: CalendarClock },
  { to: "/school/events",      label: "Events",        icon: PartyPopper },
  { to: "/school/announcements",label: "Announcements",icon: Megaphone },
  { to: "/school/settings",    label: "Settings",      icon: Settings },
];

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

export default function DashboardLayout({ schoolName, plan, features }: {
  schoolName?: string;
  plan?: string;
  features?: Record<string, boolean>;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const initials = [profile?.firstName, profile?.lastName]
    .filter(Boolean)
    .map((s) => s![0].toUpperCase())
    .join("") || profile?.email?.[0]?.toUpperCase() || "?";

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.featureKey) return true;
    return features?.[item.featureKey] !== false;
  });

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside
      className={cn(
        "flex flex-col bg-slate-900 text-white",
        mobile
          ? "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200"
          : "hidden lg:flex w-64 min-h-screen"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">SchoolGradeFlow</p>
          <p className="text-sm font-semibold text-white truncate max-w-[160px]">
            {schoolName ?? "Loading…"}
          </p>
        </div>
        {mobile && (
          <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Plan badge */}
      {plan && (
        <div className="px-5 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                plan === "starter" ? "border-yellow-500 text-yellow-400" :
                plan === "pro" ? "border-blue-400 text-blue-300" :
                "border-emerald-400 text-emerald-300"
              )}
            >
              {PLAN_LABELS[plan] ?? plan}
            </Badge>
            {plan === "starter" && (
              <span className="text-xs text-slate-400 hover:text-white cursor-pointer">
                Upgrade →
              </span>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => mobile && setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )
            }
          >
            <item.icon size={16} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar mobile />
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden text-slate-500 hover:text-slate-800"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:flex items-center text-sm text-slate-500">
              <span className="font-medium text-slate-800">{schoolName ?? ""}</span>
              <ChevronRight size={14} className="mx-1" />
              <span>Dashboard</span>
            </div>
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-slate-700 text-white text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-sm font-medium text-slate-700">
                  {profile?.firstName
                    ? `${profile.firstName} ${profile.lastName ?? ""}`.trim()
                    : profile?.email ?? "Admin"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled className="text-xs text-slate-500">
                {profile?.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 cursor-pointer"
                onClick={handleSignOut}
              >
                <LogOut size={14} className="mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
