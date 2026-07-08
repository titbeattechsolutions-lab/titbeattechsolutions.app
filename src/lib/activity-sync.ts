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

    const { error } = await supabase.rpc("log_tenant_activity", {
      _tenant_id: tenantId,
      _staff_id: staffId,
      _action: action,
      _details: details,
      _timestamp: timestamp,
    });
    if (error) console.error("Failed to sync activity log:", error);
}
