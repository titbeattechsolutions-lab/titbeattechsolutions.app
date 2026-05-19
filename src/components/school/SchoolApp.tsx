import { useReducer, useEffect, useRef, useState, useCallback } from "react";
import { appReducer, loadFromStorage, saveToStorage, AppCtx } from "@/lib/school-store";
import { useToastHook } from "@/hooks/use-app-toast";
import AppToast from "@/components/school/AppToast";
import DashboardTab from "@/components/school/DashboardTab";
import ScoresTab from "@/components/school/ScoresTab";
import AttendanceTab from "@/components/school/AttendanceTab";
import StaffTab from "@/components/school/StaffTab";
import ReportsTab from "@/components/school/ReportsTab";
import ESignatureTab from "@/components/school/ESignatureTab";
import SettingsTab from "@/components/school/SettingsTab";
import { LayoutDashboard, ClipboardList, CalendarDays, Users, FileText, PenTool, Settings } from "lucide-react";

const TABS = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "scores", label: "Scores", icon: ClipboardList },
  { id: "attendance", label: "Attend", icon: CalendarDays },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "staff", label: "Staff", icon: Users },
  { id: "esignature", label: "Signature", icon: PenTool },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type TabId = typeof TABS[number]["id"];

export default function SchoolApp() {
  const [state, dispatch] = useReducer(appReducer, loadFromStorage());
  const { toast, showToast } = useToastHook();
  const [tab, setTab] = useState<TabId>("dashboard");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-save on state change
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToStorage(state), 500);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  const ctxValue = { state, dispatch, showToast };

  return (
    <AppCtx.Provider value={ctxValue}>
      <div className="app-shell bg-background">
        {/* Content */}
        <div className="app-content">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "scores" && <ScoresTab />}
          {tab === "attendance" && <AttendanceTab />}
          {tab === "reports" && <ReportsTab />}
          {tab === "staff" && <StaffTab />}
          {tab === "esignature" && <ESignatureTab />}
          {tab === "settings" && <SettingsTab />}
        </div>

        {/* Bottom Nav */}
        <nav className="bottom-nav">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`bottom-nav-item ${tab === id ? "active" : ""}`}>
              <Icon className="w-5 h-5" strokeWidth={tab === id ? 2.5 : 1.5} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </nav>

        {/* Toast */}
        {toast && <AppToast toast={toast} />}
      </div>
    </AppCtx.Provider>
  );
}
