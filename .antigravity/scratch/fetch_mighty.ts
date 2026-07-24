import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fliphfrxuhmhnxtmettd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaXBoZnJ4dWhtaG54dG1ldHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODUyNTUsImV4cCI6MjA5MjI2MTI1NX0.-5q6bBebbWoBU0uDIAQGyDFb-BbvghuMdl3T0Uil6qc';
const token = 'eyJhbGciOiJFUzI1NiIsImtpZCI6Ijc1ZmQ4NGY4LTJmM2QtNGMyZC05NjcwLTM4NjUzYWY3YzkwMCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2ZsaXBoZnJ4dWhtaG54dG1ldHRkLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI2NmY0ZDMwZS04YTAxLTRiZTctOWNiMi1lNzBjNjk2NjljYTQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg0NzIzNDgyLCJpYXQiOjE3ODQ3MTk4ODIsImVtYWlsIjoicGNoaWRlcmFzYW11ZWxAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InBjaGlkZXJhc2FtdWVsQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjY2ZjRkMzBlLThhMDEtNGJlNy05Y2IyLWU3MGM2OTY2OWNhNCJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzg0NjQ4NTQ1fV0sInNlc3Npb25faWQiOiJjYjU1NWI0ZC01MTI2LTQ0ZjEtODY2MS01ODc3MDI2YjkxYjgiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.WwRNT9vl1q9iiA9a4JrADxITMlyUSD1GDFEaDZLfrfamfifhMMgjyfo_vt4k-XH_w6a0EIGfvSpI9C2u6Exa2A';

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    headers: { Authorization: `Bearer ${token}` }
  }
});

async function run() {
  const { data, error } = await supabase.from('tenant_data').select('tenant_id, data').eq('tenant_id', 'e42d976e-6c42-4b8c-aa96-d4bfc19d8359');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify(data?.[0]?.data, null, 2).substring(0, 1000));
  }
}

run();
