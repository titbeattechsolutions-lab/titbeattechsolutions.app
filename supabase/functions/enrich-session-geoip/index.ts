import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Require shared secret header (set by the pg trigger via pg_net)
  const expectedSecret = Deno.env.get("GEOIP_TRIGGER_SECRET") ?? "";
  const providedSecret = req.headers.get("x-geoip-secret") ?? "";
  if (!expectedSecret || providedSecret !== expectedSecret) {
    console.warn("Unauthorized geoip enrichment call");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Support both Supabase Webhook format (payload.record) and raw pg_net format (payload)
  const incoming = payload?.record || payload;
  const sessionId = incoming?.id;
  if (!sessionId) {
    return new Response(JSON.stringify({ skipped: "no record id" }), { status: 200 });
  }

  // Service-role client to bypass RLS
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables");
    return new Response(JSON.stringify({ error: "Configuration Error" }), { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Re-fetch the row server-side — never trust ip/user_id from the request body
  const { data: row, error: fetchErr } = await supabase
    .from("session_logs")
    .select("id, user_id, ip_address")
    .eq("id", sessionId)
    .maybeSingle();

  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }
  if (!row || !row.user_id) {
    return new Response(JSON.stringify({ skipped: "row not found" }), { status: 200 });
  }

  let locationStr = "Unknown Location";
  const ip = (row.ip_address ?? "").toString().trim();

  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.")
  ) {
    locationStr = "Local Network";
  } else {
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
          locationStr = [city, region, country].filter(Boolean).join(", ") || "Unknown Location";
        }
      } else {
        console.warn("Geo-IP HTTP error:", geoRes.status);
      }
    } catch (e) {
      console.warn("Geo-IP fetch failed:", e instanceof Error ? e.message : e);
    }
  }

  const { error } = await supabase.rpc("update_session_location", {
    _session_id: row.id,
    _user_id: row.user_id,
    _location: locationStr,
  });

  if (error) {
    console.error("RPC Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, id: row.id, location: locationStr }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
