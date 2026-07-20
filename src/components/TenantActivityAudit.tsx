import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, LogIn, Loader2, Activity, Shield, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TenantActivityAuditProps {
  schoolId: string;
}

export default function TenantActivityAudit({ schoolId }: TenantActivityAuditProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activeStaffCount, setActiveStaffCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      
      try {
        // Fetch Login/Logout Logs (Modern Architecture)
        const { data: logins } = await supabase
          .from("session_logs")
          .select("*")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(50);
          
        // Fetch Granular Activity Logs (Modern Architecture)
        const { data: activities } = await supabase
          .from("activity_logs")
          .select("*")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(100);

        // Fetch Authoritative Staff Count
        const { data: staffCountData } = await supabase
          .rpc("get_tenant_staff_count", { _school_id: schoolId });

        if (logins) setAccessLogs(logins);
        if (activities) setActivityLogs(activities);
        if (staffCountData !== null) setActiveStaffCount(Number(staffCountData));
      } catch (err) {
        console.error("Error fetching tenant audit logs:", err);
      } finally {
        setLoading(false);
      }
    };

    if (schoolId) fetchLogs();
  }, [schoolId]);

  const formatTime = (isoString: string) => new Date(isoString).toLocaleString();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
        <p>Loading comprehensive audit logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Recent Actions</p>
              <p className="text-xl font-black text-slate-800">{activityLogs.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Total Access Events</p>
              <p className="text-xl font-black text-slate-800">{accessLogs.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Active Staff</p>
              <p className="text-xl font-black text-slate-800">
                {activeStaffCount}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="actions" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="actions">Granular Actions</TabsTrigger>
          <TabsTrigger value="access">Access Logs (Logins)</TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="mt-4">
          <Card className="overflow-hidden border-slate-200">
            {activityLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No granular activity recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Action</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Actor (Staff)</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Details</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{log.action}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <Badge variant="outline">{(log.details as any)?.actor || log.performed_by || "System"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : log.details) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{formatTime(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <Card className="overflow-hidden border-slate-200">
            {accessLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No access logs recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Event</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">User / Staff</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">IP Address</th>
                      <th className="px-4 py-3 text-left font-bold text-slate-600">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accessLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {log.action === "login" ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                <LogIn className="w-3 h-3 mr-1" /> Login
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                <LogOut className="w-3 h-3 mr-1" /> Logout
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 capitalize">
                            {log.role} {log.user_name ? `(${log.user_name})` : ""}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs font-mono">{log.ip_address || "—"}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{formatTime(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
