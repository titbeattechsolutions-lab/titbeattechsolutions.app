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

    const { school_code } = await req.json();

    if (!school_code) {
      return Response.json({ error: "school_code is required" }, { status: 400, headers: corsHeaders });
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = UUID_RE.test(school_code);

    let school: { name: string; logo: string | null } | null = null;

    if (isUuid) {
      const { data } = await admin
        .from("schools")
        .select("name, logo")
        .eq("tenant_id", school_code)
        .maybeSingle();
      school = data;
    }

    if (!school) {
      const { data } = await admin
        .from("schools")
        .select("name, logo")
        .eq("code", school_code.toUpperCase())
        .maybeSingle();
      school = data;
    }

    if (!school) {
      return Response.json({ name: null, logo: null }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ name: school.name, logo: school.logo }, { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error("get-school-branding error:", err);
    return Response.json({ name: null, logo: null }, { status: 200, headers: corsHeaders });
  }
});
