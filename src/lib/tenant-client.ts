// Tenant-scoped data + PIN auth helpers for the school app.
// PIN hashing happens SERVER-SIDE (bcrypt). Client sends plain PIN over HTTPS to SECURITY DEFINER RPCs.
// After verification, the server returns a short-lived session token used for all subsequent calls.

import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/auth-logger";

const SESSION_KEY = "schoolapp_tenant_session_v2";

export interface TenantSession {
  tenantId: string;
  schoolName: string;
  sessionToken: string;
  status: "trial" | "active" | "expired" | "suspended";
  plan: "trial" | "termly" | "yearly";
  subscriptionEndsAt: string | null;
  trialStartedAt: string | null;
  isAdmin: boolean;
  hasAdminPin: boolean;
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
export async function verifySchoolPin(pin: string): Promise<Omit<TenantSession, "isAdmin"> | null> {
  const { data, error } = await supabase.rpc("verify_school_pin_v2", { _pin: pin });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  const session = {
    tenantId: row.tenant_id,
    schoolName: row.school_name,
    sessionToken: row.session_token,
    status: row.status,
    plan: row.plan,
    subscriptionEndsAt: row.subscription_ends_at,
    trialStartedAt: row.trial_started_at,
    hasAdminPin: row.has_admin_pin,
  };
  
  // Log the tenant login
  await logAuthEvent({
    authType: "tenant",
    eventType: "login",
    tenantId: session.tenantId,
    sessionToken: session.sessionToken,
  });
  
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

export async function saveTenantData(session: TenantSession, data: unknown): Promise<boolean> {
  const { data: ok, error } = await supabase.rpc("save_tenant_data_v2", {
    _session_token: session.sessionToken,
    _data: data as never,
  });
  return !error && ok === true;
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
