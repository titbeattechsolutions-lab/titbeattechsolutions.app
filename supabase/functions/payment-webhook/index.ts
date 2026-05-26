import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

// Paystack sends webhook events to this public endpoint.
// No Authorization header check — Paystack does NOT send one.
// Security is enforced by HMAC-SHA512 signature verification.

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackSecret) {
    console.error("PAYSTACK_SECRET_KEY not set");
    return new Response("Server misconfiguration", { status: 500 });
  }

  // ── 1. Read raw body for signature verification ────────────────────
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!signature) {
    return new Response("Missing signature", { status: 401 });
  }

  // ── 2. Verify HMAC-SHA512 signature ──────────────────────────────
  const encoder = new TextEncoder();
  const keyData = encoder.encode(paystackSecret);
  const messageData = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const computedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedSignature !== signature) {
    console.warn("Webhook signature mismatch");
    return new Response("Invalid signature", { status: 401 });
  }

  // ── 3. Parse event ────────────────────────────────────────────────
  let event: { event: string; data: { reference: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const reference = event?.data?.reference;
  if (!reference) {
    return new Response("Missing reference", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  // ── 4. Handle event types ─────────────────────────────────────────
  try {
    if (event.event === "charge.success") {
      const { error } = await serviceClient
        .from("payments")
        .update({ status: "success", paid_at: new Date().toISOString() })
        .eq("reference", reference);

      if (error) throw error;
      console.log(`Payment success recorded: ${reference}`);

    } else if (
      event.event === "charge.failed" ||
      event.event === "transfer.failed" ||
      event.event === "transfer.reversed"
    ) {
      const { error } = await serviceClient
        .from("payments")
        .update({ status: "failed" })
        .eq("reference", reference);

      if (error) throw error;
      console.log(`Payment failure recorded: ${reference} (${event.event})`);

    } else {
      // Unhandled event type — acknowledge receipt so Paystack doesn't retry
      console.log(`Unhandled Paystack event: ${event.event}`);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("payment-webhook DB error:", err);
    return new Response("Database error", { status: 500 });
  }
});
