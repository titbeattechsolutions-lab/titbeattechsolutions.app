import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fliphfrxuhmhnxtmettd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaXBoZnJ4dWhtaG54dG1ldHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODUyNTUsImV4cCI6MjA5MjI2MTI1NX0.-5q6bBebbWoBU0uDIAQGyDFb-BbvghuMdl3T0Uil6qc';
const token = 'eyJhbGciOiJFUzI1NiIsImtpZCI6Ijc1ZmQ4NGY4LTJmM2QtNGMyZC05NjcwLTM4NjUzYWY3YzkwMCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2ZsaXBoZnJ4dWhtaG54dG1ldHRkLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI2NmY0ZDMwZS04YTAxLTRiZTctOWNiMi1lNzBjNjk2NjljYTQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzg0NzIzNDgyLCJpYXQiOjE3ODQ3MTk4ODIsImVtYWlsIjoicGNoaWRlcmFzYW11ZWxAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InBjaGlkZXJhc2FtdWVsQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjY2ZjRkMzBlLThhMDEtNGJlNy05Y2IyLWU3MGM2OTY2OWNhNCJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzg0NjQ4NTQ1fV0sInNlc3Npb25faWQiOiJjYjU1NWI0ZC01MTI2LTQ0ZjEtODY2MS01ODc3MDI2YjkxYjgiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.WwRNT9vl1q9iiA9a4JrADxITMlyUSD1GDFEaDZLfrfamfifhMMgjyfo_vt4k-XH_w6a0EIGfvSpI9C2u6Exa2A';

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { headers: { Authorization: `Bearer ${token}` } }
});

const recoveredJsonString = `{"entries":[{"id":"mrml6hei0ptpoojgd7vd","term":"First Term","total":70,"caScore":40,"session":"2024/2025","subject":"Data Processing","createdAt":"2026-07-15T21:22:43.482Z","enteredBy":"Admin","examScore":30,"studentName":"ADA","studentClass":"SS 1"},{"id":"mragkjj8pk4oqbg1leb","term":"First Term","total":80,"caScore":40,"session":"2024/2025","subject":"Mathematics","createdAt":"2026-07-07T09:40:27.236Z","enteredBy":"Mr. Chidi Eze","examScore":40,"studentName":"PROSPER","studentClass":"JSS 1"},{"id":"mrbcg4s97wbpexz0x1","term":"First Term","total":80,"caScore":30,"session":"2024/2025","subject":"Mathematics","createdAt":"2026-07-08T00:32:49.209Z","enteredBy":"Mr. Chidi Eze","examScore":50,"studentName":"douglas","studentClass":"JSS 3"},{"id":"mrberla51klr5paa1vv","term":"First Term","total":50,"caScore":20,"session":"2024/2025","subject":"Mathematics","createdAt":"2026-07-08T01:37:43.037Z","enteredBy":"Mr. Chidi Eze","examScore":30,"studentName":"Doku","studentClass":"JSS 2"},{"id":"mrbvl0fem7fztchs2lm","term":"First Term","total":60,"caScore":20,"session":"2024/2025","subject":"Quantitative Reasoning","createdAt":"2026-07-08T09:28:29.546Z","enteredBy":"Admin","examScore":40,"studentName":"eze obi","studentClass":"Primary 5"},{"id":"mrdf28fabylsgt81lj","term":"First Term","total":60,"caScore":30,"session":"2024/2025","subject":"Computer Studies","createdAt":"2026-07-09T11:21:31.942Z","enteredBy":"Admin","examScore":30,"studentName":"eke","studentClass":"JSS 2"},{"id":"mrdgdchk67no06medr","term":"First Term","total":80,"caScore":30,"session":"2024/2025","subject":"Social Studies","createdAt":"2026-07-09T11:58:10.040Z","enteredBy":"Admin","examScore":50,"studentName":"gloria","studentClass":"Primary 5"},{"id":"mrgpepr2cyjz66eaxqh","term":"First Term","total":90,"caScore":40,"session":"2024/2025","subject":"ICT","createdAt":"2026-07-11T18:34:28.958Z","enteredBy":"Admin","examScore":50,"studentName":"Keita","studentClass":"Primary 6"},{"id":"mrgq6cejynh10m8k1u","term":"First Term","total":80,"caScore":40,"session":"2024/2025","subject":"Basic Technology","createdAt":"2026-07-11T18:55:58.027Z","enteredBy":"Admin","examScore":40,"studentName":"Christopher","studentClass":"JSS 3"},{"id":"mrnn02e3qn7cc5legz8","term":"First Term","total":70,"caScore":30,"session":"2024/2025","subject":"CRS","createdAt":"2026-07-16T15:01:29.499Z","enteredBy":"Admin","examScore":40,"studentName":"FABIAN","studentClass":"JSS 1"},{"id":"mrvq2tywpot3xqthpdl","term":"First Term","total":70,"caScore":30,"session":"2024/2025","subject":"Government","createdAt":"2026-07-22T06:49:46.808Z","enteredBy":"Mrs. Gloria","examScore":40,"studentName":"Blessing","studentClass":"SS 1"},{"id":"mrvrptd8f0g7lhp1vtl","term":"First Term","total":90,"caScore":40,"session":"2024/2025","subject":"Government","createdAt":"2026-07-22T07:35:38.732Z","enteredBy":"Mrs. Gloria","examScore":50,"studentName":"ROSE","studentClass":"SS 1"}],"bin":[],"logs":[{"id":"mrw0a4mslvun1zgr1y","ts":"2026-07-22T11:35:23.380Z","actor":"Admin","action":"Signed In","detail":"2026-07-22 12:35","student":"Admin","subject":"Administrator"},{"id":"mrvrptd8hzr65bic0i","ts":"2026-07-22T07:35:38.732Z","actor":"Mrs. Gloria","action":"Added","detail":"Total: 90","student":"ROSE","subject":"Government"},{"id":"mrvrnguo8rjl6rbcp7w","ts":"2026-07-22T07:33:49.200Z","actor":"Mrs. Gloria","action":"Class Roll Saved","detail":"","student":"4 student(s)","subject":"SS 1"},{"id":"mrvrmab9016rk3sxh67o","ts":"2026-07-22T07:32:54.069Z","actor":"","action":"Updated","detail":"","student":"obi","subject":"Secretary"},{"id":"mrvregltl09zykg7tj","ts":"2026-07-22T07:26:48.977Z","actor":"","action":"Updated","detail":"","student":"Mrs. Gloria","subject":"Class Teacher"},{"id":"mrvree8tf74922e7ukm","ts":"2026-07-22T07:26:45.917Z","actor":"","action":"Updated","detail":"","student":"Mrs. Gloria","subject":"Class Teacher"},{"id":"mrvree8t7xfrmgzizb9","ts":"2026-07-22T07:26:45.917Z","actor":"","action":"Updated","detail":"","student":"Mrs. Gloria","subject":"Class Teacher"},{"id":"mrvrec22w119ttoumei","ts":"2026-07-22T07:26:43"}]}`;

