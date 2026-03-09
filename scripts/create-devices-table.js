/**
 * Creates the `devices` table in Supabase for per-user device storage.
 * Run: node scripts/create-devices-table.js
 *
 * This uses the Supabase Management API (service role) to execute DDL via rpc.
 * If that doesn't work, run the SQL manually in Supabase SQL Editor.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env.local');
  process.exit(1);
}

const SQL = `
-- Devices table for per-user device storage
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL DEFAULT 'Unknown',
  ip TEXT NOT NULL DEFAULT '0.0.0.0',
  os TEXT NOT NULL DEFAULT 'Unknown',
  agent_version TEXT DEFAULT '1.0.0',
  client_name TEXT DEFAULT 'Agent',
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TIMESTAMPTZ DEFAULT now(),
  country TEXT DEFAULT '',
  country_code TEXT DEFAULT '',
  city TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Disable RLS for admin-panel access (all access goes through our server key)
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Allow all operations with the anon/service key
CREATE POLICY IF NOT EXISTS "Allow all for authenticated" ON devices
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups by owner
CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_id);
`;

console.log('=== SQL to create devices table ===');
console.log(SQL);
console.log('===================================');
console.log('');
console.log('Please run the above SQL in your Supabase SQL Editor:');
console.log(`${SUPABASE_URL}/project/default/sql`);
console.log('');

// Try to test if the table already exists
function supabaseRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers,
    };
    const req = transport.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  try {
    const test = await supabaseRequest(`${SUPABASE_URL}/rest/v1/devices?select=device_id&limit=1`, 'GET');
    if (test.status === 200) {
      console.log('✓ Table "devices" already exists and is accessible!');
    } else if (test.status === 404 || (test.data && test.data.message && test.data.message.includes('does not exist'))) {
      console.log('✗ Table "devices" does not exist yet. Please create it using the SQL above.');
    } else {
      console.log(`? Unexpected response (${test.status}):`, test.data);
      console.log('  You may need to create the table manually using the SQL above.');
    }
  } catch (err) {
    console.error('Error testing table:', err.message);
  }
})();
