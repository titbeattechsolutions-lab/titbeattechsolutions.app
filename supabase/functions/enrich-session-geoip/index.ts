import { createClient } from "npm:@supabase/supabase-js@2";

// Webhook receiver: enriches a session_logs row with geo-IP data.
// Triggered by a Postgres AFTER INSERT trigger on public.session_logs via pg_net.
// No CORS/auth required — invoked server-to-server with the service role key.

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: {
    id: string;
    ip_address: string | null;
    location: string | null;
    [k: string]: unknown;
  };
  old_record: unknown;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const record = payload?.record;
  if (!record?.id) {
    return new Response(JSON.stringify({ skipped: "no record id" }), { status: 200 });
  }

  const ip = record.ip_address?.trim();
  // Skip if no IP, already enriched, or IP is local/private
  if (
    !ip ||
    record.location ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
  ) {
    return new Response(JSON.stringify({ skipped: "no enrichment needed" }), { status: 200 });
  }

  // Query free geo-IP service (ipapi.co — no key required, generous free tier)
  let location = "Unknown";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const geoRes = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { "User-Agent": "lovable-geoip-enrichment/1.0" },
    });
    clearTimeout(timeoutId);

    if (geoRes.ok) {
      const geo = await geoRes.json();
      if (geo?.error) {
        console.warn("Geo-IP error:", geo.reason);
      } else {
        const city = geo.city || "";
        const region = geo.region || "";
        const country = geo.country_name || geo.country || "";
        location = [city, region, country].filter(Boolean).join(", ") || "Unknown";
      }
    } else {
      console.warn("Geo-IP HTTP", geoRes.status);
    }
  } catch (e) {
    console.warn("Geo-IP fetch failed:", e instanceof Error ? e.message : e);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const service = createClient(supabaseUrl, serviceKey);

  const { error } = await service
    .from("session_logs")
    .update({ location })
    .eq("id", record.id);

  if (error) {
    console.error("Update failed:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, id: record.id, location }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
