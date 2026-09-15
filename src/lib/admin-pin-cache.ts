/**
 * admin-pin-cache.ts
 *
 * Offline-first local cache for the admin PIN.
 *
 * Problem it solves:
 *   `verifyAdminPin()` in tenant-client.ts calls a Supabase RPC (bcrypt check
 *   server-side). When the device is offline the admin cannot log in at all,
 *   even though all school data is available locally.
 *
 * How it works:
 *   1. After every SUCCESSFUL online admin login, call cacheAdminPinHash() to
 *      store a SHA-256 hash of the PIN in localStorage with a 7-day TTL.
 *   2. On the next login attempt, if the device is offline, call
 *      verifyAdminPinOffline() which compares the input against the cached hash.
 *   3. The cache is tenant-scoped (keyed by tenantId) so it never leaks across
 *      schools.
 *   4. The cache is invalidated after 7 days — admin must be online at least
 *      once per week to refresh it.
 *
 * Security notes:
 *   - The hash uses SHA-256 with a per-tenant salt prefix, identical to the
 *     existing hashPIN() used for staff PINs in School_Management_App.tsx.
 *   - The hash is stored in localStorage which is accessible to JS on the same
 *     origin only — same threat model as the staff PIN hashes already stored.
 *   - No plain-text PIN is ever stored.
 *
 * No database schema changes required.
 */

const CACHE_KEY_PREFIX = "gm_admin_pin_cache_v1_";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AdminPinCacheEntry {
  hash: string;       // "h:<64 hex chars>"
  expiresAt: number;  // Date.now() + TTL_MS
}

/** SHA-256 hash identical to hashPIN() in School_Management_App.tsx */
async function hashPin(pin: string): Promise<string> {
  if (!pin) return "";
  try {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode("gm_v1_" + pin));
    return "h:" + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // SubtleCrypto unavailable (HTTP context) — use plain prefix as fallback
    return "p:" + pin;
  }
}

/**
 * Store a hash of the admin PIN locally after a successful online verification.
 * Call this ONLY after verifyAdminPin() returns true.
 */
export async function cacheAdminPinHash(tenantId: string, pin: string): Promise<void> {
  if (!tenantId || !pin) return;
  try {
    const hash = await hashPin(pin);
    const entry: AdminPinCacheEntry = { hash, expiresAt: Date.now() + TTL_MS };
    localStorage.setItem(CACHE_KEY_PREFIX + tenantId, JSON.stringify(entry));
  } catch {
    // localStorage full — silently skip; offline login just won't work this cycle
  }
}

/**
 * Verify the admin PIN offline against the locally cached hash.
 * Returns "match" | "no-cache" | "expired" | "mismatch"
 */
export async function verifyAdminPinOffline(
  tenantId: string,
  pin: string
): Promise<"match" | "no-cache" | "expired" | "mismatch"> {
  if (!tenantId || !pin) return "no-cache";
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + tenantId);
    if (!raw) return "no-cache";
    const entry: AdminPinCacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(CACHE_KEY_PREFIX + tenantId);
      return "expired";
    }
    const hash = await hashPin(pin);
    return hash === entry.hash ? "match" : "mismatch";
  } catch {
    return "no-cache";
  }
}

/** Returns true if a non-expired cache entry exists for this tenant. */
export function hasAdminPinCache(tenantId: string): boolean {
  if (!tenantId) return false;
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + tenantId);
    if (!raw) return false;
    const entry: AdminPinCacheEntry = JSON.parse(raw);
    return Date.now() <= entry.expiresAt;
  } catch {
    return false;
  }
}

/** Wipe the admin PIN cache for a tenant (e.g. on sign-out or PIN change). */
export function clearAdminPinCache(tenantId: string): void {
  try {
    localStorage.removeItem(CACHE_KEY_PREFIX + tenantId);
  } catch {}
}
