/**
 * Generate an admin license key for initial setup.
 *
 * Usage:
 *   node scripts/generate-admin-key.js
 *   node scripts/generate-admin-key.js --days 365 --devices 100
 *
 * The generated key is in VI-XXXX-XXXX-XXXX-XXXX format and saved to Supabase.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load .env.local if it exists
const envFile = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// Parse CLI args
const args = process.argv.slice(2);
let days = 365;
let devices = 1000;
let owner = 'master-admin';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days' && args[i + 1]) days = parseInt(args[i + 1]);
  if (args[i] === '--devices' && args[i + 1]) devices = parseInt(args[i + 1]);
  if (args[i] === '--owner' && args[i + 1]) owner = args[i + 1];
}

function generateVIKey() {
  const block = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `VI-${block()}-${block()}-${block()}-${block()}`;
}

const now = new Date();
const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const keyId = crypto.randomBytes(8).toString('hex').toUpperCase();
const key = generateVIKey();

console.log('');
console.log('=============================================');
console.log('  Admin License Key Generated');
console.log('=============================================');
console.log('');
console.log('  Key:', key);
console.log('');
console.log('  Type:       admin (full access + key generation)');
console.log('  Plan:       enterprise');
console.log('  Devices:   ', devices);
console.log('  Duration:  ', days, 'days');
console.log('  Expires:   ', expires.toISOString().split('T')[0]);
console.log('  Owner:     ', owner);
console.log('');

// Save to Supabase if env vars are set
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (SUPABASE_URL && SUPABASE_KEY) {
  const https = require('https');
  const http = require('http');
  const url = new URL(`${SUPABASE_URL}/rest/v1/license_keys`);
  const transport = url.protocol === 'https:' ? https : http;

  const body = JSON.stringify({
    key,
    key_id: keyId,
    type: 'admin',
    plan: 'enterprise',
    max_devices: devices,
    duration_days: days,
    owner: owner,
    expires_at: expires.toISOString(),
    created_at: now.toISOString(),
    activated: false,
  });

  const reqOpts = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const req = transport.request(reqOpts, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('  ✓ Saved to Supabase');
    } else {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => console.log('  ✗ Supabase error:', res.statusCode, data));
    }
    console.log('=============================================');
    console.log('');
  });
  req.on('error', (e) => {
    console.log('  ✗ Supabase connection error:', e.message);
    console.log('=============================================');
    console.log('');
  });
  req.write(body);
  req.end();
} else {
  console.log('  ⚠ Supabase not configured — key will only work if manually added to DB');
  console.log('=============================================');
  console.log('');
}
