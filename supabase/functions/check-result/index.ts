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
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── 1. Parse body ────────────────────────────────────────────────────────
    const { school_code, admission_no, token } = await req.json();

    if (!school_code || !admission_no || !token) {
      return Response.json(
        { error: "school_code, admission_no, and token are required" },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 2. Rate limiting by IP ───────────────────────────────────────────────
    let ip = "unknown";
    try {
      const fwd = req.headers.get("x-forwarded-for");
      ip = fwd ? fwd.split(",")[0].trim() : "unknown";
    } catch { /* ignore */ }

    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: failCount } = await admin
      .from("tenant_auth_audit")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "result_checker_verify")
      .eq("success", false)
      .eq("ip_address", ip)
      .gte("created_at", fifteenMinsAgo);

    if ((failCount ?? 0) >= 5) {
      return Response.json(
        { error: "Too many failed attempts. Please try again in 15 minutes." },
        { status: 200, headers: corsHeaders }
      );
    }

    // Helper: log attempt
    const logAttempt = async (success: boolean, reason: string) => {
      await admin.from("tenant_auth_audit").insert({
        event_type: "result_checker_verify",
        success,
        reason,
        ip_address: ip,
      }).then(() => {});
    };

    // ── 3. Resolve school by code ────────────────────────────────────────────
    // school_code can be either:
    //   (a) a short uppercase code like "GMS2024" stored in schools.code
    //   (b) a tenant_id UUID (what the URL currently copies from the dashboard)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = UUID_RE.test(school_code);

    let school: any = null;

    if (isUuid) {
      // Try by tenant_id first (what the dashboard URL copies)
      const { data } = await admin
        .from("schools")
        .select("id, name, code, logo, address_street, address_city, address_state, academic_year, current_term, email, report_settings")
        .eq("tenant_id", school_code)
        .maybeSingle();
      school = data;
    }

    if (!school) {
      // Try by short code (canonical approach)
      const { data } = await admin
        .from("schools")
        .select("id, name, code, logo, address_street, address_city, address_state, academic_year, current_term, email, report_settings")
        .eq("code", school_code.toUpperCase())
        .maybeSingle();
      school = data;
    }

    if (!school) {
      await logAttempt(false, `school not found: ${school_code}`);
      return Response.json(
        { error: "School not found. Please check the URL and try again." },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 4. Validate token ────────────────────────────────────────────────────
    const { data: tokenRow } = await admin
      .from("result_checker_tokens")
      .select("id, student_id, admission_no, academic_year, term, is_used, used_at, expires_at")
      .eq("token", token.trim().toUpperCase())
      .eq("school_id", school.id)
      .maybeSingle();

    if (!tokenRow) {
      await logAttempt(false, `invalid token: ${token} for school: ${school.code}`);
      return Response.json(
        { error: "Invalid access token. Please check the token and try again." },
        { status: 200, headers: corsHeaders }
      );
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      await logAttempt(false, `expired token: ${token}`);
      return Response.json(
        { error: "This access link has expired. Please contact the school for a new one." },
        { status: 200, headers: corsHeaders }
      );
    }

    if (tokenRow.is_used) {
      await logAttempt(false, `already used token: ${token}`);
      return Response.json(
        { error: "This access link has already been used.", already_used: true },
        { status: 200, headers: corsHeaders }
      );
    }

    // Verify admission number matches
    if (tokenRow.admission_no.toUpperCase() !== admission_no.trim().toUpperCase()) {
      await logAttempt(false, `admission_no mismatch for token: ${token}`);
      return Response.json(
        { error: "Exam number does not match this access token." },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 5. Fetch student ─────────────────────────────────────────────────────
    const { data: student } = await admin
      .from("students")
      .select("id, first_name, last_name, other_names, admission_no, class_name, gender, photo")
      .eq("school_id", school.id)
      .eq("id", tokenRow.student_id)
      .maybeSingle();

    if (!student) {
      await logAttempt(false, `student not found: ${admission_no} in school: ${school.id}`);
      return Response.json(
        { error: "Student record not found. Please contact the school." },
        { status: 200, headers: corsHeaders }
      );
    }

    // ── 6. Fetch results ─────────────────────────────────────────────────────
    const { data: results } = await admin
      .from("results")
      .select("subject_name, score_ca1, score_ca2, score_exam, score_total, grade, remark, teacher_comment")
      .eq("school_id", school.id)
      .eq("student_id", student.id)
      .eq("term", tokenRow.term)
      .eq("academic_year", tokenRow.academic_year)
      .order("subject_name");

    // ── 7. Fetch report_card metadata ─────────────────────────────────────────
    const { data: reportCard } = await admin
      .from("report_cards")
      .select("teacher_remark, principal_remark, days_open, days_present, days_absent, signature, total_score, total_subjects, position_in_class, traits")
      .eq("school_id", school.id)
      .eq("student_id", student.id)
      .eq("term", tokenRow.term)
      .eq("academic_year", tokenRow.academic_year)
      .maybeSingle();

    // ── 8. Mark token as used ────────────────────────────────────────────────
    await admin
      .from("result_checker_tokens")
      .update({ is_used: true, used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    // ── 9. Log success ───────────────────────────────────────────────────────
    await logAttempt(true, `result viewed for student: ${student.admission_no}`);

    // ── 10. Compute summary ──────────────────────────────────────────────────
    const totalSubjects = results?.length ?? 0;
    const average = totalSubjects > 0
      ? (results!.reduce((s, r) => s + (r.score_total ?? 0), 0) / totalSubjects).toFixed(1)
      : "0.0";

    // ── 11. Return result slip data ──────────────────────────────────────────
    return Response.json({
      school: {
        name:    school.name,
        code:    school.code,
        logo:    school.logo,
        address: [school.address_street, school.address_city, school.address_state].filter(Boolean).join(", "),
        email:   school.email,
        report_settings: school.report_settings ?? null,
      },
      student: {
        name:         `${student.first_name} ${student.last_name}${student.other_names ? " " + student.other_names : ""}`.trim(),
        admission_no: student.admission_no,
        class:        student.class_name ?? "—",
        gender:       student.gender,
        photo:        student.photo,
      },
      term:          tokenRow.term,
      academic_year: tokenRow.academic_year,
      results: (results ?? []).map(r => ({
        subject:  r.subject_name,
        ca1:      r.score_ca1,
        ca2:      r.score_ca2,
        exam:     r.score_exam,
        total:    r.score_total,
        grade:    r.grade,
        remark:   r.remark,
        comment:  r.teacher_comment,
      })),
      summary: {
        average,
        total_subjects: totalSubjects,
        position_in_class: reportCard?.position_in_class ?? null,
        total_score: reportCard?.total_score ?? null,
      },
      report_card: reportCard ? {
        teacher_remark:   reportCard.teacher_remark,
        principal_remark: reportCard.principal_remark,
        days_open:        reportCard.days_open,
        days_present:     reportCard.days_present,
        days_absent:      reportCard.days_absent,
        signature:        reportCard.signature,
        traits:           reportCard.traits ?? {},
      } : null,
    }, { headers: corsHeaders });

  } catch (err: any) {
    console.error("check-result error:", err);
    return Response.json(
      { error: err.message ?? "Internal server error" },
      { status: 200, headers: corsHeaders }
    );
  }
});
