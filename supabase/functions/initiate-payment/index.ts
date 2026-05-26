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
    // ── 1. Auth ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing authorization header" }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Invalid session" }, { status: 401, headers: corsHeaders });
    }

    // ── 2. Parse body ──────────────────────────────────────────────────
    const { studentId, feeId, amount } = await req.json();
    if (!studentId || !feeId || !amount) {
      return Response.json({ error: "studentId, feeId, and amount are required" }, { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // ── 3. Verify caller's profile + school ───────────────────────────
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("school_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.school_id) {
      return Response.json({ error: "Caller has no school assignment" }, { status: 403, headers: corsHeaders });
    }

    // ── 4. Verify student belongs to same school ──────────────────────
    const { data: student } = await serviceClient
      .from("students")
      .select("id, first_name, last_name, school_id")
      .eq("id", studentId)
      .eq("school_id", profile.school_id)
      .single();

    if (!student) {
      return Response.json({ error: "Student not found in your school" }, { status: 404, headers: corsHeaders });
    }

    // ── 5. Verify fee exists + amount matches ─────────────────────────
    const { data: fee } = await serviceClient
      .from("fees")
      .select("id, name, amount, school_id")
      .eq("id", feeId)
      .eq("school_id", profile.school_id)
      .single();

    if (!fee) {
      return Response.json({ error: "Fee not found in your school" }, { status: 404, headers: corsHeaders });
    }

    if (Number(fee.amount) !== Number(amount)) {
      return Response.json({ error: "Amount does not match fee definition" }, { status: 400, headers: corsHeaders });
    }

    // ── 6. Generate reference + INSERT pending payment ─────────────────
    const reference = `SGF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const { error: insertError } = await serviceClient
      .from("payments")
      .insert({
        school_id: profile.school_id,
        student_id: studentId,
        student_name: `${student.first_name} ${student.last_name}`,
        fee_id: feeId,
        fee_name: fee.name,
        amount: fee.amount,
        currency: "NGN",
        reference,
        status: "pending",
        channel: "paystack",
      });

    if (insertError) throw insertError;

    // ── 7. Create Paystack payment link (or mock in dev) ───────────────
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    let paymentUrl = `https://paystack.com/pay/${reference}`; // mock fallback

    if (paystackKey) {
      const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${paystackKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference,
          amount: Math.round(Number(fee.amount) * 100), // Paystack uses kobo
          currency: "NGN",
          email: user.email,
          metadata: {
            student_id: studentId,
            fee_id: feeId,
            school_id: profile.school_id,
          },
        }),
      });

      if (psRes.ok) {
        const psData = await psRes.json();
        paymentUrl = psData.data?.authorization_url ?? paymentUrl;
      }
    }

    return Response.json(
      { reference, paymentUrl },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("initiate-payment error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
});
