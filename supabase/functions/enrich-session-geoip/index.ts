import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Support both Supabase Webhook format (payload.record) and raw pg_net format (payload)
  const record = payload?.record || payload;

  if (!record?.id || !record?.user_id) {
    return new Response(JSON.stringify({ skipped: "no record id or user id" }), { status: 200 });
  }

  let locationStr = "Unknown Location";
  const ip = record.ip_address?.trim();

  // Handle Private / Local IPs
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
    // Query free geo-IP service (ipapi.co)
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

  // Update the database using Service Role key to bypass RLS
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  if (!supabaseUrl || !supabaseKey) {
     console.error("Missing Supabase environment variables");
     return new Response(JSON.stringify({ error: "Configuration Error" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Call the Postgres RPC to handle the anomaly logic and update the row
  const { error } = await supabase.rpc("update_session_location", {
    _session_id: record.id,
    _user_id: record.user_id,
    _location: locationStr
  });

  if (error) {
    console.error("RPC Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, id: record.id, location: locationStr }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
