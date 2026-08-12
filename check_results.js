import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envVars = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/\r$/, '');
  return acc;
}, {});

const url = envVars.VITE_SUPABASE_URL;
const key = envVars.VITE_SUPABASE_ANON_KEY || envVars.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url) throw new Error("URL missing from .env.local");

const supabase = createClient(url, key);

async function check() {
  const { data: results, error: resErr } = await supabase.from('results').select('id, student_id, student_name, subject_name, academic_year, term').limit(5);
  console.log('--- RESULTS ---');
  console.log('Error:', resErr);
  console.log('Data:', results);

  const { data: reports, error: repErr } = await supabase.from('report_cards').select('id, student_id, student_name, academic_year, term').limit(5);
  console.log('\n--- REPORT CARDS ---');
  console.log('Error:', repErr);
  console.log('Data:', reports);
}

check();
