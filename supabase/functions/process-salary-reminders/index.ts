import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";

Deno.serve(async (req) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch all tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from("tenant_data")
      .select("tenant_id, app_state");

    if (tenantErr) throw tenantErr;

    const emailsToSend: { to: string; subject: string; text: string }[] = [];

    // Current Date details
    const now = new Date();
    const currentDay = now.getDate();
    const nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);
    const tomorrowDay = nextDay.getDate();

    // 2. Parse tenant data
    for (const tenant of (tenants || [])) {
      const state = tenant.app_state;
      if (!state || !state.schoolSettings) continue;

      const settings = state.schoolSettings;
      
      // If reminder enabled and salary day is tomorrow or today
      if (settings.salaryReminderEnabled && settings.salaryDay) {
        if (settings.salaryDay === currentDay || settings.salaryDay === tomorrowDay) {
          const isToday = settings.salaryDay === currentDay;
          
          // Find staff members with 'Admin' or 'Bursar' role to notify
          const staffList = state.staffList || [];
          const targets = staffList.filter((s: any) => 
            (s.role.includes("Admin") || s.role.includes("Bursar") || s.role.includes("Super")) && s.email
          );

          for (const target of targets) {
            emailsToSend.push({
              to: target.email,
              subject: `Salary Deadline Approaching - ${settings.name || 'Your School'}`,
              text: `Hello ${target.name},\n\nThis is a reminder that the configured salary pay day is ${isToday ? "TODAY" : "TOMORROW"} (Day ${settings.salaryDay} of the month).\n\nPlease log in to process the payroll.\n\nThank you!`
            });
          }
        }
      }
    }

    // 3. Send emails via Resend
    let sentCount = 0;
    for (const email of emailsToSend) {
      if (!RESEND_API_KEY) {
        console.warn("RESEND_API_KEY missing, skipping email to", email.to);
        continue;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: `School Management App <${RESEND_FROM_EMAIL}>`,
          to: email.to,
          subject: email.subject,
          text: email.text
        })
      });

      if (res.ok) {
        sentCount++;
      } else {
        console.error("Failed to send email to", email.to, await res.text());
      }
    }

    return new Response(JSON.stringify({ success: true, processedTenants: tenants?.length, emailsSent: sentCount }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("Error in process-salary-reminders:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
