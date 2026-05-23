import { supabase } from "@/integrations/supabase/client";
import { loadTenantSession } from "@/lib/tenant-client";

export async function syncActivityLog(
  tenantId: string | null,
  staffId: string,
  action: string,
  details: string | null = null,
  timestamp: string = new Date().toISOString()
) {
  if (!tenantId) {
    const tenantSession = loadTenantSession();
    if (tenantSession?.tenantId) {
      tenantId = tenantSession.tenantId;
    }
  }

  if (!tenantId) {
    return;
  }

  try {
    // Fire and forget using the RPC we created in the migration
    await supabase.rpc("log_tenant_activity", {
      _tenant_id: tenantId,
      _staff_id: staffId,
      _action: action,
      _details: details,
      _timestamp: timestamp,
    });
  } catch (err) {
    console.error("Failed to sync activity to backend", err);
  }
}
