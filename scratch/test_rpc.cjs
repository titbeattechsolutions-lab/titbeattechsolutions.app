const https = require('https');

const data = JSON.stringify({
  _session_token: "dummy_token"
});

const options = {
  hostname: 'fliphfrxuhmhnxtmettd.supabase.co',
  port: 443,
  path: '/rest/v1/rpc/check_tenant_session_status',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_ANON_KEY || ''
  }
};

const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const anonKeyMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY="(.*)"/);
if (anonKeyMatch) {
  options.headers['apikey'] = anonKeyMatch[1];
  options.headers['Authorization'] = `Bearer ${anonKeyMatch[1]}`;
}

const req = https.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('Response:', body));
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
