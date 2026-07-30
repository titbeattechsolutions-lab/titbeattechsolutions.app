import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-provisioning-secret, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Auth: verify caller using JWT ───────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing authorization header" }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify the JWT by getting the user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    // Verify user is superadmin
    const { data: isSuperAdmin } = await serviceClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin"
    });

    if (!isSuperAdmin) {
      return Response.json({ error: "Forbidden: Superadmin access required" }, { status: 403, headers: corsHeaders });
    }

    // ── 2. Parse + validate body ───────────────────────────────────────
    const body = await req.json();
    const { idempotencyKey, school, admin, subscription } = body;

    if (!idempotencyKey) {
      return Response.json({ error: "idempotencyKey is required" }, { status: 400, headers: corsHeaders });
    }
    
    if (!school?.name || !school?.code) {
      return Response.json({ error: "school name and code are required" }, { status: 400, headers: corsHeaders });
    }

    // ── 3. Idempotency Check ──────────────────────────────────────────
    const { data: existingRequest, error: checkError } = await serviceClient
      .from("provisioning_requests")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existingRequest) {
      return Response.json(
        { 
          success: true, 
          data: {
            schoolId: existingRequest.school_id,
            tenantId: existingRequest.tenant_id,
            message: "School already provisioned (idempotent)"
          }
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 4. CREATE tenant ──────────────────────────────────────────────
    const randomPin = "SCH-" + Array.from({length: 6}, () => Math.random().toString(36).charAt(2)).join('').toUpperCase();
    const schoolPin = randomPin;
    
    // We MUST use userClient here because create_tenant_v2 explicitly checks auth.uid() for super_admin role!
    const { data: newTenantId, error: tenantError } = await userClient.rpc("create_tenant_v2", {
      _school_name: school.name,
      _school_pin: schoolPin,
      _contact_email: school.email || null,
      _contact_phone: school.phone || null,
      _notes: null,
      _start_trial: true,
    });
    
    if (tenantError) throw tenantError;
    const actualTenantId = newTenantId;

    // ── 5. INSERT school ──────────────────────────────────────────────
    let maxStudentsLimit = 500;
    if (subscription?.plan === "pro") maxStudentsLimit = 2000;
    if (subscription?.plan === "enterprise") maxStudentsLimit = 10000;

    const { data: newSchool, error: schoolError } = await serviceClient
      .from("schools")
      .insert({
        tenant_id: actualTenantId,
        name: school.name,
        code: school.code.toUpperCase(),
        email: school.email ?? null,
        phone: school.phone ?? null,
        address_street: school.address?.street ?? null,
        address_city: school.address?.city ?? null,
        address_state: school.address?.state ?? null,
        max_students: maxStudentsLimit,
      })
      .select("id")
      .single();

    if (schoolError) {
      if (schoolError.code === "23505") { // Unique violation
        return Response.json({ error: { code: "school_code_conflict", message: "School code already exists" } }, { status: 409, headers: corsHeaders });
      }
      throw schoolError;
    }

    const schoolId = newSchool.id;

    // ── 6. CREATE Admin User (replaces pre_registrations) ──────────────
    if (admin?.email && admin?.tempPassword) {
      const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
        email: admin.email.toLowerCase(),
        password: admin.tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: admin.name,
          school_id: schoolId,
          must_reset_password: true,
        }
      });

      if (authError) throw authError;

      // Update the profile that was auto-generated by handle_new_user_profile trigger
      const { error: profileError } = await serviceClient
        .from("profiles")
        .update({
          school_id: actualTenantId,
          role: "school_admin",
          first_name: admin.name?.split(' ')[0] || null,
          last_name: admin.name?.split(' ').slice(1).join(' ') || null,
        })
        .eq("id", authData.user.id);
        
      if (profileError) throw profileError;
    }

    // ── 7. UPDATE billing record ──────────────────────────────────────
    // A database trigger (trg_school_billing) automatically creates a default billing
    // record when a school is created. We just need to update it with the requested plan.
    const trialEndsAt = subscription?.trialEndsAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error: billingError } = await serviceClient
      .from("billing")
      .update({
        plan: subscription?.plan ?? "starter",
        status: "trial",
        trial_ends_at: trialEndsAt,
        payment_method: subscription?.paymentMethod ?? null,
      })
      .eq("school_id", schoolId);

    if (billingError) throw billingError;

    // ── 8. Log Idempotency ─────────────────────────────────────────────
    const { error: idemError } = await serviceClient
      .from("provisioning_requests")
      .insert({
        idempotency_key: idempotencyKey,
        tenant_id: actualTenantId,
        school_id: schoolId,
      });

    if (idemError) throw idemError;

    // ── 9. Fetch Tenant Code ──────────────────────────────────────────
    const { data: tenantData, error: tenantCodeError } = await serviceClient
      .from("tenants")
      .select("tenant_code")
      .eq("id", actualTenantId)
      .single();

    if (tenantCodeError) throw tenantCodeError;
    const tenantCode = tenantData.tenant_code;

    // ── 10. Send Welcome Email via Resend ─────────────────────────────
    if (admin?.email && admin?.tempPassword) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const adminName = admin.name || "Admin";
        const appUrl = Deno.env.get("APP_URL") || "https://myschoolgradeflow.vercel.app";
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <body style="font-family:Inter,sans-serif;background:#F8FAFC;padding:40px 0;">
            <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;
                        border:1px solid #D4E5FF;overflow:hidden;">
              <div style="background:#003366;padding:28px 32px;">
                <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800;">
                  Welcome to TitbeatTech! 🎉
                </h1>
                <p style="color:#94A3B8;margin:6px 0 0;font-size:14px;">
                  Your school management platform is ready
                </p>
              </div>
              <div style="padding:32px;">
                <p style="color:#0F172A;font-size:16px;margin:0 0 16px;">
                  Hi <strong>${adminName}</strong>,
                </p>
                <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 20px;">
                  Your <strong>${school.name}</strong> account has been provisioned.
                  Here are your login credentials:
                </p>

                <div style="background:#F0F7FF;border:1px solid #D4E5FF;border-radius:12px;
                            padding:20px 24px;margin:0 0 24px;">
                  <p style="margin:0 0 8px;font-size:13px;color:#64748B;font-weight:600;
                            text-transform:uppercase;letter-spacing:1px;">Tenant Code (School Code)</p>
                  <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0F172A;">${tenantCode}</p>

                  <p style="margin:0 0 8px;font-size:13px;color:#64748B;font-weight:600;
                            text-transform:uppercase;letter-spacing:1px;">School PIN</p>
                  <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0F172A;">${schoolPin}</p>

                  <p style="margin:0 0 8px;font-size:13px;color:#64748B;font-weight:600;
                            text-transform:uppercase;letter-spacing:1px;">Login Email</p>
                  <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0F172A;">${admin.email.toLowerCase()}</p>

                  <p style="margin:0 0 8px;font-size:13px;color:#64748B;font-weight:600;
                            text-transform:uppercase;letter-spacing:1px;">Temporary Password</p>
                  <p style="margin:0;font-size:18px;font-weight:900;color:#003366;
                            letter-spacing:2px;font-family:monospace;">${admin.tempPassword}</p>
                </div>

                <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;
                            padding:14px 18px;margin:0 0 24px;">
                  <p style="margin:0;font-size:14px;color:#92400E;font-weight:600;">
                    ⚠️ Important: You <em>must</em> change this password when you first log in.
                  </p>
                </div>

                <a href="${appUrl}/login" target="_blank"
                   style="display:inline-block;background:#2563EB;color:#fff;
                          text-decoration:none;padding:14px 28px;border-radius:10px;
                          font-weight:700;font-size:15px;">
                  Access App &amp; Set New Password →
                </a>
              </div>
            </div>
          </body>
          </html>
        `;

        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: Deno.env.get("EMAIL_FROM") || "TitbeatTech <onboarding@resend.dev>",
              to: admin.email.toLowerCase(),
              subject: `Your TitbeatTech school account is ready — ${school.name}`,
              html: emailHtml,
            }),
          });
          
          if (!res.ok) {
            const errBody = await res.text();
            console.error("Failed to send Resend email:", errBody);
          }
        } catch (e) {
          console.error("Error sending Resend email:", e);
        }
      } else {
        console.warn("RESEND_API_KEY not set. Skipping welcome email.");
      }
    }

    return Response.json(
      { 
        success: true, 
        data: { 
          schoolId,
          tenantId: actualTenantId,
          tenantCode,
          schoolPin,
          message: "School successfully provisioned"
        } 
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error("provision-school error:", err);
    // Expose the raw error object so we can debug it on the frontend
    const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
    return Response.json(
      { error: errorMsg },
      { status: 500, headers: corsHeaders }
    );
  }
});
