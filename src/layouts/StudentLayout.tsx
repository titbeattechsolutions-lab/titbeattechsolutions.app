import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarClock, UserCircle, Menu, X, LogOut, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/student/timetable", label: "Timetable", icon: CalendarClock },
  { to: "/student/profile",   label: "Profile",   icon: UserCircle },
];

export default function StudentLayout({ schoolName, schoolLogo }: { schoolName?: string; schoolLogo?: string | null }) {
  const [open, setOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const initials = [profile?.firstName, profile?.lastName]
    .filter(Boolean).map((s) => s![0].toUpperCase()).join("")
    || profile?.email?.[0]?.toUpperCase() || "?";

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={cn(
      "flex flex-col bg-emerald-900 text-white",
      mobile ? "fixed inset-y-0 left-0 z-50 w-60" : "hidden lg:flex w-60 min-h-screen"
    )}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-emerald-700">
        <div className="flex items-center gap-3">
          {schoolLogo ? (
            <img src={schoolLogo} alt={`${schoolName} Logo`} className="h-8 w-auto object-contain shrink-0 rounded" />
          ) : (
            <div className="h-8 w-8 shrink-0 bg-white/10 rounded flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-emerald-300" />
            </div>
          )}
          <div>
            <p className="text-xs text-emerald-300 font-medium uppercase tracking-wider">Student Portal</p>
            <p className="text-sm font-semibold text-white truncate max-w-[150px]">{schoolName ?? "—"}</p>
          </div>
        </div>
        {mobile && (
          <button onClick={() => setOpen(false)} className="text-emerald-300 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => mobile && setOpen(false)}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-emerald-700 text-white" : "text-emerald-300 hover:bg-emerald-800 hover:text-white"
            )}
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
      <SidebarContent />

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
          <SidebarContent mobile />
        </>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
          <button className="lg:hidden text-slate-500 hover:text-slate-800" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 ml-auto">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-emerald-700 text-white text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-sm font-medium text-slate-700">
                  {profile?.firstName
                    ? `${profile.firstName} ${profile.lastName ?? ""}`.trim()
                    : profile?.email ?? "Student"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled className="text-xs text-slate-500">{profile?.email}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 focus:text-red-600 cursor-pointer" onClick={handleSignOut}>
                <LogOut size={14} className="mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
