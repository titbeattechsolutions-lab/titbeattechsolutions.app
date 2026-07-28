import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  try {
    const record = await req.json();

    // Verify this is a superadmin login
    if (!record || record.action !== 'login' || !['superadmin', 'super_admin'].includes(record.role)) {
      return new Response("Not a superadmin login event.", { status: 200 });
    }

    if (!RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY environment variable.");
      return new Response("Server configuration error", { status: 500 });
    }

    const { user_name, ip_address, device, created_at } = record;
    const loginTime = created_at ? new Date(created_at).toUTCString() : new Date().toUTCString();

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #ef4444; margin-top: 0;">⚠️ Superadmin Login Alert</h2>
        <p style="color: #334155; font-size: 16px;">A Superadmin has just logged into the system. Please review the details below to ensure this activity was authorized.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <ul style="list-style: none; padding: 0; margin: 0; color: #475569; font-size: 15px; line-height: 1.6;">
            <li><strong>User:</strong> ${user_name || 'Superadmin User'}</li>
            <li><strong>Time (UTC):</strong> ${loginTime}</li>
            <li><strong>IP Address:</strong> ${ip_address || 'Unknown'}</li>
            <li><strong>Device:</strong> ${device || 'Unknown'}</li>
          </ul>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin-bottom: 0;">
          If this was you, you can safely ignore this email. If this was not you, please secure your account immediately.
        </p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: "Security Alert <onboarding@resend.dev>",
        to: ["titbeattechsolutions@gmail.com", "pchiderasamuel@gmail.com"],
        subject: "⚠️ SECURITY ALERT: Superadmin Login",
        html: emailHtml
      })
    });

    const data = await res.json();
    
    if (!res.ok) {
      console.error("Resend API Error:", data);
      return new Response(JSON.stringify(data), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true, message: "Alert sent successfully" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Function error:", error);
    return new Response(String(error), { status: 500 });
  }
});
