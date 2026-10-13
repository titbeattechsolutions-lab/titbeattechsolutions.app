import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://aaxdgakkwlaqevuysaxw.supabase.co';
const supabaseKey = 'sb_publishable_UhKYgRAJebN5QY9ZJ9rLNg_mKYsbqMl';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: totalActiveStudents, error: e1 } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  const { count: totalAllStudents, error: e2 } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true });

  const { data: schools, error: e3 } = await supabase
    .from('schools')
    .select('id, name, current_students');

  const sumSchoolCurrentStudents = (schools || []).reduce((acc: number, s: any) => acc + (s.current_students || 0), 0);

  console.log('=== LIVE SUPABASE DATA DISCOVERY ===');
  console.log('Total Active Students in students table:', totalActiveStudents, 'Error:', e1);
  console.log('Total All Students in students table:', totalAllStudents, 'Error:', e2);
  console.log('Sum of schools.current_students column:', sumSchoolCurrentStudents, 'Error:', e3);
  console.log('Schools breakdown:', JSON.stringify(schools, null, 2));
}

check();