async function run() {
  const recoveredData = JSON.parse(recoveredJsonString);
  const tenantId = 'e42d976e-6c42-4b8c-aa96-d4bfc19d8359'; // Mighty Bright

  // 1. Fetch current data
  const { data: current, error } = await supabase.from('tenant_data').select('data').eq('tenant_id', tenantId).single();
  if (error) {
    console.error('Fetch error:', error);
    return;
  }

  let dbData = current.data;
  const currentEntries = dbData.entries || [];
  const currentLogs = dbData.logs || [];

  const recoveredEntries = recoveredData.entries || [];
  const recoveredLogs = recoveredData.logs || [];

  console.log(`Current DB entries: ${currentEntries.length}`);
  console.log(`Recovered entries: ${recoveredEntries.length}`);

  // 2. Merge entries by ID (Recovered wins)
  const entriesMap = new Map();
  currentEntries.forEach(e => entriesMap.set(e.id, e));
  recoveredEntries.forEach(e => entriesMap.set(e.id, e));
  dbData.entries = Array.from(entriesMap.values());

  // 3. Merge logs by ID
  const logsMap = new Map();
  currentLogs.forEach(l => logsMap.set(l.id, l));
  recoveredLogs.forEach(l => logsMap.set(l.id, l));
  dbData.logs = Array.from(logsMap.values());

  // Also bump the _rev
  dbData._rev = (dbData._rev || 0) + 1;

  console.log(`Merged DB entries: ${dbData.entries.length}`);

  // 4. Update the database
  const { error: updateError } = await supabase.from('tenant_data').update({ data: dbData }).eq('tenant_id', tenantId);
  
  if (updateError) {
    console.error('Update error:', updateError);
  } else {
    console.log('Successfully merged and restored the data without duplicates!');
  }
}

run();
