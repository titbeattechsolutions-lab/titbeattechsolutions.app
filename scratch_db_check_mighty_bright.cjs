const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fliphfrxuhmhnxtmettd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaXBoZnJ4dWhtaG54dG1ldHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODUyNTUsImV4cCI6MjA5MjI2MTI1NX0.-5q6bBebbWoBU0uDIAQGyDFb-BbvghuMdl3T0Uil6qc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Querying for Mighty bright...');
  
  // Try schools table
  const { data: schools, error: schoolErr } = await supabase.from('schools').select('id, name, tenant_id').ilike('name', '%Mighty bright%');
  if (schoolErr) {
    console.log('Schools err:', schoolErr);
  }
  
  let tenantIds = schools?.map(s => s.tenant_id) || [];
  
  if (tenantIds.length === 0) {
    const { data: tenants, error: tenErr } = await supabase.from('tenants').select('id, school_name').ilike('school_name', '%Mighty bright%');
    tenantIds = tenants?.map(t => t.id) || [];
  }
  
  if (tenantIds.length === 0) {
    console.log('No tenant found for Mighty bright.');
    return;
  }
  
  console.log('Tenant IDs found:', tenantIds);
  
  const { data: tdList, error: tdErr } = await supabase.from('tenant_data').select('tenant_id, data').in('tenant_id', tenantIds);
  
  if (tdErr) {
    console.error('Error fetching tenant_data:', tdErr);
    return;
  }
  
  for (const td of tdList || []) {
    const rolls = td.data.classRolls || {};
    let total = 0;
    console.log(`\n--- Tenant ${td.tenant_id} classRolls ---`);
    for (const [clsName, students] of Object.entries(rolls)) {
      if (Array.isArray(students)) {
        console.log(`Class ${clsName}: ${students.length} students`);
        total += students.length;
      } else {
        console.log(`Class ${clsName}: (not an array)`);
      }
    }
    console.log(`Total students in classRolls: ${total}`);
  }
}

main().catch(console.error);
