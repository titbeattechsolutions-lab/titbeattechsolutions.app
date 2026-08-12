import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if(key && val) env[key.trim()] = val.join('=').trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('schools').select('id, name, logo, tenant_id');
  console.log(data ? data.map(d => ({ ...d, logo: d.logo ? 'YES (length: ' + d.logo.length + ')' : 'NO' })) : error);
}
run();
