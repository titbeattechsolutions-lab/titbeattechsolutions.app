const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fliphfrxuhmhnxtmettd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaXBoZnJ4dWhtaG54dG1ldHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODUyNTUsImV4cCI6MjA5MjI2MTI1NX0.-5q6bBebbWoBU0uDIAQGyDFb-BbvghuMdl3T0Uil6qc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Querying tenant_activity_logs...');
  const { data, error } = await supabase.from('tenant_activity_logs').select('*').limit(5);
  console.log('Data:', data);
  console.log('Error:', error);
}

main().catch(console.error);
