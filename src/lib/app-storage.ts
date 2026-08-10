/**
 * app-storage.ts
 * Unified storage utility for the school app state blob.
 *
 * Strategy:
 *  1. Try localStorage first (synchronous-feel, fast).
 *  2. On QuotaExceededError, transparently fall back to IndexedDB via idb-keyval.
 *  3. Reads check localStorage first, then IndexedDB (for continuity after fallback).
 *  4. Clears wipe both stores simultaneously.
 *
 * The DB_KEY and JSON format are IDENTICAL to before — no data migration needed.
 */

import { get, set, del } from "idb-keyval";

export const DB_KEY = "greatmind_school_db_v2";
const IDB_KEY = "greatmind_school_db_v2_idb";

/** Read the app state string. Checks localStorage first, then IndexedDB. */
export async function getAppState(): Promise<string | null> {
  try {
    const lsVal = localStorage.getItem(DB_KEY);
    if (lsVal) return lsVal;
  } catch {
    // localStorage inaccessible (e.g. private browsing in some browsers)
  }
  // Fall back to IndexedDB
  try {
    const idbVal = await get<string>(IDB_KEY);
    return idbVal ?? null;
  } catch {
    return null;
  }
}

/** Read the app state synchronously from localStorage only (for initial render). */
export function getAppStateSync(): string | null {
  try {
    return localStorage.getItem(DB_KEY);
  } catch {
    return null;
  }
}

/** Write the app state string. Tries localStorage; falls back to IndexedDB on quota error. */
export async function setAppState(value: string): Promise<{ usedIdb: boolean }> {
  // Try localStorage first
  try {
    localStorage.setItem(DB_KEY, value);
    // Clear any stale IDB entry when LS succeeds
    del(IDB_KEY).catch(() => {});
    return { usedIdb: false };
  } catch (err: any) {
    const isQuota =
      err?.name === "QuotaExceededError" ||
      err?.code === 22 ||
      err?.code === 1014;

    if (!isQuota) {
      console.warn("[app-storage] localStorage write failed (non-quota):", err);
    }

    // Fall back to IndexedDB
    try {
      await set(IDB_KEY, value);
      return { usedIdb: true };
    } catch (idbErr) {
      console.error("[app-storage] Both localStorage and IndexedDB failed:", idbErr);
      throw idbErr; // Caller should show a toast
    }
  }
}

/** Synchronous localStorage write — use only where async is not feasible. */
export function setAppStateSync(value: string): void {
  try {
    localStorage.setItem(DB_KEY, value);
  } catch {
    // Silent — the async setAppState is the primary path
  }
}

/** Clear the app state from BOTH stores (used on logout/suspension). */
export async function clearAppState(): Promise<void> {
  // Wipe ALL tenant-specific keys so no data bleeds across tenants.
  const TENANT_KEYS = [
    DB_KEY,
    "sf_fees_v2",
    "sf_fee_structure_v2",
    "saved_resources",
    "gm_score_drafts_v1",
    "app_tour_completed",
    "gm_last_tenant_id",
  ];
  for (const key of TENANT_KEYS) {
    try { localStorage.removeItem(key); } catch {}
  }
  try { await del(IDB_KEY); } catch {}
}

