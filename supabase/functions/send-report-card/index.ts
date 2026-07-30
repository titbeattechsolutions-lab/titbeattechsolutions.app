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
    const { reportCardId, schoolId, overrideEmail, appUrl } = await req.json();
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
      .select("subject_name, score_ca1, score_ca2, score_exam, score_total, grade, remark")
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
    // ── 7. Build email HTML ───────────────────────────────────────────────────
    const avgTotal = results && results.length > 0
      ? (results.reduce((s: number, r: any) => s + (r.score_total ?? 0), 0) / results.length).toFixed(1)
      : "—";
    const getGradeInfo = (avg: string) => {
      if (avg === "—") return { grade: "—", color: "#64748b", bg: "#f1f5f9" };
      const n = parseFloat(avg);
      if (n >= 70) return { grade: "A", color: "#16a34a", bg: "#dcfce7" };
      if (n >= 60) return { grade: "B", color: "#2563eb", bg: "#dbeafe" };
      if (n >= 50) return { grade: "C", color: "#ca8a04", bg: "#fef9c3" };
      if (n >= 40) return { grade: "D", color: "#ea580c", bg: "#ffedd5" };
      return { grade: "F", color: "#dc2626", bg: "#fee2e2" };
    };

    const daysOpen    = rc.days_open    ?? "—";
    const daysPresent = rc.days_present ?? "—";
    const daysAbsent  = rc.days_absent  ?? "—";
    const attRate     = rc.days_open && rc.days_present
      ? Math.round((rc.days_present / rc.days_open) * 100) + "%"
      : "—";

    const termLabel = rc.term.charAt(0).toUpperCase() + rc.term.slice(1) + " Term";

    const resultsRows = (results ?? []).map((r: any, i: number) => {
      const g = getGradeInfo(r.score_total ? r.score_total.toString() : "—");
      const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      return `
      <tr style="background-color: ${bg};">
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155;">${r.subject_name ?? "—"}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${r.score_ca1 ?? "—"}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${r.score_ca2 ?? "—"}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">${r.score_exam ?? "—"}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;color:#1e293b;">${r.score_total ?? "—"}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;text-align:center;">
          <span style="background-color:${g.bg};color:${g.color};padding:4px 8px;border-radius:6px;font-weight:800;font-size:12px;">${r.grade ?? "—"}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${r.remark ?? "—"}</td>
      </tr>`;
    }).join("");

    const signatureBlock = rc.signature
      ? `<p style="margin:0 0 8px 0;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Authorised Signature</p>
         <img src="${rc.signature}" width="160" style="max-height:80px;object-fit:contain;" alt="Signature" />`
      : "";

    const overallGrade = getGradeInfo(avgTotal);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${schoolName} — Report Card</title>
