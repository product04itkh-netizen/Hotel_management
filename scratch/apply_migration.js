const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if(k && v) acc[k] = v.trim();
  return acc;
}, {});

// Use Supabase Management API via direct SQL endpoint
async function run() {
  const url = `https://fkpbleuutvwyfljamurz.supabase.co/rest/v1/rpc/exec`;
  
  // Alternative: Use the Supabase postgres REST endpoint
  const res = await fetch(`https://fkpbleuutvwyfljamurz.supabase.co/rest/v1/hotel_settings?select=period_lock_password&limit=1`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    }
  });
  
  const body = await res.text();
  console.log('Check column status:', res.status, body.substring(0, 200));
}
run();
