import { supabase } from "@/integrations/supabase/client";

interface LogAuthEventParams {
  authType: "super_admin" | "tenant" | "staff";
  eventType: "login" | "logout";
  userId?: string;
  tenantId?: string;
  staffId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionToken?: string;
}

/**
 * Logs authentication events (login/logout) to the database for audit trails
 */
export async function logAuthEvent({
  authType,
  eventType,
  userId,
  tenantId,
  staffId,
  ipAddress,
  userAgent,
  sessionToken,
}: LogAuthEventParams) {
  try {
    // Get client IP address if not provided
    let ip = ipAddress;
    if (!ip) {
      try {
        const response = await fetch("https://api.ipify.org?format=json").catch(() => null);
        if (response?.ok) {
          const data = await response.json();
          ip = data.ip;
        }
      } catch (e) {
        // Silently fail to get IP, continue with logging anyway
      }
    }

    // Get user agent if not provided
    const ua = userAgent || navigator.userAgent;

    // Call the database function
    const { error } = await (supabase.rpc as any)("log_auth_event", {
      _auth_type: authType,
      _event_type: eventType,
      _user_id: userId || null,
      _tenant_id: tenantId || null,
      _staff_id: staffId || null,
      _ip_address: ip || null,
      _user_agent: ua,
      _session_token: sessionToken || null,
    });

    if (error) {
      console.warn("Failed to log auth event:", error);
      // Don't throw - auth should succeed even if logging fails
    }
  } catch (e) {
    console.warn("Error logging auth event:", e);
    // Silently fail - don't block auth flows
  }
}

/**
 * Get login history for a specific user/tenant/staff
 */
export async function getLoginHistory(
  authType: "super_admin" | "tenant" | "staff",
  identifier: string,
  limit: number = 50
) {
  try {
    const { data, error } = await supabase.rpc("get_login_history", {
      _auth_type: authType,
      _identifier: identifier,
      _limit: limit,
    });

    if (error) {
      console.warn("Failed to fetch login history:", error);
      return [];
    }

    return data || [];
  } catch (e) {
    console.warn("Error fetching login history:", e);
    return [];
  }
}

/**
 * Get the current client's IP address
 */
export async function getCurrentClientIp(): Promise<string | null> {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    if (response.ok) {
      const data = await response.json();
      return data.ip;
    }
  } catch (e) {
    console.warn("Failed to fetch client IP:", e);
  }
  return null;
}
