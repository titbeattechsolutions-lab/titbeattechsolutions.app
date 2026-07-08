const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Querying tenant_activity_logs...');
  const { data, error } = await supabase.from('tenant_activity_logs').select('*').limit(5);
  console.log('Data:', data);
  console.log('Error:', error);
}

main().catch(console.error);
