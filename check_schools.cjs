const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://aaxdgakkwlaqevuysaxw.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFheGRnYWtrd2xhcWV2dXlzYXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMjg5NjgsImV4cCI6MjEwMDgwNDk2OH0.surg4YBPcOy9W3v6-ouQRJFOBfUNuLYmiIt3qS8UrA4');

async function run() {
  const { data, error } = await supabase.from('schools').select('id, name, logo, tenant_id').eq('name', 'Greatmind Academy');
  console.log(data ? data.map(d => ({ ...d, logo: d.logo ? 'YES (length: ' + d.logo.length + ')' : 'NO' })) : error);
}
run();
