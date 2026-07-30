import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables");
    }

    // 1. Verify user is super_admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    // Verify user is superadmin
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isSuperAdmin } = await serviceClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin"
    });

    if (!isSuperAdmin) {
      return Response.json({ error: "Forbidden: Superadmin access required" }, { status: 403, headers: corsHeaders });
    }

    const { schoolId } = await req.json();
    if (!schoolId) {
      throw new Error("schoolId is required");
    }

    // 2. Find the tenant_id
    const { data: school, error: schoolError } = await serviceClient
      .from("schools")
      .select("tenant_id")
      .eq("id", schoolId)
      .maybeSingle();

    if (schoolError) throw schoolError;
    if (!school) {
      return Response.json({ error: "School not found" }, { status: 404, headers: corsHeaders });
    }

    const tenantId = school.tenant_id;

    // 3. Find associated users in profiles
    const { data: profiles, error: usersError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("school_id", tenantId);

    if (usersError) throw usersError;

    // 4. Delete each user from auth.users (cascades to profiles)
    if (profiles && profiles.length > 0) {
      for (const p of profiles) {
        const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(p.id);
        if (deleteUserError) {
          console.error(`Failed to delete user ${p.id}:`, deleteUserError);
        }
      }
    }

    // 5. Delete child records that don't have ON DELETE CASCADE (like provisioning_requests)
    await serviceClient
      .from("provisioning_requests")
      .delete()
      .eq("tenant_id", tenantId);

    // 6. Delete from public.tenants (cascades to schools, billing, sessions, etc)
    const { error: deleteTenantError } = await serviceClient
      .from("tenants")
      .delete()
      .eq("id", tenantId);

    if (deleteTenantError) throw deleteTenantError;

    return Response.json(
      { success: true, message: "School deeply deleted successfully" },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("delete-school error:", err);
    return Response.json(
      { error: err.message || err.details || JSON.stringify(err) || "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
