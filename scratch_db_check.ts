import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

let envStr = '';
try { envStr = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8'); } catch(e) {}
if (!envStr) {
  try { envStr = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8'); } catch(e) {}
}

const env: Record<string, string> = {};
envStr.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLogs() {
  const { data, error } = await supabase.from('staff_session_logs').select('*').limit(5).order('created_at', { ascending: false });
  if (error) {
    console.error("Error querying staff_session_logs:", error);
  } else {
    console.log("Latest logs:", JSON.stringify(data, null, 2));
  }
}

checkLogs();
