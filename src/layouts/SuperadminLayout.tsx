import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  School, PlusCircle, CreditCard, Activity, BarChart2,
  Menu, X, LogOut, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/superadmin/schools",   label: "Schools",         icon: School },
  { to: "/superadmin/provision", label: "Provision School", icon: PlusCircle },
  { to: "/superadmin/billing",   label: "Billing",         icon: CreditCard },
  { to: "/superadmin/activity",  label: "Activity Log",    icon: Activity },
  { to: "/superadmin/stats",     label: "Platform Stats",  icon: BarChart2 },
];

export default function SuperadminLayout() {
  const [open, setOpen] = useState(false);
  const [pendingDeletions, setPendingDeletions] = useState(0);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("tenant_deletion_requests")
      .select("id", { count: "exact" })
      .eq("status", "pending")
      .then(({ count }) => {
        if (count) setPendingDeletions(count);
      });
  }, []);

  const handleSignOut = async () => { await signOut(); navigate("/auth"); };

  const initials = [profile?.firstName, profile?.lastName]
    .filter(Boolean).map((s) => s![0].toUpperCase()).join("")
    || profile?.email?.[0]?.toUpperCase() || "SA";

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={cn(
      "flex flex-col bg-gray-950 text-white",
      mobile ? "fixed inset-y-0 left-0 z-50 w-64" : "hidden lg:flex w-64 min-h-screen"
    )}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Titbeattechsolutions Logo" className="h-8 w-auto object-contain shrink-0" />
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Superadmin</p>
            <p className="text-sm font-semibold text-white">SchoolGradeFlow</p>
          </div>
        </div>
        {mobile && (
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
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
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-gray-300 hover:bg-gray-900 hover:text-white"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.label === "Schools" && pendingDeletions > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {pendingDeletions}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-4">
        <div className="border-t border-gray-800 pt-3">
          <NavLink
            to="/admin"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            ← Legacy Panel
          </NavLink>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <SidebarContent />
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
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
                  <AvatarFallback className="bg-violet-700 text-white text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-sm font-medium text-slate-700">
                  {profile?.email ?? "Superadmin"}
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
