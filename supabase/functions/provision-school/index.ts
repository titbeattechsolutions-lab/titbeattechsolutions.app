import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Auth: verify caller is super_admin ──────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing authorization header" }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller's JWT using anon client
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    }

    // Check super_admin role
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isSuperAdmin } = await serviceClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) {
      return Response.json({ error: "Forbidden — super_admin only" }, { status: 403, headers: corsHeaders });
    }

    // ── 2. Parse + validate body ───────────────────────────────────────
    const body = await req.json();
    const { name, code, email, phone, address, plan, adminEmail, adminName, tenantId, paymentMethod, notes } = body;

    if (!name || !code || !tenantId) {
      return Response.json({ error: "name, code, and tenantId are required" }, { status: 400, headers: corsHeaders });
    }

    let maxStudentsLimit = 500;
    if (plan === "pro") maxStudentsLimit = 2000;
    if (plan === "enterprise") maxStudentsLimit = 10000;

    // ── 3. CREATE tenant ──────────────────────────────────────────────
    // Generate a secure random PIN
    const randomPin = "SCH-" + Array.from({length: 6}, () => Math.random().toString(36).charAt(2)).join('').toUpperCase();
    
    const { data: newTenantId, error: tenantError } = await serviceClient.rpc("create_tenant_v2", {
      _school_name: name,
      _school_pin: randomPin,
      _contact_email: email || null,
      _contact_phone: phone || null,
      _notes: notes || null,
      _start_trial: true,
    });
    if (tenantError) throw tenantError;
    const actualTenantId = newTenantId;

    // ── 4. INSERT school ──────────────────────────────────────────────
    const { data: school, error: schoolError } = await serviceClient
      .from("schools")
      .insert({
        tenant_id: actualTenantId,
        name,
        code: code.toUpperCase(),
        email: email ?? null,
        phone: phone ?? null,
        address_street: address?.street ?? null,
        address_city: address?.city ?? null,
        address_state: address?.state ?? null,
        max_students: maxStudentsLimit,
      })
      .select("id")
      .single();

    if (schoolError) {
      if (schoolError.code === "23505") { // Unique violation
        return Response.json({ error: "School code already exists" }, { status: 409, headers: corsHeaders });
      }
      throw schoolError;
    }

    const schoolId = school.id;

    // ── 5. INSERT pre_registration for admin email ────────────────────
    if (adminEmail) {
      const { error: preRegError } = await serviceClient
        .from("pre_registrations")
        .insert({
          school_id: schoolId,
          email: adminEmail.toLowerCase(),
          role: "school_admin",
        })
        .select("id")
        .single();

      if (preRegError && preRegError.code !== "23505") {
        // 23505 = unique violation (already registered) — not fatal
        throw preRegError;
      }
    }

    // ── 6. INSERT billing record ──────────────────────────────────────
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: billingError } = await serviceClient
      .from("billing")
      .insert({
        school_id: schoolId,
        plan: plan ?? "starter",
        status: "trial",
        trial_ends_at: trialEndsAt,
        payment_method: paymentMethod ?? null,
        notes: notes ?? null,
      });

    if (billingError) throw billingError;

    // ── 7. Send welcome email via Resend ─────────────────────────────
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey && adminEmail) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "noreply@titbeattechsolutions.com",
          to: adminEmail,
          subject: `Welcome to SchoolGradeFlow — ${name}`,
          html: `
            <h2>Welcome, ${adminName ?? "School Admin"}!</h2>
            <p>Your school <strong>${name}</strong> has been provisioned on SchoolGradeFlow.</p>
            <p>Sign up with this email address to get started. Your account will automatically be assigned the <strong>School Admin</strong> role.</p>
            <p>School Code: <strong>${code.toUpperCase()}</strong></p>
            <p>Trial ends: <strong>${new Date(trialEndsAt).toDateString()}</strong></p>
          `,
        }),
      });
    }

    return Response.json(
      { success: true, schoolId },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error("provision-school error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
