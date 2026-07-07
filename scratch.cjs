const fs = require('fs');
const envStr = fs.readFileSync('.env', 'utf8');
const env = {};
envStr.split(/\r?\n/).forEach(line => {
  const m = line.match(/^([^=]+)=(.*)$/);
  if(m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '').trim();
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

supabase.from('staff_session_logs').select('*').then(res => {
  console.log("DB response:");
  console.dir(res, {depth: null});
}).catch(console.error);
