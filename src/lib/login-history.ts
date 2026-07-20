import { supabase } from "@/integrations/supabase/client";

interface LoginHistoryParams {
  authType: "super_admin" | "tenant" | "staff";
  identifier: string; // user_id, tenant_id, or staff_id
  limit?: number;
}

export interface LoginRecord {
  id: number;
  event_type: "login" | "logout";
  timestamp: string;
  ip_address: string | null;
  user_agent: string | null;
  auth_type: "super_admin" | "tenant" | "staff";
  location: string | null;
  is_suspicious: boolean;
}

/**
 * Fetch login/logout history for a user, tenant, or staff member
 */
export async function fetchLoginHistory({
  authType,
  identifier,
  limit = 50,
}: LoginHistoryParams): Promise<LoginRecord[]> {
  try {
    // Use the RPC function we created in the migration
    const { data, error } = await supabase.rpc("get_login_history", {
      _auth_type: authType,
      _identifier: identifier,
      _limit: limit,
    });

    if (error) {
      console.error("Error fetching login history:", error);
      return [];
    }

    // Map the response to our interface
    return (
      data?.map((record: any) => ({
        id: record.id,
        event_type: record.event_type,
        timestamp: record.timestamp,
        ip_address: record.ip_address,
        user_agent: record.user_agent,
        auth_type: authType,
        location: record.location,
        is_suspicious: record.is_suspicious || false,
      })) || []
    );
  } catch (err) {
    console.error("Exception fetching login history:", err);
    return [];
  }
}

/**
 * Get a summary of recent activity
 */
export async function getActivitySummary(
  authType: "super_admin" | "tenant" | "staff",
  identifier: string
): Promise<{
  totalLogins: number;
  lastLogin: string | null;
  lastLogout: string | null;
  activeSessions: number;
}> {
  try {
    const records = await fetchLoginHistory({
      authType,
      identifier,
      limit: 100,
    });

    const logins = records.filter((r) => r.event_type === "login");
    const logouts = records.filter((r) => r.event_type === "logout");

    // Count active sessions (logins without matching logout)
    let activeSessions = 0;
    for (const login of logins) {
      const hasLogout = logouts.some(
        (logout) => new Date(logout.timestamp) > new Date(login.timestamp)
      );
      if (!hasLogout) {
        activeSessions++;
      }
    }

    return {
      totalLogins: logins.length,
      lastLogin: logins[0]?.timestamp || null,
      lastLogout: logouts[0]?.timestamp || null,
      activeSessions,
    };
  } catch (err) {
    console.error("Error getting activity summary:", err);
    return {
      totalLogins: 0,
      lastLogin: null,
      lastLogout: null,
      activeSessions: 0,
    };
  }
}
