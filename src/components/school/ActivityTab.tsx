import { useMemo } from "react";
import { useApp } from "@/lib/school-store";
import type { ActivityLog } from "@/lib/school-store";
import { LogIn, LogOut, Filter, Clock } from "lucide-react";

export default function ActivityTab() {
  const { state, dispatch } = useApp();
  const { activityLogs, staffList } = state;

  // Get current logged-in staff member
  const currentStaffId = useMemo(() => {
    try {
      const session = JSON.parse(localStorage.getItem("school_staff_session") || "{}");
      return session.staffId;
    } catch {
      return null;
    }
  }, []);

  const isAdmin = useMemo(() => {
    try {
      const session = JSON.parse(localStorage.getItem("school_staff_session") || "{}");
      return session.isAdmin || false;
    } catch {
      return false;
    }
  }, []);

  // Filter logs - admin sees all, staff sees only their own
  const filteredLogs = useMemo(() => {
    if (isAdmin) return activityLogs;
    if (currentStaffId) {
      return activityLogs.filter((log) => log.staffId === currentStaffId);
    }
    return [];
  }, [activityLogs, isAdmin, currentStaffId]);

  // Group logs by date
  const groupedLogs = useMemo(() => {
    const groups: Record<string, ActivityLog[]> = {};
    filteredLogs.forEach((log) => {
      const date = new Date(log.timestamp).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(log);
    });
    return groups;
  }, [filteredLogs]);

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getStaffName = (staffId: string) => {
    const staff = staffList.find((s) => s.id === staffId);
    return staff?.name || "Unknown";
  };

  if (!isAdmin && !currentStaffId) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="text-center py-16">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground mb-1">No activity logs</p>
          <p className="text-xs text-muted-foreground">Log in as a staff member to view activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-2 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Activity Log</h2>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "All staff activity" : "Your activity"}
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-semibold text-blue-900">Info</p>
          <p className="text-xs text-blue-800">
            {isAdmin 
              ? "Track login and logout times for all staff members to monitor access patterns." 
              : "Track your login and logout times to monitor your access history."}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">No activity recorded</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedLogs).map(([date, logs]) => (
              <div key={date}>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                  {date}
                </p>
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="mobile-card p-4 flex items-start gap-3"
                    >
                      <div
                        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          log.event === "login"
                            ? "bg-green-100"
                            : "bg-red-100"
                        }`}
                      >
                        {log.event === "login" ? (
                          <LogIn className="w-5 h-5 text-green-600" />
                        ) : (
                          <LogOut className="w-5 h-5 text-red-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">
                            {isAdmin ? getStaffName(log.staffId) : "You"}
                          </p>
                          <span
                            className={`text-xs font-bold px-2 py-1 rounded-full ${
                              log.event === "login"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {log.event === "login" ? "Logged In" : "Logged Out"}
                          </span>
                        </div>

                        {isAdmin && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {log.staffRole}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(log.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
