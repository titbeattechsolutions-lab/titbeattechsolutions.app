import { supabase } from "@/integrations/supabase/client";

export async function syncActivityLog(
  tenantId: string | null,
  staffId: string,
  action: string,
  details: string | null = null,
  timestamp: string = new Date().toISOString()
) {
  if (!tenantId) {
    // Try to get tenant_id from session if not provided directly
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;
    
    // Check tenant session
    const { data: tenantSessions } = await supabase
      .from('tenant_sessions')
      .select('tenant_id')
      .eq('token', sessionData.session.access_token);
      
    if (tenantSessions && tenantSessions.length > 0) {
      tenantId = tenantSessions[0].tenant_id;
    } else {
      // Not logged into a tenant
      return;
    }
  }

  try {
    // Fire and forget using the RPC we created in the migration
    await supabase.rpc('log_tenant_activity', {
      _tenant_id: tenantId,
      _staff_id: staffId,
      _action: action,
      _details: details,
      _timestamp: timestamp
    });
  } catch (err) {
    console.error("Failed to sync activity to backend", err);
  }
}
