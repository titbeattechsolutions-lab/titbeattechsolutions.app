import { get, set, del } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/**
 * Creates an IndexedDB storage wrapper that conforms to the AsyncStorage interface
 * required by TanStack Query's async storage persister.
 */
const idbValidKey = (key: string) => key;

export const idbStorage = {
  getItem: async (key: string) => {
    const value = await get(idbValidKey(key));
    return value === undefined ? null : value;
  },
  setItem: async (key: string, value: any) => {
    await set(idbValidKey(key), value);
  },
  removeItem: async (key: string) => {
    await del(idbValidKey(key));
  },
};

/**
 * The persister instance to be used by PersistQueryClientProvider.
 * It will store all React Query cache data into IndexedDB under the key 'REACT_QUERY_OFFLINE_CACHE'.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: 'REACT_QUERY_OFFLINE_CACHE',
});
