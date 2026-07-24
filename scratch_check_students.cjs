const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envContent = fs.readFileSync('.env', 'utf-8');
let url = '', key = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].replace(/"/g, '').trim();
  if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) key = line.split('=')[1].replace(/"/g, '').trim();
});
const supabase = createClient(url, key);
(async () => {
  const { data, error } = await supabase.from('students').select('id, first_name, last_name, class_name').limit(10);
  console.log('Error:', error);
  console.log('Data count:', data ? data.length : 0);
  if (data && data.length > 0) {
     console.log('Sample students:', data);
  }
})();
