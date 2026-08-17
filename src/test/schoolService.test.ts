import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../supabase/schoolService';
import * as client from '../integrations/supabase/client';
import { createClient } from '@supabase/supabase-js';

// Mock the environment variables needed by db()
vi.stubEnv('VITE_SUPABASE_URL', 'https://mock.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('schoolService', () => {
  const mockGlobalSupabase = { mock: 'global-supabase-instance' };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    
    // Mock the exported default supabase client
    vi.spyOn(client, 'supabase', 'get').mockReturnValue(mockGlobalSupabase as unknown as any);
    
    // Mock createClient
    (createClient as any).mockImplementation(() => {
      return { mock: 'tenant-scoped-client' };
    });
  });

  it('db() returns global supabase client when no session token exists', () => {
    const instance = db();
    expect(instance).toBe(mockGlobalSupabase);
  });

  it('db() creates and returns a tenant-scoped client when a session token exists', () => {
    sessionStorage.setItem('schoolapp_tenant_session_v2', JSON.stringify({ sessionToken: 'test-token' }));
    
    const instance = db();
    
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      'https://mock.supabase.co',
      'mock-key',
      expect.objectContaining({
        global: { headers: { 'x-tenant-session': 'test-token' } },
        auth: expect.objectContaining({ storageKey: 'tenant-session-db' })
      })
    );
    expect(instance).toEqual({ mock: 'tenant-scoped-client' });
  });

  it('db() caches the tenant client for the same token', () => {
    sessionStorage.setItem('schoolapp_tenant_session_v2', JSON.stringify({ sessionToken: 'token-3' }));
    
    const instance1 = db();
    const instance2 = db();
    
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(instance1).toBe(instance2);
  });

  it('db() creates a new client if the token changes', () => {
    sessionStorage.setItem('schoolapp_tenant_session_v2', JSON.stringify({ sessionToken: 'token-1' }));
    db();
    
    sessionStorage.setItem('schoolapp_tenant_session_v2', JSON.stringify({ sessionToken: 'token-2' }));
    db();
    
    expect(createClient).toHaveBeenCalledTimes(2);
  });
});
