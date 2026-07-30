import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-session",
};

const ALLOWED_ROLES = ["school_admin", "principal", "head_teacher", "teacher", "super_admin", "superadmin", "Administrator"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey         = Deno.env.get("SUPABASE_ANON_KEY")!;
    const resendApiKey    = Deno.env.get("RESEND_API_KEY")!;

    // ── 1. Auth: verify caller has allowed role ──────────────────────────────
    const authHeader = req.headers.get("Authorization");
    const tenantSessionToken = req.headers.get("x-tenant-session");
    
    let callerUserId: string | null = null;
    let callerSchoolId: string | null = null;
    let callerRole: string | null = null;

    if (tenantSessionToken) {
      // Tenant session calls (PIN-based app)
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: session, error: sessionErr } = await adminClient
        .from("tenant_sessions")
        .select("tenant_id, session_staff_role")
        .eq("token", tenantSessionToken)
        .maybeSingle();

      if (sessionErr) {
        console.error("Session lookup error:", sessionErr);
      }

      callerRole = session?.session_staff_role ?? "school_admin";

      if (!session || !ALLOWED_ROLES.includes(callerRole)) {
         return Response.json(
            { error: "Invalid tenant session or insufficient permissions" },
            { status: 200, headers: corsHeaders }
          );
      }
      // Resolve tenant_id to school_id
      const { data: school } = await adminClient
        .from("schools")
        .select("id")
        .eq("tenant_id", session.tenant_id)
        .maybeSingle();
      callerSchoolId = school?.id ?? session.tenant_id;
    } else if (authHeader) {
      // GoTrue Auth
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await callerClient.auth.getUser();
      if (!userError && user) {
        callerUserId = user.id;
        
        // Get definitive role using the exact same RPC the frontend uses
        const { data: myRole } = await callerClient.rpc("get_my_role");
        
        // Also fetch profile for school_id
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: profile } = await adminClient
          .from("profiles")
          .select("school_id")
          .eq("id", user.id)
          .maybeSingle();
          
        callerRole = (myRole as string) ?? null;
        
        if (!callerRole || !ALLOWED_ROLES.includes(callerRole)) {
          return Response.json(
            { error: "Insufficient permissions" },
            { status: 200, headers: corsHeaders }
          );
        }
        callerSchoolId = profile?.school_id ?? null;
      }
    }

    if (!callerSchoolId && !["super_admin", "superadmin"].includes(callerRole || "")) {
      return Response.json(
        { error: "Unauthorized request" },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 2. Parse request body ─────────────────────────────────────────────────
    const { reportCardId, schoolId, overrideEmail } = await req.json();
    if (!reportCardId || !schoolId) {
      return Response.json(
        { error: "reportCardId and schoolId are required" },
        { status: 200, headers: corsHeaders }
      );
    }

    // Cross-school protection
    const isSuperAdmin = ["super_admin", "superadmin"].includes(callerRole || "");
    if (!isSuperAdmin && callerSchoolId !== schoolId) {
      return Response.json(
        { error: "Cross-school access is prohibited" },
        { status: 200, headers: corsHeaders }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── 3. Fetch report card ──────────────────────────────────────────────────
    const { data: rc, error: rcErr } = await admin
      .from("report_cards")
      .select("*")
      .eq("id", reportCardId)
      .single();
    if (rcErr || !rc) {
      return Response.json({ error: "Report card not found" }, { status: 200, headers: corsHeaders });
    }

    // ── 4. Fetch guardian email ───────────────────────────────────────────────
    let guardianEmail: string | null = overrideEmail ?? null;
    
    if (!guardianEmail && rc.student_id) {
      const { data: student } = await admin
        .from("students")
        .select("guardian_email")
        .eq("id", rc.student_id)
        .maybeSingle();
      guardianEmail = student?.guardian_email ?? null;
    }
    // Fallback: search by name
    if (!guardianEmail && rc.student_name) {
      const names = (rc.student_name as string).trim().split(/\s+/);
      if (names.length >= 2) {
        const { data: student } = await admin
          .from("students")
          .select("guardian_email")
          .eq("school_id", schoolId)
          .ilike("first_name", `${names[0]}%`)
          .ilike("last_name", `${names[names.length - 1]}%`)
          .limit(1)
          .maybeSingle();
        guardianEmail = student?.guardian_email ?? null;
      }
    }
    if (!guardianEmail) {
      return Response.json(
        { error: "No parent email on file for this student. Please provide one." },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 5. Fetch subject results ──────────────────────────────────────────────
    let resultsQuery = admin
      .from("results")
      .select("subject_name, ca1, ca2, exam_score, total_score, grade, remark")
      .eq("school_id", schoolId)
      .eq("term", rc.term)
      .eq("academic_year", rc.academic_year);

    if (rc.student_id) {
      resultsQuery = resultsQuery.eq("student_id", rc.student_id);
    } else if (rc.student_name) {
      resultsQuery = resultsQuery.ilike("student_name", rc.student_name);
    }

    const { data: results } = await resultsQuery;

    // ── 6. Fetch school profile ───────────────────────────────────────────────
    const { data: school } = await admin
      .from("schools")
      .select("name, logo, email")
      .eq("id", schoolId)
      .maybeSingle();

    const schoolName  = school?.name  ?? "Your School";
    const schoolEmail = school?.email ?? "";
    const schoolLogo  = school?.logo  ?? null;

    // ── 7. Build email HTML ───────────────────────────────────────────────────
    const avgTotal = results && results.length > 0
      ? (results.reduce((s: number, r: any) => s + (r.total_score ?? 0), 0) / results.length).toFixed(1)
      : "—";
    const grade = (avg: string) => {
      const n = parseFloat(avg);
      if (n >= 70) return "A";
      if (n >= 60) return "B";
      if (n >= 50) return "C";
      if (n >= 40) return "D";
      return "F";
    };

    const daysOpen    = rc.days_open    ?? "—";
    const daysPresent = rc.days_present ?? "—";
    const daysAbsent  = rc.days_absent  ?? "—";
    const attRate     = rc.days_open && rc.days_present
      ? Math.round((rc.days_present / rc.days_open) * 100) + "%"
      : "—";

    const termLabel = rc.term.charAt(0).toUpperCase() + rc.term.slice(1) + " Term";

    const resultsRows = (results ?? []).map((r: any) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${r.subject_name ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.ca1 ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.ca2 ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.exam_score ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;">${r.total_score ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.grade ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${r.remark ?? "—"}</td>
      </tr>`).join("");

    const signatureBlock = rc.signature
      ? `<p style="margin:0 0 4px 0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;">Authorised Signature</p>
         <img src="${rc.signature}" width="200" style="max-height:80px;object-fit:contain;" alt="Signature" />`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${schoolName} — Report Card</title></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <!-- Header -->
    <tr>
      <td style="background:#1e3a5f;padding:28px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              ${schoolLogo ? `<img src="${schoolLogo}" width="60" style="border-radius:8px;margin-bottom:10px;" alt="Logo" />` : ""}
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">${schoolName}</h1>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Academic Report Card</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Student Info -->
    <tr>
      <td style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:50%;padding:4px 0;">
              <span style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Student Name</span><br/>
              <span style="font-size:16px;font-weight:900;color:#1e293b;">${rc.student_name}</span>
            </td>
            <td style="width:50%;padding:4px 0;">
              <span style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Class</span><br/>
              <span style="font-size:15px;font-weight:700;color:#1e293b;">${rc.student_class}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 0;">
              <span style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Term</span><br/>
              <span style="font-size:14px;font-weight:700;color:#1e293b;">${termLabel}</span>
            </td>
            <td style="padding:8px 0 0;">
              <span style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Academic Year</span><br/>
              <span style="font-size:14px;font-weight:700;color:#1e293b;">${rc.academic_year}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Results Table -->
    ${results && results.length > 0 ? `
    <tr>
      <td style="padding:24px 32px;">
        <p style="margin:0 0 12px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Subject Results</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#1e3a5f;color:#fff;">
              <th style="padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;">Subject</th>
              <th style="padding:8px 10px;text-align:center;font-weight:700;font-size:11px;text-transform:uppercase;">CA1</th>
              <th style="padding:8px 10px;text-align:center;font-weight:700;font-size:11px;text-transform:uppercase;">CA2</th>
              <th style="padding:8px 10px;text-align:center;font-weight:700;font-size:11px;text-transform:uppercase;">Exam</th>
              <th style="padding:8px 10px;text-align:center;font-weight:700;font-size:11px;text-transform:uppercase;">Total</th>
              <th style="padding:8px 10px;text-align:center;font-weight:700;font-size:11px;text-transform:uppercase;">Grade</th>
              <th style="padding:8px 10px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;">Remark</th>
            </tr>
          </thead>
          <tbody>${resultsRows}</tbody>
          <tfoot>
            <tr style="background:#f1f5f9;">
              <td colspan="4" style="padding:8px 10px;font-weight:700;font-size:12px;">Overall Average</td>
              <td style="padding:8px 10px;text-align:center;font-weight:900;font-size:14px;">${avgTotal}</td>
              <td style="padding:8px 10px;text-align:center;font-weight:900;font-size:14px;">${grade(avgTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </td>
    </tr>` : ""}
    <!-- Attendance -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 12px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Attendance</p>
        <table cellpadding="0" cellspacing="0">
          <tr>
            ${[["Present", daysPresent, "#dcfce7", "#166534"],["Absent", daysAbsent, "#fee2e2", "#991b1b"],["Rate", attRate, "#dbeafe", "#1e3a5f"]].map(([l, v, bg, fg]) =>
              `<td style="padding-right:12px;">
                <div style="background:${bg};border-radius:8px;padding:12px 16px;text-align:center;min-width:72px;">
                  <div style="font-size:18px;font-weight:900;color:${fg};">${v}</div>
                  <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${fg};opacity:0.7;margin-top:2px;">${l}</div>
                </div>
              </td>`).join("")}
          </tr>
        </table>
      </td>
    </tr>
    <!-- Remarks -->
    ${rc.teacher_remark ? `
    <tr>
      <td style="padding:0 32px 20px;">
        <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Class Teacher's Remark</p>
        <p style="margin:0;font-size:14px;color:#334155;font-style:italic;">"${rc.teacher_remark}"</p>
      </td>
    </tr>` : ""}
    ${rc.principal_remark ? `
    <tr>
      <td style="padding:0 32px 20px;">
        <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Principal's Remark</p>
        <p style="margin:0;font-size:14px;color:#334155;font-style:italic;">"${rc.principal_remark}"</p>
      </td>
    </tr>` : ""}
    <!-- Signature -->
    ${signatureBlock ? `
    <tr>
      <td style="padding:0 32px 24px;">${signatureBlock}</td>
    </tr>` : ""}
    <!-- Footer -->
    <tr>
      <td style="background:#f1f5f9;padding:20px 32px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#64748b;text-align:center;">
          Log in to the parent portal to view the full interactive report card.
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;text-align:center;">${schoolName}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // ── 8. Send via Resend ────────────────────────────────────────────────────
    const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@schoolgradeflow.com";
    const emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: guardianEmail,
        reply_to: schoolEmail || undefined,
        subject: `${schoolName} — ${rc.student_name} Report Card — ${termLabel} ${rc.academic_year}`,
        html,
      }),
    });

    const emailData = await emailResp.json();
    if (!emailResp.ok) {
      console.error("Resend error:", emailData);
      return Response.json(
        { error: `Resend API Error: ${emailData.message ?? "Email sending failed"}` },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 9. Update report_cards delivery tracking ──────────────────────────────
    await admin
      .from("report_cards")
      .update({
        email_sent:    true,
        email_sent_at: new Date().toISOString(),
        email_sent_by: callerUserId ?? null,
        status:        "sent",
      })
      .eq("id", reportCardId);

    return Response.json(
      { success: true, sentTo: guardianEmail },
      { headers: corsHeaders }
    );

  } catch (err: any) {
    console.error("send-report-card error:", err);
    return Response.json(
      { error: err.message ?? "Internal server error" },
      { status: 200, headers: corsHeaders }
    );
  }
});
