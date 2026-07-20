import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, LogIn, Loader2, AlertCircle } from "lucide-react";
import { fetchLoginHistory as getLoginHistory, type LoginRecord } from "@/lib/login-history";

interface LoginActivityProps {
  authType: "super_admin" | "tenant" | "staff";
  identifier: string; // user_id, tenant_id, or staff_id
  limit?: number;
  showIpAddress?: boolean;
}

export default function LoginActivityDashboard({
  authType,
  identifier,
  limit = 20,
  showIpAddress = true,
}: LoginActivityProps) {
  const [records, setRecords] = useState<LoginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLoginHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch from Supabase RPC
        const data = await getLoginHistory({
          authType,
          identifier,
          limit,
        });

        setRecords(data);
      } catch (err) {
        console.error("Error fetching login history:", err);
        setError(err instanceof Error ? err.message : "Failed to load activity");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };

    if (identifier) {
      loadLoginHistory();
    }
  }, [authType, identifier, limit]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getDuration = (loginRecord: LoginRecord, nextRecord: LoginRecord | undefined) => {
    if (!nextRecord || loginRecord.event_type !== "login") return null;
    
    const loginTime = new Date(loginRecord.timestamp).getTime();
    const logoutTime = new Date(nextRecord.timestamp).getTime();
    const durationMs = logoutTime - loginTime;
    
    if (durationMs < 60000) {
      return `${Math.round(durationMs / 1000)}s`;
    } else if (durationMs < 3600000) {
      return `${Math.round(durationMs / 60000)}m`;
    } else {
      return `${Math.round(durationMs / 3600000)}h ${Math.round((durationMs % 3600000) / 60000)}m`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading activity history...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-4 bg-destructive/10 border-destructive/20">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    );
  }

  if (records.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <p>No login/logout activity recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Event</th>
              <th className="px-4 py-3 text-left font-semibold">Timestamp</th>
              <th className="px-4 py-3 text-left font-semibold">Duration</th>
              {showIpAddress && (
                <>
                  <th className="px-4 py-3 text-left font-semibold">Location</th>
                  <th className="px-4 py-3 text-left font-semibold">IP Address</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => {
              const nextRecord = records[index + 1];
              const duration = getDuration(record, nextRecord);

              return (
                <tr
                  key={record.id}
                  className="border-b hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {record.event_type === "login" ? (
                        <>
                          <LogIn className="w-4 h-4 text-green-600" />
                          <Badge variant="outline" className="bg-green-50">
                            Login
                          </Badge>
                        </>
                      ) : (
                        <>
                          <LogOut className="w-4 h-4 text-orange-600" />
                          <Badge variant="outline" className="bg-orange-50">
                            Logout
                          </Badge>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono">
                    {formatTime(record.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {record.event_type === "login" && duration ? (
                      <span className="text-muted-foreground">{duration}</span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  {showIpAddress && (
                    <>
                      <td className="px-4 py-3 text-xs">
                        {record.is_suspicious ? (
                          <span className="flex items-center text-red-600 gap-1 font-medium bg-red-50 px-2 py-0.5 rounded w-max">
                            <AlertCircle size={12} />
                            {record.location || "Unknown"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{record.location || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                        {record.ip_address || "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