</head>
<body style="margin:0;padding:0;font-family:system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;background-color:#f1f5f9;color:#334155;-webkit-font-smoothing:antialiased;">
  
  <!-- Wrapper for background -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 10px;">
    <tr>
      <td align="center">
        
        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.05);border:1px solid #e2e8f0;margin:0 auto;text-align:left;">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);padding:40px 32px;text-align:center;">
              ${schoolLogo ? `<img src="${schoolLogo}" width="80" height="80" style="border-radius:12px;margin-bottom:16px;border:3px solid rgba(255,255,255,0.2);object-fit:cover;" alt="School Logo" />` : ""}
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">${schoolName}</h1>
              <p style="margin:8px 0 0;color:#bfdbfe;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Academic Report Card</p>
            </td>
          </tr>

          <!-- Student Profile Grid -->
          <tr>
            <td style="padding:32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:20px;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;width:50%;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Student Name</div>
                    <div style="font-size:18px;font-weight:800;color:#0f172a;">${rc.student_name}</div>
                  </td>
                  <td style="padding:20px;border-bottom:1px solid #e2e8f0;width:50%;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Class</div>
                    <div style="font-size:16px;font-weight:700;color:#0f172a;">${rc.student_class}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;border-right:1px solid #e2e8f0;width:50%;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Term</div>
                    <div style="font-size:15px;font-weight:700;color:#0f172a;">${termLabel}</div>
                  </td>
                  <td style="padding:20px;width:50%;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Academic Year</div>
                    <div style="font-size:15px;font-weight:700;color:#0f172a;">${rc.academic_year}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Results Table -->
          ${results && results.length > 0 ? `
          <tr>
            <td style="padding:0 32px 32px;">
              <h2 style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:800;">Academic Performance</h2>
              <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;background-color:#ffffff;">
                  <thead>
                    <tr style="background-color:#f1f5f9;">
                      <th style="padding:12px 16px;text-align:left;font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Subject</th>
                      <th style="padding:12px 16px;text-align:center;font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">CA1</th>
                      <th style="padding:12px 16px;text-align:center;font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">CA2</th>
                      <th style="padding:12px 16px;text-align:center;font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Exam</th>
                      <th style="padding:12px 16px;text-align:center;font-weight:800;font-size:11px;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Total</th>
                      <th style="padding:12px 16px;text-align:center;font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Grade</th>
                      <th style="padding:12px 16px;text-align:left;font-weight:700;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e2e8f0;">Remark</th>
                    </tr>
                  </thead>
                  <tbody>${resultsRows}</tbody>
                  <tfoot>
                    <tr style="background-color:#f8fafc;">
                      <td colspan="4" style="padding:16px;font-weight:800;font-size:14px;color:#0f172a;border-top:2px solid #e2e8f0;">Overall Performance</td>
                      <td style="padding:16px;text-align:center;font-weight:900;font-size:16px;color:#0f172a;border-top:2px solid #e2e8f0;">${avgTotal}</td>
                      <td style="padding:16px;text-align:center;border-top:2px solid #e2e8f0;">
                        <span style="background-color:${overallGrade.bg};color:${overallGrade.color};padding:6px 10px;border-radius:8px;font-weight:900;font-size:14px;">${overallGrade.grade}</span>
                      </td>
                      <td style="padding:16px;border-top:2px solid #e2e8f0;"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </td>
          </tr>` : ""}

          <!-- Attendance Section -->
          <tr>
            <td style="padding:0 32px 32px;">
              <h2 style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:800;">Attendance Record</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${[["Present", daysPresent, "#ecfdf5", "#059669", "#d1fae5"],
                     ["Absent", daysAbsent, "#fef2f2", "#dc2626", "#fee2e2"],
                     ["Rate", attRate, "#f0f9ff", "#0284c7", "#e0f2fe"]].map(([l, v, bg, fg, border]) =>
                    `<td width="33%" style="padding-right:10px;">
                      <div style="background-color:${bg};border:1px solid ${border};border-radius:12px;padding:16px;text-align:center;">
                        <div style="font-size:24px;font-weight:900;color:${fg};line-height:1;">${v}</div>
                        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:${fg};opacity:0.8;margin-top:8px;letter-spacing:1px;">${l}</div>
                      </div>
                    </td>`).join("")}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Remarks -->
          ${rc.teacher_remark || rc.principal_remark ? `
          <tr>
            <td style="padding:0 32px 32px;">
              <h2 style="margin:0 0 16px;font-size:16px;color:#0f172a;font-weight:800;">Staff Remarks</h2>
              
              ${rc.teacher_remark ? `
              <div style="background-color:#f8fafc;border-left:4px solid #3b82f6;padding:16px 20px;border-radius:0 12px 12px 0;margin-bottom:16px;">
                <p style="margin:0 0 6px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Class Teacher</p>
                <p style="margin:0;font-size:15px;color:#1e293b;font-style:italic;line-height:1.5;">"${rc.teacher_remark}"</p>
              </div>` : ""}
              
              ${rc.principal_remark ? `
              <div style="background-color:#f8fafc;border-left:4px solid #6366f1;padding:16px 20px;border-radius:0 12px 12px 0;">
                <p style="margin:0 0 6px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Principal</p>
                <p style="margin:0;font-size:15px;color:#1e293b;font-style:italic;line-height:1.5;">"${rc.principal_remark}"</p>
              </div>` : ""}
            </td>
          </tr>` : ""}

          <!-- Signature -->
          ${signatureBlock ? `
          <tr>
            <td style="padding:0 32px 32px;text-align:right;">
              ${signatureBlock}
            </td>
          </tr>` : ""}

        </table>
        
        <!-- Footer & CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;">
          <tr>
            <td style="padding:32px 20px;text-align:center;">
              <a href="${appUrl || '#'}" style="display:inline-block;background-color:#2563eb;color:#ffffff;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 4px 12px rgba(37,99,235,0.25);">View Interactive Portal</a>
              <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;font-weight:500;">
                Sent securely by <strong style="color:#64748b;">${schoolName}</strong>
              </p>
            </td>
          </tr>
        </table>

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
