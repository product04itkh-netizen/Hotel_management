const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if(k && v) acc[k] = v.trim();
  return acc;
}, {});

const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
const sql = 'ALTER TABLE hotel_settings ADD COLUMN IF NOT EXISTS period_lock_password TEXT;';

const options = {
  hostname: url.hostname,
  path: '/rest/v1/rpc/exec_sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
};

// Try using pg directly via the Supabase postgres connection string
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Check if column already exists by reading the table
  const { data, error } = await supabase.from('hotel_settings').select('period_lock_password').limit(1);
  if (!error) {
    console.log('Column period_lock_password already exists! Value:', data);
  } else {
    console.log('Column does not exist yet:', error.message);
    console.log('Please apply migration 027_period_lock_password.sql manually via the Supabase SQL editor.');
  }
}
run();
