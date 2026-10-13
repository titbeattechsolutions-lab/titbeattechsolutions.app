import { get, set, del } from "idb-keyval";

export const DB_KEY = "greatmind_school_db_v2";
const IDB_KEY = "greatmind_school_db_v2_idb";

/** 
 * Read the app state string. 
 * RECONCILIATION: Checks both stores, prefers IndexedDB or newer _rev in case of fractured state,
 * validates JSON before wiping, and standardizes on IndexedDB moving forward.
 */
export async function getAppState(): Promise<string | null> {
  try {
    const lsVal = localStorage.getItem(DB_KEY);
    const idbVal = await get<string>(IDB_KEY).catch(() => null);

    if (lsVal && idbVal) {
      let lsParsed, idbParsed;
      let lsValid = false, idbValid = false;

      try { lsParsed = JSON.parse(lsVal); lsValid = true; } catch {}
      try { idbParsed = JSON.parse(idbVal); idbValid = true; } catch {}

      // If both are hopelessly corrupted, bail out.
      if (!lsValid && !idbValid) return null;
      
      // If one is corrupted, the other wins automatically.
      if (lsValid && !idbValid) {
        await set(IDB_KEY, lsVal);
        localStorage.removeItem(DB_KEY);
        return lsVal;
      }
      if (idbValid && !lsValid) {
        localStorage.removeItem(DB_KEY);
        return idbVal;
      }

      // Both are valid. Extract discriminators.
      const lsRev = lsParsed._rev || 0;
      const lsTs = lsParsed._updatedAt || 0;
      const idbRev = idbParsed._rev || 0;
      const idbTs = idbParsed._updatedAt || 0;

      let winner = idbVal; // Default IDB
      
      if (lsTs > idbTs) {
        winner = lsVal;
      } else if (lsTs === idbTs) {
        // Fallback to _rev if timestamps are identical (or both 0)
        if (lsRev > idbRev) {
          winner = lsVal;
        }
      }
      
      await set(IDB_KEY, winner);
      localStorage.removeItem(DB_KEY);
      return winner;

    } else if (lsVal && !idbVal) {
      // Validate before migrating
      try { JSON.parse(lsVal); } catch { return null; }
      await set(IDB_KEY, lsVal);
      localStorage.removeItem(DB_KEY);
      return lsVal;
    } else if (idbVal && !lsVal) {
      return idbVal;
    }
  } catch (err) {
    console.error("[app-storage] Reconciliation failed", err);
  }

  try {
    const idbVal = await get<string>(IDB_KEY);
    return idbVal ?? null;
  } catch {
    return null;
  }
}

export async function setAppState(value: string): Promise<{ success: boolean; error?: string }> {
  try {
    await set(IDB_KEY, value);
    localStorage.removeItem(DB_KEY); 
    return { success: true };
  } catch (err: any) {
    console.error("[app-storage] IndexedDB write failed:", err);
    return { success: false, error: err?.message || "Device storage unavailable" };
  }
}

export async function clearAppState(): Promise<void> {
  try {
    localStorage.removeItem(DB_KEY);
    await del(IDB_KEY);
  } catch {}
}
