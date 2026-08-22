// Tenant-scoped data + PIN auth helpers for the school app.
// PIN hashing happens SERVER-SIDE (bcrypt). Client sends plain PIN over HTTPS to SECURITY DEFINER RPCs.
// After verification, the server returns a short-lived session token used for all subsequent calls.

import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "schoolapp_tenant_session_v2";

export interface TenantSession {
  tenantId: string;
  schoolName: string;
  sessionToken: string;
  status: "trial" | "active" | "expired" | "suspended";
  plan: "trial" | "termly" | "yearly";      // billing cycle
  planTier: string;                          // tier: micro | starter | growth | enterprise
  subscriptionEndsAt: string | null;
  trialStartedAt: string | null;
  isAdmin: boolean;
  hasAdminPin: boolean;
  ndprConsentGranted?: boolean;
}

export function loadTenantSession(): TenantSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTenantSession(s: TenantSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearTenantSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Verify school PIN. Returns session info (without admin flag) or null. */
export async function verifySchoolPin(tenantCode: string, pin: string): Promise<Omit<TenantSession, "isAdmin"> | null> {
  const { data, error } = await supabase.rpc("verify_school_pin_v4", { _tenant_code: tenantCode, _pin: pin });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  const session = {
    tenantId: row.tenant_id,
    schoolName: row.school_name,
    sessionToken: row.session_token,
    status: row.status,
    plan: row.plan,
    planTier: row.plan_tier ?? "starter",
    subscriptionEndsAt: row.subscription_ends_at,
    trialStartedAt: row.trial_started_at,
    hasAdminPin: row.has_admin_pin,
    ndprConsentGranted: row.ndpr_consent_granted ?? false,
  };
  
  return session;
}

export async function verifyAdminPin(session: TenantSession, pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("verify_admin_pin_v2", {
    _session_token: session.sessionToken,
    _pin: pin,
  });
  return !error && data === true;
}

/** First-time admin PIN setup — only succeeds if no admin pin set yet. */
export async function setAdminPin(session: TenantSession, pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_admin_pin_v2", {
    _session_token: session.sessionToken,
    _pin: pin,
  });
  return !error && data === true;
}

export async function fetchTenantData(session: TenantSession): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc("get_tenant_data_v2", {
    _session_token: session.sessionToken,
  });
  if (error) return null;
  return (data as Record<string, unknown>) ?? {};
}



export async function saveTenantDataV3(session: TenantSession, expectedRev: number, data: unknown): Promise<{ success: boolean; rev?: number; error?: string; currentData?: any }> {
  const { data: result, error } = await supabase.rpc("save_tenant_data_v3", {
    _session_token: session.sessionToken,
    _expected_rev: expectedRev,
    _data: data as never,
  });
  if (error) return { success: false, error: error.message };
  return result as any;
}

/** Days remaining on trial or subscription (negative if expired). */
export function daysRemaining(session: TenantSession): number | null {
  const end = session.subscriptionEndsAt
    ? new Date(session.subscriptionEndsAt)
    : session.status === "trial" && session.trialStartedAt
      ? new Date(new Date(session.trialStartedAt).getTime() + 7 * 86400_000)
      : null;
  if (!end) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400_000);
}

/**
 * Check whether the tenant session is still valid and return the live status.
 *
 * Calls the `check_tenant_session_status` SECURITY DEFINER RPC which:
 *   - validates the session token against `tenant_sessions`
 *   - returns the current live `status` from `tenants`
 *   - returns null if the token has been purged (e.g. by a superadmin suspend)
 *
 * Return values:
 *   'active' | 'trial'              → session is healthy
 *   'suspended' | 'expired'         → access should be revoked
 *   null                            → token missing or session was deleted
 */
export async function checkTenantStatus(
  session: TenantSession
): Promise<"active" | "trial" | "suspended" | "expired" | "offline" | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return "offline";
  }
  try {
    const { data, error } = await supabase.rpc("check_tenant_session_status", {
      _session_token: session.sessionToken,
    });
    if (error) {
      if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError") || error.code === "PGRST000") {
        return "offline";
      }
      return null;
    }
    return (data as "active" | "trial" | "suspended" | "expired" | null) ?? null;
  } catch (err: any) {
    if (err?.message?.includes("Failed to fetch") || err?.message?.includes("NetworkError")) {
      return "offline";
    }
    return null;
  }
}

export async function requestCloudDeletion(session: TenantSession): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc("request_tenant_deletion", {
    _session_token: session.sessionToken,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function cancelCloudDeletion(session: TenantSession): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc("cancel_tenant_deletion", {
    _session_token: session.sessionToken,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function fetchCloudDeletionStatus(session: TenantSession): Promise<{ status: string | null; requestedAt: string | null }> {
  const { data, error } = await supabase.rpc("fetch_deletion_request_status", {
    _session_token: session.sessionToken,
  });
  if (error || !data || data.length === 0) return { status: null, requestedAt: null };
  return { status: data[0]?.status ?? null, requestedAt: data[0]?.requested_at ?? null };
}

export async function acceptNdprConsent(sessionToken: string): Promise<boolean> {
  const { error } = await supabase.rpc("accept_ndpr_consent", { _session_token: sessionToken });
  return !error;
}
