import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAppState, setAppState, DB_KEY } from './app-storage';
import * as idb from 'idb-keyval';

const IDB_KEY = "greatmind_school_db_v2_idb";

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn()
}));

describe('app-storage reconciliation', () => {
  let lsStore: Record<string, string> = {};
  let idbStore: Record<string, string> = {};

  beforeEach(() => {
    lsStore = {};
    idbStore = {};
    
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => lsStore[k] || null,
      setItem: (k: string, v: string) => { lsStore[k] = v; },
      removeItem: (k: string) => { delete lsStore[k]; }
    });

    vi.mocked(idb.get).mockImplementation(async (k: string) => idbStore[k] || null);
    vi.mocked(idb.set).mockImplementation(async (k: string, v: any) => { idbStore[k] = v; });
    vi.mocked(idb.del).mockImplementation(async (k: string) => { delete idbStore[k]; });
    
    vi.clearAllMocks();
  });

  it('TEST 1: Both exist, IDB is newer (Original Bug Scenario)', async () => {
    lsStore[DB_KEY] = JSON.stringify({ name: 'Old Data', _updatedAt: 100 });
    idbStore[IDB_KEY] = JSON.stringify({ name: 'New Uploaded Data', _updatedAt: 200 });
    
    const res = await getAppState();
    expect(res).not.toBeNull();
    expect(JSON.parse(res!).name).toBe('New Uploaded Data');
    expect(lsStore[DB_KEY]).toBeUndefined();
    expect(idb.set).toHaveBeenCalledWith(IDB_KEY, idbStore[IDB_KEY]);
  });

  it('TEST 2: Both exist, LS is strictly newer (Legacy edge case)', async () => {
    lsStore[DB_KEY] = JSON.stringify({ name: 'Newer Legacy Data', _updatedAt: 500 });
    idbStore[IDB_KEY] = JSON.stringify({ name: 'Stale IDB Data', _updatedAt: 400 });
    
    const res = await getAppState();
    expect(res).not.toBeNull();
    expect(JSON.parse(res!).name).toBe('Newer Legacy Data');
    expect(lsStore[DB_KEY]).toBeUndefined();
  });

  it('TEST 3: Both exist, IDB is corrupted', async () => {
    lsStore[DB_KEY] = JSON.stringify({ name: 'Good Backup' });
    idbStore[IDB_KEY] = '{ bad json ';
    
    const res = await getAppState();
    expect(res).not.toBeNull();
    expect(JSON.parse(res!).name).toBe('Good Backup');
    expect(lsStore[DB_KEY]).toBeUndefined();
  });

  it('TEST 4: Both exist, _updatedAt missing/equal, falls back to _rev tiebreaker', async () => {
    // Both missing _updatedAt (or equal), but LS has a higher _rev
    lsStore[DB_KEY] = JSON.stringify({ name: 'Higher Rev Data', _rev: 5 });
    idbStore[IDB_KEY] = JSON.stringify({ name: 'Lower Rev Data', _rev: 3 });
    
    const res = await getAppState();
    expect(res).not.toBeNull();
    expect(JSON.parse(res!).name).toBe('Higher Rev Data');
    expect(lsStore[DB_KEY]).toBeUndefined();
  });

  it('TEST 5: Both exist, both are corrupted (returns null)', async () => {
    lsStore[DB_KEY] = '{ bad ls json ';
    idbStore[IDB_KEY] = '{ bad idb json ';
    
    const res = await getAppState();
    expect(res).toBeNull();
    // It should not wipe or overwrite anything if both are corrupted
    expect(lsStore[DB_KEY]).toBeDefined(); 
    expect(idb.set).not.toHaveBeenCalled();
  });
});
