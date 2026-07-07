const fs = require('fs');
const envStr = fs.readFileSync('.env', 'utf8');
const env = {};
envStr.split('\n').forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if(m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

supabase.from('staff_session_logs').select('*').then(res => {
  console.log("DB response:");
  console.dir(res, {depth: null});
}).catch(console.error);
