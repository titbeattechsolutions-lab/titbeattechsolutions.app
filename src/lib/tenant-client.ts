// Tenant-scoped data + PIN auth helpers for the school app.
// All school data is loaded/saved via SECURITY DEFINER RPCs gated by school PIN hash.

import { supabase } from "@/integrations/supabase/client";
import { hashPin } from "./crypto-helpers";

const SESSION_KEY = "schoolapp_tenant_session_v1";

export interface TenantSession {
  tenantId: string;
  schoolName: string;
  schoolPinHash: string;
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
  const pinHash = await hashPin(pin);
  const { data, error } = await supabase.rpc("verify_school_pin", { _pin_hash: pinHash });
  if (error || !data || data.length === 0) return null;
  const row = data[0];
  return {
    tenantId: row.tenant_id,
    schoolName: row.school_name,
    schoolPinHash: pinHash,
    status: row.status,
    plan: row.plan,
    subscriptionEndsAt: row.subscription_ends_at,
    trialStartedAt: row.trial_started_at,
    hasAdminPin: row.has_admin_pin,
  };
}

export async function verifyAdminPin(tenantId: string, pin: string): Promise<boolean> {
  const pinHash = await hashPin(pin);
  const { data, error } = await supabase.rpc("verify_admin_pin", {
    _tenant_id: tenantId,
    _pin_hash: pinHash,
  });
  return !error && data === true;
}

/** First-time admin PIN setup — only succeeds if no admin pin set yet. */
export async function setAdminPin(tenantId: string, pin: string): Promise<boolean> {
  const pinHash = await hashPin(pin);
  const { data, error } = await supabase.rpc("set_admin_pin", {
    _tenant_id: tenantId,
    _pin_hash: pinHash,
  });
  return !error && data === true;
}

export async function fetchTenantData(session: TenantSession): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.rpc("get_tenant_data", {
    _tenant_id: session.tenantId,
    _school_pin_hash: session.schoolPinHash,
  });
  if (error) return null;
  return (data as Record<string, unknown>) ?? {};
}

export async function saveTenantData(session: TenantSession, data: unknown): Promise<boolean> {
  const { data: ok, error } = await supabase.rpc("save_tenant_data", {
    _tenant_id: session.tenantId,
    _school_pin_hash: session.schoolPinHash,
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
