/**
 * VisualIllusion — Launcher (Full Automation)
 *
 * Opens a beautiful GUI in the browser. Manages the Next.js panel
 * and WebSocket server as child processes. Automatically kills busy
 * ports, monitors health, and restarts crashed services.
 *
 * Build:
 *   npm run build:exe
 */

const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const crypto = require('crypto');

// Auth dependencies
let bcrypt = null;
try { bcrypt = require('bcryptjs'); } catch {}

const LAUNCHER_PORT = 3333;
const PANEL_PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;
const _isAsar = !process.pkg && __dirname.includes('app.asar');
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
// Writable directory for user data (.env.local, .license, .nickname, downloads, etc.)
// Inside Electron asar archive, __dirname is read-only; redirect writes to install root.
const DATA_DIR = _isAsar ? path.dirname(process.execPath) : BASE_DIR;

// Read version from package.json rather than hardcoding
function _readAppVersion() {
  try {
    const vf = path.join(BASE_DIR, 'version.json');
    if (fs.existsSync(vf)) {
      const d = JSON.parse(fs.readFileSync(vf, 'utf-8'));
      if (d.version) return d.version;
    }
  } catch {}
  try {
    const pj = path.join(BASE_DIR, 'package.json');
    if (fs.existsSync(pj)) {
      const d = JSON.parse(fs.readFileSync(pj, 'utf-8'));
      if (d.version) return d.version;
    }
  } catch {}
  return '1.5.5';
}
const APP_VERSION = _readAppVersion();

// ============================================================
// PROTECTION: Anti-Tampering & Environment Checks
// ============================================================

const _RE_TOOLS = [
  'ollydbg','x64dbg','x32dbg','windbg','ida','ida64','idag','idag64',
  'idaw','idaw64','idaq','idaq64','radare2','r2','ghidra',
  'processhacker','procmon','procmon64','procexp','procexp64',
  'fiddler','wireshark','charles','mitmproxy','httpdebuggerpro',
  'dnspy','de4dot','ilspy','dotpeek','justdecompile',
  'cheatengine','cheatengine-x86_64','ce','hxd','hxd64',
  'resourcehacker','reshack','pestudio','die','exeinfope',
  'apimonitor','api_monitor','scylla','scylla_x64','scylla_x86',
  'httpdebugger','httpdebuggersvc','binaryninja','cutter',
];

let _reCheckTimer = null;

function _scanReverseTools() {
  try {
    const tasks = execSync('tasklist /FO CSV /NH', {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).toLowerCase();
    for (const t of _RE_TOOLS) {
      if (tasks.includes(t)) return t;
    }
  } catch { /* tasklist may fail */ }
  return null;
}

function _startProtectionMonitor() {
  // Don't run in dev mode
  if (process.argv.includes('--dev') || process.env.NODE_ENV === 'development') return;
  
  const check = () => {
    const found = _scanReverseTools();
    if (found) {
      // Silently kill the debugging/RE tool instead of shutting down our app
      try {
        execSync(`taskkill /F /IM "${found}.exe"`, {
          encoding: 'utf-8',
          timeout: 5000,
          windowsHide: true,
        });
      } catch { /* process may already be gone */ }
    }
  };
  
  check(); // Initial check
  _reCheckTimer = setInterval(check, 20000); // Every 20 seconds
}

// Anti-tampering: verify launcher hasn't been modified at runtime
function _selfIntegrityCheck() {
  try {
    const selfPath = __filename;
    if (!fs.existsSync(selfPath)) return; // Running from ASAR, skip
    const stat = fs.statSync(selfPath);
    // If file is unreasonably small, likely replaced with a stub
    if (stat.size < 10000) {
      console.error('[Security] Файл повреждён');
      process.exit(1);
    }
  } catch { /* ASAR or other environment — skip */ }
}

_selfIntegrityCheck();

// ---- Load env vars ----
function loadEnvVars() {
  const envPath = path.join(DATA_DIR, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvVars();

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';
let LICENSE_SECRET = process.env.LICENSE_SECRET || 'default-license-secret-change-me';

// Re-read Supabase config from process.env (called after ensureStaticFiles creates .env.local)
function reloadSupabaseConfig() {
  SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';
  if (SUPABASE_URL) console.log('[Launcher] Supabase URL загружен:', SUPABASE_URL.substring(0, 40) + '...');
  else console.warn('[Launcher] SUPABASE_URL пуст — Supabase недоступен');
}
let _cachedLicenseInfo = null; // Populated on login/status check for sync getHTML()
let _cachedUpdateInfo = null; // { version, download_url, file_size, sha256, changelog }
let _lastUpdateCheck = 0; // timestamp of last update check

// ---- Supabase REST helper ----
function supabaseRequest(method, tablePath, body) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return reject(new Error('Supabase not configured'));
    const url = new URL(SUPABASE_URL + '/rest/v1/' + tablePath);
    const transport = url.protocol === 'https:' ? https : http;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=representation',
    };
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: headers,
    };
    if (body) {
      const b = JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(b);
    }
    const req = transport.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---- Session store (in-memory, simple token) ----
const sessions = {};

function createSession(userData) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { ...userData, createdAt: Date.now() };
  return token;
}

function getSession(token) {
  const s = sessions[token];
  if (!s) return null;
  // Expire after 24h
  if (Date.now() - s.createdAt > 24 * 60 * 60 * 1000) {
    delete sessions[token];
    return null;
  }
  return s;
}

function destroySession(token) {
  delete sessions[token];
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : null;
}

// ---- License key helpers (VI-XXXX-XXXX-XXXX-XXXX, DB-only verification) ----
function signPayload(payload) {
  // Legacy: kept for compat but no longer used for new keys
  return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex');
}

function normalizeLicenseKey(rawKey) {
  if (!rawKey) return '';
  return String(rawKey).replace(/\s+/g, '').trim().toUpperCase();
}

function generateVIKey() {
  const block = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `VI-${block()}-${block()}-${block()}-${block()}`;
}

/** Verify key against Supabase DB. Returns key info or null. */
async function verifyKeyFromDB(key) {
  const normalizedKey = normalizeLicenseKey(key);
  if (!normalizedKey) return null;
  try {
    const resp = await supabaseRequest('GET', 'license_keys?key=eq.' + encodeURIComponent(normalizedKey) + '&select=id,key_id,type,plan,max_devices,duration_days,expires_at,created_at,owner,activated,activated_by,hwid&limit=1');
    if (!resp.data || !Array.isArray(resp.data) || resp.data.length === 0) return null;
    const db = resp.data[0];
    const expires = new Date(db.expires_at);
    const now = new Date();
    return {
      id: db.key_id,
      type: db.type || 'user',
      plan: db.plan || 'basic',
      maxDevices: db.max_devices || 1,
      expiresAt: db.expires_at,
      createdAt: db.created_at || now.toISOString(),
      owner: db.owner || '',
      expired: now > expires,
      daysLeft: Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / 86400000)),
      dbId: db.id,
      activated: db.activated,
      activated_by: db.activated_by,
      hwid: db.hwid,
    };
  } catch (err) {
    console.error('[License] DB verify failed:', err.message);
    return null;
  }
}

/** Generate admin key, save to DB and return as VI-key */
async function generateAdminKeyDB(ownerName) {
  const now = new Date();
  const expires = new Date(now.getTime() + 36500 * 24 * 60 * 60 * 1000); // 100 years
  const key = generateVIKey();
  const keyId = crypto.randomBytes(8).toString('hex').toUpperCase();
  try {
    await supabaseRequest('POST', 'license_keys', {
      key: key,
      key_id: keyId,
      type: 'admin',
      plan: 'enterprise',
      max_devices: 10000,
      duration_days: 36500,
      owner: ownerName || 'admin',
      expires_at: expires.toISOString(),
      created_at: now.toISOString(),
      activated: true,
      activated_by: ownerName || 'admin',
      activated_at: now.toISOString(),
    });
  } catch (err) {
    console.error('[License] Failed to save admin key to DB:', err.message);
  }
  return key;
}

async function ensureAdminLicense(username) {
  // Check if existing license file is valid admin in DB
  const existing = _readLicenseFile();
  if (existing) {
    const info = await verifyKeyFromDB(existing);
    if (info && !info.expired && info.type === 'admin') return info;
  }
  // Before generating a new key, check DB for existing admin keys for this owner
  try {
    const ownerName = username || 'admin';
    const resp = await supabaseRequest('GET', 'license_keys?type=eq.admin&owner=eq.' + encodeURIComponent(ownerName) + '&order=created_at.desc&limit=1&select=key,expires_at');
    if (resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
      const dbKey = resp.data[0];
      const expires = new Date(dbKey.expires_at);
      if (expires > new Date()) {
        // Reuse existing admin key from DB
        _saveLicenseFile(dbKey.key);
        const info = await verifyKeyFromDB(dbKey.key);
        if (info) return info;
      }
    }
  } catch (e) {
    console.error('[License] DB lookup for existing admin key failed:', e.message);
  }
  // No valid admin key found anywhere — generate new one
  const key = await generateAdminKeyDB(username);
  _saveLicenseFile(key);
  const info = await verifyKeyFromDB(key);
  return info;
}

function getLocalHWID() {
  // Enhanced HWID: uses multiple hardware identifiers for stronger binding
  const cpus = os.cpus();
  const networkInterfaces = os.networkInterfaces();
  
  // Collect MAC addresses of physical network interfaces
  let macs = [];
  for (const [name, addrs] of Object.entries(networkInterfaces)) {
    for (const a of addrs) {
      if (!a.internal && a.mac && a.mac !== '00:00:00:00:00:00') {
        macs.push(a.mac);
      }
    }
  }
  macs.sort();
  
  const raw = [
    os.hostname(),
    cpus[0] ? cpus[0].model : '',
    cpus.length.toString(),
    os.totalmem().toString(),
    os.platform(),
    os.arch(),
    macs.join(','),
  ].join('|');
  
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 24).toUpperCase();
}

// Encrypted local storage for license info
const _LICENSE_CIPHER_KEY = crypto.createHash('sha256').update(os.hostname() + os.platform() + os.totalmem()).digest();

function _encryptLicense(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', _LICENSE_CIPHER_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function _decryptLicense(str) {
  try {
    const [ivHex, enc] = str.split(':');
    if (!ivHex || !enc) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', _LICENSE_CIPHER_KEY, iv);
    let decrypted = decipher.update(enc, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return JSON.parse(decrypted);
  } catch { return null; }
}

// Write license file encrypted
function _saveLicenseFile(key) {
  const licFile = path.join(DATA_DIR, '.license');
  const data = { k: key, h: getLocalHWID(), t: Date.now() };
  try {
    fs.writeFileSync(licFile, _encryptLicense(data), 'utf-8');
  } catch { 
    // Fallback: write plain key
    try { fs.writeFileSync(licFile, key, 'utf-8'); } catch {}
  }
}

// Read license file (handles both encrypted and plain format)
function _readLicenseFile() {
  const licFile = path.join(DATA_DIR, '.license');
  if (!fs.existsSync(licFile)) return null;
  const raw = fs.readFileSync(licFile, 'utf-8').trim();
  
  // Try encrypted format first
  const decrypted = _decryptLicense(raw);
  if (decrypted && decrypted.k) {
    // Verify HWID matches
    if (decrypted.h && decrypted.h !== getLocalHWID()) {
      console.error('[License] HWID mismatch — license file from different machine');
      return null;
    }
    return decrypted.k;
  }
  
  // Fallback: plain text key (for migration)
  if (/^VI-[A-Z0-9]{4}-/.test(raw)) {
    // Migrate to encrypted format
    _saveLicenseFile(raw);
    return raw;
  }
  
  return raw;
}

// Periodic license re-validation (every 30 minutes)
let _licenseRevalidateTimer = null;
function _startLicenseRevalidation() {
  if (_licenseRevalidateTimer) return;
  _licenseRevalidateTimer = setInterval(async () => {
    const key = _readLicenseFile();
    if (!key) return;
    try {
      const info = await verifyKeyFromDB(key);
      if (!info || info.expired) {
        console.error('[License] Лицензия истекла или недействительна при повторной проверке');
        _cachedLicenseInfo = null;
      } else {
        _cachedLicenseInfo = info;
      }
    } catch (e) {
      console.error('[License] Re-validation error:', e.message);
    }
  }, 30 * 60 * 1000);
}

// Pre-load optional modules at top level so pkg definitely bundles them
let _natUpnp = null;
try { _natUpnp = require('nat-upnp'); } catch {}
let _cloudflared = null;
try {
  _cloudflared = require('cloudflared');
  // When running from pkg or Electron, the cloudflared binary path may differ.
  if (_cloudflared.use) {
    let cfFound = false;
    // 1) Next to the exe (pkg dist or manual placement)
    const cfBin = path.join(BASE_DIR, 'cloudflared.exe');
    if (fs.existsSync(cfBin)) {
      _cloudflared.use(cfBin);
      console.log('[Cloudflared] Using:', cfBin);
      cfFound = true;
    }
    // 2) Electron extraResources folder
    if (!cfFound && process.env.ELECTRON_RUN) {
      const electronResources = path.join(path.dirname(process.execPath), 'resources', 'cloudflared.exe');
      if (fs.existsSync(electronResources)) {
        _cloudflared.use(electronResources);
        console.log('[Cloudflared] Using:', electronResources);
        cfFound = true;
      }
    }
    // 3) node_modules (development or dist with node_modules)
    if (!cfFound) {
      const cfModBin = path.join(BASE_DIR, 'node_modules', 'cloudflared', 'bin', 'cloudflared.exe');
      if (fs.existsSync(cfModBin)) {
        _cloudflared.use(cfModBin);
        console.log('[Cloudflared] Using:', cfModBin);
        cfFound = true;
      }
    }
    if (!cfFound && process.pkg) {
      console.log('[Cloudflared] Binary not found — tunnels unavailable');
      _cloudflared = null;
    }
  }
} catch {}

// ---- Resolve node binary ----
function findNodeBinary() {
  if (!process.pkg) return process.execPath;
  try {
    const where = os.platform() === 'win32' ? 'where node' : 'which node';
    const nodePath = execSync(where, { encoding: 'utf-8' }).trim().split(/\r?\n/)[0].trim();
    if (nodePath && fs.existsSync(nodePath)) return nodePath;
  } catch { /* ignore */ }
  const portable = path.join(BASE_DIR, 'node.exe');
  if (fs.existsSync(portable)) return portable;
  return null;
}

const NODE_BIN = findNodeBinary();

const setupState = {
  startedAt: null,
  finishedAt: null,
  currentStep: '',
  done: false,
  success: false,
  publicIP: null,
  localIP: null,
  wsUrl: null,
  panelUrl: null,
  steps: [
    { id: 'env', label: 'Проверка окружения', status: 'pending', message: 'Ожидание...' },
    { id: 'build-tools', label: 'Подготовка инструментов сборки', status: 'pending', message: 'Ожидание...' },
    { id: 'firewall', label: 'Настройка Windows Firewall', status: 'pending', message: 'Ожидание...' },
    { id: 'upnp', label: 'Автопроброс портов (UPnP)', status: 'pending', message: 'Ожидание...' },
    { id: 'public-ip', label: 'Определение внешнего IP', status: 'pending', message: 'Ожидание...' },
    { id: 'port-check', label: 'Проверка внешнего доступа', status: 'pending', message: 'Ожидание...' },
    { id: 'tunnel', label: 'Автотуннель (если порты закрыты)', status: 'pending', message: 'Ожидание...' },
    { id: 'ws-config', label: 'Итоговая настройка WebSocket', status: 'pending', message: 'Ожидание...' },
  ],
};

function setSetupStep(stepId, status, message) {
  const step = setupState.steps.find((s) => s.id === stepId);
  if (!step) return;
  step.status = status;
  if (message) step.message = message;
  setupState.currentStep = step.label;
}

function runCommand(command) {
  return new Promise((resolve) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || ''), error });
    });
  });
}

function getPublicIP() {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.ip || null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function upsertEnvVar(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, `${key}=${value}`);
  const suffix = content.endsWith('\n') ? '' : '\n';
  return `${content}${suffix}${key}=${value}\n`;
}

// ---- Generate or load stable SERVER_ID ----
function getOrCreateServerId() {
  const envPath = path.join(DATA_DIR, '.env.local');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/^SERVER_ID=(.+)$/m);
    if (match && match[1].trim()) return match[1].trim();
  }
  // Generate new server ID
  const id = crypto.randomBytes(8).toString('hex');
  content = upsertEnvVar(content, 'SERVER_ID', id);
  fs.writeFileSync(envPath, content, 'utf-8');
  console.log(`[Discovery] New SERVER_ID: ${id}`);
  return id;
}

// ---- Publish discovery URL to ntfy.sh ----
function publishDiscoveryUrl(serverId, wsUrl, panelUrl) {
  const payload = JSON.stringify({ ws: wsUrl, panel: panelUrl, ts: Date.now() });
  const topicName = `ra-disc-${serverId}`;
  const options = {
    hostname: 'ntfy.sh',
    path: `/${topicName}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'X-Title': 'RA-Discovery',
      'X-Priority': '1',
    },
    timeout: 10000,
  };
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        console.log(`[Discovery] Published to ntfy.sh/${topicName} (${res.statusCode})`);
        resolve(true);
      });
    });
    req.on('error', (e) => {
      console.log(`[Discovery] Publish failed: ${e.message}`);
      resolve(false);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end(payload);
  });
}

function updateEnvFiles(wsUrl) {
  const envRoot = path.join(DATA_DIR, '.env.local');

  let content = '';
  if (fs.existsSync(envRoot)) {
    content = fs.readFileSync(envRoot, 'utf-8');
  }

  content = upsertEnvVar(content, 'NEXT_PUBLIC_WS_URL', wsUrl);
  content = upsertEnvVar(content, 'WS_SERVER_URL', wsUrl);

  fs.writeFileSync(envRoot, content, 'utf-8');
  // Copy to standalone only when not inside asar (env vars passed via process.env to child)
  if (!_isAsar) {
    const envStandalone = path.join(BASE_DIR, '.next', 'standalone', '.env.local');
    const standaloneDir = path.dirname(envStandalone);
    if (fs.existsSync(standaloneDir)) {
      fs.writeFileSync(envStandalone, content, 'utf-8');
    }
  }
}

async function configureWindowsFirewall() {
  if (os.platform() !== 'win32') {
    return { ok: true, skipped: true, message: 'Не Windows — шаг пропущен' };
  }

  const commands = [
    `netsh advfirewall firewall add rule name="VisualIllusion Panel 3000" dir=in action=allow protocol=TCP localport=${PANEL_PORT}`,
    `netsh advfirewall firewall add rule name="VisualIllusion WebSocket 3001" dir=in action=allow protocol=TCP localport=${WS_PORT}`,
  ];

  let failed = 0;
  for (const command of commands) {
    const result = await runCommand(command);
    if (!result.ok && !/An object with that name already exists|уже существует/i.test(result.stderr + result.stdout)) {
      failed++;
    }
  }

  if (failed > 0) {
    return { ok: false, message: 'Не удалось добавить правила (возможно, нужен запуск от администратора)' };
  }

  return { ok: true, message: 'Порты 3000 и 3001 разрешены во входящих подключениях' };
}

async function setupUpnpPortForwarding() {
  if (!_natUpnp) {
    return { ok: false, skipped: true, message: 'Модуль nat-upnp не найден (выполните npm i nat-upnp перед сборкой)' };
  }
  const upnp = _natUpnp;

  return new Promise((resolve) => {
    const client = upnp.createClient();
    const timeout = setTimeout(() => {
      try { client.close(); } catch {}
      resolve({ ok: false, message: 'UPnP не ответил (роутер не поддерживает или отключён)' });
    }, 8000);

    client.portMapping({ public: Number(PANEL_PORT), private: Number(PANEL_PORT), ttl: 0, protocol: 'TCP' }, (e1) => {
      if (e1) {
        clearTimeout(timeout);
        try { client.close(); } catch {}
        return resolve({ ok: false, message: 'Не удалось открыть порт 3000 через UPnP' });
      }

      client.portMapping({ public: Number(WS_PORT), private: Number(WS_PORT), ttl: 0, protocol: 'TCP' }, (e2) => {
        clearTimeout(timeout);
        try { client.close(); } catch {}
        if (e2) return resolve({ ok: false, message: 'Порт 3000 открыт, но 3001 не открылся через UPnP' });
        resolve({ ok: true, message: 'UPnP успешно открыл порты 3000 и 3001 на роутере' });
      });
    });
  });
}

// ---- Check if external port is reachable ----
function checkExternalPort(ip, port, timeout = 5000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; sock.destroy(); resolve(ok); } };
    sock.setTimeout(timeout);
    sock.on('connect', () => finish(true));
    sock.on('error', () => finish(false));
    sock.on('timeout', () => finish(false));
    sock.connect(port, ip);
  });
}

// ---- Tunnel state ----
let wsTunnel = null;
let panelTunnel = null;

// ---- Start cloudflared tunnel for a port ----
function startTunnel(port) {
  return new Promise((resolve) => {
    if (!_cloudflared || !_cloudflared.Tunnel) {
      console.log(`[Tunnel:${port}] _cloudflared is null or missing Tunnel class`);
      return resolve({ ok: false, url: null, tunnel: null, message: 'Модуль cloudflared не найден' });
    }

    try {
      console.log(`[Tunnel:${port}] Creating Tunnel.quick for http://localhost:${port}...`);
      const t = _cloudflared.Tunnel.quick(`http://localhost:${port}`);
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log(`[Tunnel:${port}] TIMEOUT - no URL after 30s`);
          resolve({ ok: false, url: null, tunnel: t, message: 'Таймаут создания туннеля (30с)' });
        }
      }, 30000);

      t.on('url', (url) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.log(`[Tunnel] Порт ${port} -> ${url}`);
          resolve({ ok: true, url, tunnel: t, message: url });
        }
      });

      t.on('error', (err) => {
        console.log(`[Tunnel:${port}] Error event: ${err.message || err}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ ok: false, url: null, tunnel: t, message: `Ошибка туннеля: ${err.message || err}` });
        }
      });

      t.on('exit', (code, signal) => {
        console.log(`[Tunnel:${port}] Exit: code=${code} signal=${signal}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ ok: false, url: null, tunnel: t, message: `Туннель завершился (код ${code})` });
        }
      });

      t.on('stderr', (data) => {
        console.log(`[Tunnel:${port}] stderr: ${data.trim().substring(0, 200)}`);
      });

      t.on('stdout', (data) => {
        console.log(`[Tunnel:${port}] stdout: ${data.trim().substring(0, 200)}`);
      });
    } catch (e) {
      console.log(`[Tunnel:${port}] Catch: ${e.message}`);
      resolve({ ok: false, url: null, tunnel: null, message: `Не удалось создать туннель: ${e.message}` });
    }
  });
}

async function runAutoSetup() {
  setupState.startedAt = Date.now();
  setupState.localIP = getLocalIP();

  // --- Step 1: Environment check ---
  setSetupStep('env', 'running', 'Проверяем Node.js и файлы запуска...');
  const nodeOk = !!NODE_BIN;
  const standaloneOk = fs.existsSync(path.join(BASE_DIR, '.next', 'standalone', 'server.js'));
  const wsFileOk = fs.existsSync(path.join(BASE_DIR, 'server', 'ws-server.js'));
  if (!nodeOk || !standaloneOk || !wsFileOk) {
    const missing = [];
    if (!nodeOk) missing.push('Node.js');
    if (!standaloneOk) missing.push('.next/standalone/server.js');
    if (!wsFileOk) missing.push('server/ws-server.js');
    setSetupStep('env', 'error', `Не хватает: ${missing.join(', ')}`);
    ['build-tools','firewall','upnp','public-ip','port-check','tunnel','ws-config'].forEach(id =>
      setSetupStep(id, 'warning', 'Пропущено из-за ошибки окружения'));
    setupState.done = true;
    setupState.success = false;
    setupState.finishedAt = Date.now();
    return;
  }
  setSetupStep('env', 'ok', 'Ок: все нужные файлы найдены');

  // --- Step 1.5: Build tools (pkg, resedit, base binary) ---
  setSetupStep('build-tools', 'running', 'Проверяем инструменты сборки клиентов...');
  try {
    await ensureBuildTools();
  } catch (e) {
    setSetupStep('build-tools', 'warning', `Ошибка: ${e.message}`);
  }

  // --- Step 2: Windows Firewall ---
  setSetupStep('firewall', 'running', 'Добавляем правила в Windows Firewall...');
  const fw = await configureWindowsFirewall();
  setSetupStep('firewall', fw.ok ? 'ok' : 'warning', fw.message);

  // --- Step 3: UPnP ---
  setSetupStep('upnp', 'running', 'Пробуем открыть порты на роутере через UPnP...');
  const upnp = await setupUpnpPortForwarding();
  setSetupStep('upnp', upnp.ok ? 'ok' : 'warning', upnp.message);

  // --- Step 4: Public IP ---
  setSetupStep('public-ip', 'running', 'Получаем внешний IP...');
  const publicIP = await getPublicIP();
  setupState.publicIP = publicIP;
  if (publicIP) setSetupStep('public-ip', 'ok', `Внешний IP: ${publicIP}`);
  else setSetupStep('public-ip', 'warning', 'Не удалось определить внешний IP');

  // --- Step 5: Real external port check ---
  let portsOpen = false;
  if (publicIP) {
    setSetupStep('port-check', 'running', `Проверяем ${publicIP}:${WS_PORT} снаружи...`);
    // Need to wait for WS server to start first before checking
    // WS starts after setup, so we start it early here for the check
    await startWS();
    await new Promise(r => setTimeout(r, 2000));
    const wsExtOk = await checkExternalPort(publicIP, Number(WS_PORT), 5000);
    if (wsExtOk) {
      portsOpen = true;
      setSetupStep('port-check', 'ok', `Порт ${WS_PORT} доступен снаружи!`);
    } else {
      setSetupStep('port-check', 'warning', `Порт ${WS_PORT} закрыт снаружи — нужен туннель`);
    }
  } else {
    setSetupStep('port-check', 'warning', 'Нет внешнего IP — нужен туннель');
  }

  // --- Step 6: Auto-tunnel if ports are closed ---
  let wsUrl, panelUrl;
  if (portsOpen && publicIP) {
    setSetupStep('tunnel', 'ok', 'Не нужен — порты открыты напрямую');
    wsUrl = `ws://${publicIP}:${WS_PORT}`;
    panelUrl = `http://${publicIP}:${PANEL_PORT}`;
  } else {
    setSetupStep('tunnel', 'running', 'Создаём Cloudflare туннели (бесплатно, без регистрации)...');

    const wsTunnelResult = await startTunnel(Number(WS_PORT));
    if (wsTunnelResult.ok) {
      wsTunnel = wsTunnelResult.tunnel;
      // cloudflared gives https:// URL, WebSocket works as wss://
      const wssTunnelUrl = wsTunnelResult.url.replace('https://', 'wss://').replace('http://', 'ws://');
      wsUrl = wssTunnelUrl;
      console.log(`[Tunnel] WS tunnel: ${wsUrl}`);
    } else {
      wsUrl = `ws://${setupState.localIP || 'localhost'}:${WS_PORT}`;
      console.log(`[Tunnel] WS tunnel failed, using local: ${wsUrl}`);
    }

    const panelTunnelResult = await startTunnel(Number(PANEL_PORT));
    if (panelTunnelResult.ok) {
      panelTunnel = panelTunnelResult.tunnel;
      panelUrl = panelTunnelResult.url;
      console.log(`[Tunnel] Panel tunnel: ${panelUrl}`);
    } else {
      panelUrl = `http://${setupState.localIP || 'localhost'}:${PANEL_PORT}`;
    }

    if (wsTunnelResult.ok && panelTunnelResult.ok) {
      setSetupStep('tunnel', 'ok', `Cloudflare туннели созданы!\nWS: ${wsUrl}\nPanel: ${panelUrl}`);
    } else if (wsTunnelResult.ok || panelTunnelResult.ok) {
      setSetupStep('tunnel', 'warning', `Частично: WS=${wsTunnelResult.ok?'✓':'✗'} Panel=${panelTunnelResult.ok?'✓':'✗'}`);
    } else {
      setSetupStep('tunnel', 'error', 'Не удалось создать туннели. Только локальный доступ.');
    }
  }

  // --- Step 7: Write final WS config + publish discovery ---
  setSetupStep('ws-config', 'running', 'Записываем конфиг и публикуем адрес...');
  try {
    const serverId = getOrCreateServerId();
    setupState.serverId = serverId;
    updateEnvFiles(wsUrl);
    // Also write SERVER_ID to env files
    const envPath = path.join(DATA_DIR, '.env.local');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    envContent = upsertEnvVar(envContent, 'SERVER_ID', serverId);
    fs.writeFileSync(envPath, envContent, 'utf-8');
    if (!_isAsar) {
      const envStandalone = path.join(BASE_DIR, '.next', 'standalone', '.env.local');
      if (fs.existsSync(path.dirname(envStandalone))) {
        fs.writeFileSync(envStandalone, envContent, 'utf-8');
      }
    }
    setupState.wsUrl = wsUrl;
    setupState.panelUrl = panelUrl;
    // Publish discovery URL for remote agents
    await publishDiscoveryUrl(serverId, wsUrl, panelUrl);
    setSetupStep('ws-config', 'ok', `Готово: ${wsUrl}`);
  } catch (e) {
    setSetupStep('ws-config', 'warning', `Ошибка: ${e.message}`);
  }

  setupState.done = true;
  setupState.success = true;
  setupState.finishedAt = Date.now();
}

// ---- Ensure standalone has static files + auto-create missing configs ----
function ensureStaticFiles() {
  // Skip static/public copy when running from asar (files already inside archive)
  if (!_isAsar) {
    function copyDir(src, dest) {
      if (!fs.existsSync(src)) return;
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const e of entries) {
        const s = path.join(src, e.name), d = path.join(dest, e.name);
        e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
      }
    }

    // Delete stale dest and always re-copy to avoid BUILD_ID mismatches
    function syncDir(src, dest, label) {
      if (!fs.existsSync(src)) return;
      // Check if BUILD_IDs match (for .next/static); always force-copy otherwise
      if (fs.existsSync(dest)) {
        // Read BUILD_ID from both source and standalone to detect staleness
        const srcBuildId = (() => { try { return fs.readFileSync(path.join(BASE_DIR, '.next', 'BUILD_ID'), 'utf-8').trim(); } catch { return ''; } })();
        const destBuildId = (() => { try { return fs.readFileSync(path.join(BASE_DIR, '.next', 'standalone', '.next', 'BUILD_ID'), 'utf-8').trim(); } catch { return ''; } })();
        if (srcBuildId && destBuildId && srcBuildId === destBuildId) return; // IDs match, skip
        console.log(`[Launcher] BUILD_ID mismatch (${srcBuildId} vs ${destBuildId}), refreshing ${label}...`);
        try { fs.rmSync(dest, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      console.log(`[Launcher] Копирование ${label} в standalone...`);
      copyDir(src, dest);
    }

    const staticSrc = path.join(BASE_DIR, '.next', 'static');
    const staticDest = path.join(BASE_DIR, '.next', 'standalone', '.next', 'static');
    const publicSrc = path.join(BASE_DIR, 'public');
    const publicDest = path.join(BASE_DIR, '.next', 'standalone', 'public');

    syncDir(staticSrc, staticDest, '.next/static');
    if (fs.existsSync(publicSrc) && !fs.existsSync(publicDest)) {
      console.log('[Launcher] Копирование public/ в standalone...');
      copyDir(publicSrc, publicDest);
    }
  }

  // Auto-create .env.local if missing (with default settings)
  const envPath = path.join(DATA_DIR, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('[Launcher] Создание .env.local с настройками по умолчанию...');
    // Try to read existing values from asar .env.local or standalone .env.local
    let existingVars = {};
    const asarEnvPath = path.join(BASE_DIR, '.env.local');
    const standaloneEnvPath = path.join(BASE_DIR, '.next', 'standalone', '.env.local');
    const sourceEnv = fs.existsSync(asarEnvPath) ? asarEnvPath : (fs.existsSync(standaloneEnvPath) ? standaloneEnvPath : null);
    if (sourceEnv) {
      console.log(`[Launcher] Найден ${sourceEnv === asarEnvPath ? 'packaged' : 'standalone'}/.env.local, копирую значения...`);
      const sourceContent = fs.readFileSync(sourceEnv, 'utf-8');
      const lines = sourceContent.split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
        if (m) existingVars[m[1]] = m[2].trim();
      }
    }
    const adminKey = existingVars.ADMIN_KEY || crypto.randomBytes(32).toString('hex');
    const jwtSecret = existingVars.JWT_SECRET || crypto.randomBytes(32).toString('hex');
    const licenseSecret = existingVars.LICENSE_SECRET || crypto.randomBytes(32).toString('hex');
    const supabaseUrl = existingVars.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = existingVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';
    const wsServerUrl = existingVars.WS_SERVER_URL || existingVars.NEXT_PUBLIC_WS_URL || `ws://localhost:${WS_PORT}`;
    const serverId = existingVars.SERVER_ID || crypto.randomBytes(8).toString('hex');
    const envLines = [
      '# VisualIllusion — Auto-generated config',
      `ADMIN_KEY=${adminKey}`,
      `JWT_SECRET=${jwtSecret}`,
      `LICENSE_SECRET=${licenseSecret}`,
      `WS_PORT=${WS_PORT}`,
      `PORT=${PANEL_PORT}`,
      `WS_SERVER_URL=${wsServerUrl}`,
      `SERVER_ID=${serverId}`,
      `NEXT_PUBLIC_WS_URL=${wsServerUrl}`,
    ];
    if (supabaseUrl) envLines.push(`NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`);
    if (supabaseKey) envLines.push(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=${supabaseKey}`);
    envLines.push('');
    fs.writeFileSync(envPath, envLines.join('\n'), 'utf-8');
    console.log('[Launcher] .env.local создан' + (supabaseUrl ? ' (с Supabase)' : ' (без Supabase)'));
    // Reload env vars since we just created the file
    loadEnvVars();
    // Update global vars that were set before ensureStaticFiles ran
    if (process.env.LICENSE_SECRET) LICENSE_SECRET = process.env.LICENSE_SECRET;
  }

  // Backfill LICENSE_SECRET for old env files
  if (fs.existsSync(envPath)) {
    const envRaw = fs.readFileSync(envPath, 'utf-8');
    if (!/^LICENSE_SECRET=/m.test(envRaw)) {
      const licenseSecret = crypto.randomBytes(32).toString('hex');
      const patchedEnv = `${envRaw.replace(/\s*$/, '')}\nLICENSE_SECRET=${licenseSecret}\n`;
      fs.writeFileSync(envPath, patchedEnv, 'utf-8');
      console.log('[Launcher] Добавлен LICENSE_SECRET в существующий .env.local');
    }
  }

  // Copy .env.local to standalone (only outside asar)
  if (!_isAsar) {
    const envDest = path.join(BASE_DIR, '.next', 'standalone', '.env.local');
    if (fs.existsSync(envPath) && (!fs.existsSync(envDest) || fs.statSync(envPath).mtimeMs > fs.statSync(envDest).mtimeMs)) {
      const standaloneDir = path.dirname(envDest);
      if (fs.existsSync(standaloneDir)) {
        fs.copyFileSync(envPath, envDest);
        console.log('[Launcher] Скопирован .env.local в standalone');
      }
    }
  }

  // Ensure server/ directory exists with ws-server.js (skip inside asar — both paths are in archive)
  if (!_isAsar) {
    const wsServerPath = path.join(BASE_DIR, 'server', 'ws-server.js');
    const standaloneWsServer = path.join(BASE_DIR, '.next', 'standalone', 'server', 'ws-server.js');
    if (!fs.existsSync(wsServerPath) && fs.existsSync(standaloneWsServer)) {
      fs.mkdirSync(path.dirname(wsServerPath), { recursive: true });
      fs.copyFileSync(standaloneWsServer, wsServerPath);
      console.log('[Launcher] Восстановлен server/ws-server.js из standalone');
    }
  }
}

// ---- Ensure build tools (pkg, resedit) are ready for client compilation ----
async function ensureBuildTools() {
  const pkgBinRelPath = path.join('node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
  const reseditRelPath = path.join('node_modules', 'resedit', 'dist', 'index.js');

  // Search in multiple locations (asar for reads, DATA_DIR for installed tools)
  const searchDirs = [BASE_DIR, DATA_DIR];
  if (process.env.ELECTRON_RUN) {
    const exeDir = path.dirname(process.execPath);
    searchDirs.push(path.join(exeDir, 'resources', 'app'));
  }

  let pkgFound = false;
  let reseditFound = false;

  for (const dir of searchDirs) {
    if (fs.existsSync(path.join(dir, pkgBinRelPath))) pkgFound = true;
    if (fs.existsSync(path.join(dir, reseditRelPath))) reseditFound = true;
  }

  if (!pkgFound || !reseditFound) {
    const missing = [];
    if (!pkgFound) missing.push('@yao-pkg/pkg');
    if (!reseditFound) missing.push('resedit');
    console.log(`[Build Tools] Отсутствуют: ${missing.join(', ')}. Установка...`);
    setSetupStep('build-tools', 'running', `Установка: ${missing.join(', ')}...`);

    // Try installing via npm (use DATA_DIR as writable cwd)
    try {
      const installCwd = _isAsar ? DATA_DIR : BASE_DIR;
      const installCmd = `npm install --no-save ${missing.join(' ')}`;
      await new Promise((resolve, reject) => {
        exec(installCmd, { cwd: installCwd, windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve(stdout);
        });
      });
      console.log('[Build Tools] Установка завершена');
    } catch (e) {
      console.warn(`[Build Tools] Ошибка установки: ${e.message}`);
      setSetupStep('build-tools', 'warning', `Не удалось установить: ${e.message.substring(0, 100)}`);
      return;
    }
  }

  // Pre-download pkg base binary for Windows (node18-win-x64)
  const pkgCacheDir = path.join(DATA_DIR, '.pkg-cache');
  let hasBinary = false;
  if (fs.existsSync(pkgCacheDir)) {
    try {
      const versions = fs.readdirSync(pkgCacheDir);
      for (const ver of versions) {
        const verDir = path.join(pkgCacheDir, ver);
        if (!fs.statSync(verDir).isDirectory()) continue;
        const files = fs.readdirSync(verDir);
        if (files.some(f => f.startsWith('fetched-') && f.includes('win'))) {
          hasBinary = true;
          break;
        }
      }
    } catch { /* ignore */ }
  }

  if (!hasBinary) {
    setSetupStep('build-tools', 'running', 'Скачивание базового бинарника Node.js для компиляции клиентов...');
    console.log('[Build Tools] Pre-fetching pkg base binary for node18-win-x64...');

    try {
      // Find pkg-fetch and call need() to download the base binary
      const pkgFetchPaths = searchDirs.map(d => path.join(d, 'node_modules', '@yao-pkg', 'pkg-fetch'));
      let pkgFetch = null;
      for (const p of pkgFetchPaths) {
        if (fs.existsSync(p)) {
          try { pkgFetch = require(p); break; } catch { /* try next */ }
        }
      }

      if (pkgFetch && pkgFetch.need) {
        await pkgFetch.need({ nodeRange: 'node18', platform: 'win32', arch: 'x64', forceBuild: false });
        console.log('[Build Tools] Base binary downloaded');
      } else {
        // Fallback: run pkg with a dummy file to trigger download
        const dummyFile = path.join(DATA_DIR, '.build-tmp', '_pkg_prefetch.js');
        fs.mkdirSync(path.dirname(dummyFile), { recursive: true });
        fs.writeFileSync(dummyFile, 'console.log("prefetch");', 'utf-8');

        let pkgBinJs = null;
        for (const dir of searchDirs) {
          const p = path.join(dir, pkgBinRelPath);
          if (fs.existsSync(p)) { pkgBinJs = p; break; }
        }

        if (pkgBinJs) {
          const nodeBin = NODE_BIN || process.execPath || 'node';
          await new Promise((resolve) => {
            const child = spawn(nodeBin, [pkgBinJs, dummyFile, '--target', 'node18-win-x64', '--output', dummyFile + '.exe'], {
              cwd: DATA_DIR,
              env: { ...process.env, PKG_CACHE_PATH: pkgCacheDir },
              windowsHide: true,
            });
            child.on('exit', () => resolve());
            child.on('error', () => resolve());
            setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 90000);
          });
          // Cleanup
          try { fs.unlinkSync(dummyFile); } catch {}
          try { fs.unlinkSync(dummyFile + '.exe'); } catch {}
        }
        console.log('[Build Tools] Base binary pre-fetch attempt complete');
      }
    } catch (e) {
      console.warn(`[Build Tools] Pre-fetch failed (non-fatal): ${e.message}`);
    }
  }

  // Also ensure downloads/ directory exists
  const downloadsDir = path.join(DATA_DIR, 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  // Also ensure .build-tmp/ directory exists
  const buildTmpDir = path.join(DATA_DIR, '.build-tmp');
  if (!fs.existsSync(buildTmpDir)) {
    fs.mkdirSync(buildTmpDir, { recursive: true });
  }

  setSetupStep('build-tools', 'ok', 'Инструменты сборки клиентов готовы');
  console.log('[Build Tools] Все инструменты готовы');
}

// ---- Server state (real health, not just process alive) ----
let wsProcess = null;
let nextProcess = null;
let wsAlive = false;    // process exists
let nextAlive = false;  // process exists
let wsReady = false;    // actually responding on port
let nextReady = false;  // actually responding on port
let wsRestarting = false;
let nextRestarting = false;

// ---- Force-kill everything on a port (Windows + Linux) ----
function killPort(port) {
  return new Promise((resolve) => {
    if (os.platform() === 'win32') {
      // Get all PIDs listening on this port, kill them all
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (err, stdout) => {
        if (!stdout || !stdout.trim()) return resolve();
        const pids = new Set();
        stdout.trim().split(/\r?\n/).forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && !isNaN(pid)) pids.add(pid);
        });
        if (pids.size === 0) return resolve();
        let killed = 0;
        const total = pids.size;
        pids.forEach(pid => {
          exec(`taskkill /F /PID ${pid} /T`, (e) => {
            if (e) {
              // Retry with admin elevation via powershell
              exec(`powershell -Command "Start-Process taskkill -ArgumentList '/F','/PID','${pid}','/T' -Verb RunAs -WindowStyle Hidden -Wait" 2>nul`, () => {
                killed++;
                if (killed === total) setTimeout(resolve, 500);
              });
            } else {
              killed++;
              if (killed === total) setTimeout(resolve, 500);
            }
          });
        });
      });
    } else {
      exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, () => setTimeout(resolve, 500));
    }
  });
}

// ---- Kill all 3 ports at once ----
async function killAllPorts() {
  console.log('[Launcher] Очистка портов...');
  await Promise.all([
    killPort(LAUNCHER_PORT),
    killPort(PANEL_PORT),
    killPort(WS_PORT),
  ]);
  // Extra wait to make sure OS releases them
  await new Promise(r => setTimeout(r, 800));
  console.log('[Launcher] Порты очищены');
}

// ---- Check if a TCP port is responding ----
function probePort(port, timeout = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; sock.destroy(); resolve(ok); } };
    sock.setTimeout(timeout);
    sock.on('connect', () => finish(true));
    sock.on('error', () => finish(false));
    sock.on('timeout', () => finish(false));
    sock.connect(port, '127.0.0.1');
  });
}

// ---- Check HTTP health ----
function probeHTTP(port, timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/', timeout }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ---- Start WebSocket Server ----
async function startWS() {
  const script = path.join(BASE_DIR, 'server', 'ws-server.js');
  if (!fs.existsSync(script)) {
    console.log('[WS] Скрипт не найден:', script);
    return;
  }
  if (wsProcess) { try { wsProcess.kill('SIGKILL'); } catch {} wsProcess = null; }
  await killPort(WS_PORT);
  const nodeBin = NODE_BIN || 'node';
  console.log('[WS] Запуск...');
  const wsEnv = { ...process.env, WS_PORT: String(WS_PORT) };
  if (process.env.ELECTRON_RUN) { wsEnv.ELECTRON_RUN_AS_NODE = '1'; delete wsEnv.ELECTRON_RUN; }
  wsProcess = spawn(nodeBin, [script], {
    env: wsEnv,
    cwd: BASE_DIR,
    stdio: 'pipe',
  });
  wsAlive = true;
  wsProcess.stdout.on('data', (d) => console.log(`[WS] ${d.toString().trim()}`));
  wsProcess.stderr.on('data', (d) => console.error(`[WS] ${d.toString().trim()}`));
  wsProcess.on('exit', (code) => {
    wsAlive = false;
    wsReady = false;
    console.log(`[WS] Завершён (код ${code})`);
  });
}

// ---- Start Next.js Server ----
async function startNext() {
  const standaloneServer = path.join(BASE_DIR, '.next', 'standalone', 'server.js');
  if (!fs.existsSync(standaloneServer)) {
    console.log('[Panel] standalone не найден:', standaloneServer);
    return;
  }
  if (!NODE_BIN) {
    console.log('[Panel] Node.js не найден!');
    return;
  }
  if (nextProcess) { try { nextProcess.kill('SIGKILL'); } catch {} nextProcess = null; }
  await killPort(PANEL_PORT);
  console.log('[Panel] Запуск...');
  const nextEnv = { ...process.env, PORT: String(PANEL_PORT), HOSTNAME: '0.0.0.0', NODE_OPTIONS: '' };
  // Pass WS URL to Next.js so /api/ws-url can serve it to the dashboard
  if (setupState.wsUrl) nextEnv.WS_SERVER_URL = setupState.wsUrl;
  if (setupState.panelUrl) nextEnv.PANEL_URL = setupState.panelUrl;
  if (process.env.ELECTRON_RUN) { nextEnv.ELECTRON_RUN_AS_NODE = '1'; delete nextEnv.ELECTRON_RUN; }
  nextProcess = spawn(NODE_BIN, [standaloneServer], {
    env: nextEnv,
    cwd: path.join(BASE_DIR, '.next', 'standalone'),
    stdio: 'pipe',
  });
  nextAlive = true;
  nextProcess.stdout.on('data', (d) => console.log(`[Panel] ${d.toString().trim()}`));
  nextProcess.stderr.on('data', (d) => console.error(`[Panel] ${d.toString().trim()}`));
  nextProcess.on('exit', (code) => {
    nextAlive = false;
    nextReady = false;
    console.log(`[Panel] Завершён (код ${code})`);
  });
}

// ---- Health monitor — runs every 3s, probes real ports, auto-restarts crashed services ----
async function healthCheck() {
  // Probe WS port
  const wsOk = await probePort(WS_PORT, 1500);
  wsReady = wsOk;

  // Probe Panel via HTTP
  const nextOk = await probeHTTP(PANEL_PORT, 2000);
  nextReady = nextOk;

  // Auto-restart WS if process died
  if (!wsAlive && !wsRestarting) {
    console.log('[Monitor] WebSocket упал — перезапуск...');
    wsRestarting = true;
    await startWS();
    wsRestarting = false;
  }

  // Auto-restart Next if process died
  if (!nextAlive && !nextRestarting) {
    console.log('[Monitor] Панель упала — перезапуск...');
    nextRestarting = true;
    await startNext();
    nextRestarting = false;
  }
}

// ---- Get local IP ----
function getLocalIP() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '—';
}

// ---- Status for API ----
async function getStatus() {
  // Read license info from DB
  let licenseInfo = null;
  try {
    const licFile = path.join(DATA_DIR, '.license');
    const nickFile = path.join(DATA_DIR, '.nickname');
    if (fs.existsSync(licFile)) {
      const key = fs.readFileSync(licFile, 'utf-8').trim();
      if (key) {
        const info = await verifyKeyFromDB(key);
        if (info) {
          licenseInfo = {
            plan: info.plan || 'unknown',
            type: info.type || 'user',
            expiresAt: info.expiresAt,
            daysLeft: info.daysLeft,
            maxDevices: info.maxDevices || 0,
          };
        }
      }
    }
    if (fs.existsSync(nickFile)) {
      const nick = fs.readFileSync(nickFile, 'utf-8').trim();
      if (!licenseInfo) licenseInfo = {};
      licenseInfo.nickname = nick;
    }
  } catch { /* ignore */ }

  return {
    ws: wsReady ? 'online' : (wsAlive ? 'starting' : 'offline'),
    next: nextReady ? 'online' : (nextAlive ? 'starting' : 'offline'),
    setup: setupState,
    license: licenseInfo,
  };
}

// ---- Update system ----
/** Get current app version (from version.json or constant) */
function getLocalVersion() {
  try {
    const vf = path.join(BASE_DIR, 'version.json');
    if (fs.existsSync(vf)) {
      const d = JSON.parse(fs.readFileSync(vf, 'utf-8'));
      if (d.version) return d.version;
    }
  } catch {}
  return APP_VERSION;
}

/** Compare semver: returns 1 if a>b, -1 if a<b, 0 if equal */
function semverCompare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** Check Supabase for available update */
async function checkForUpdateDB() {
  try {
    const resp = await supabaseRequest('GET', 'app_updates?order=published_at.desc&limit=1&select=version,download_url,file_size,sha256,changelog,published_at');
    if (!resp.data || !Array.isArray(resp.data) || resp.data.length === 0) return null;
    const latest = resp.data[0];
    const localVer = getLocalVersion();
    if (semverCompare(latest.version, localVer) > 0) {
      return latest;
    }
    return null;
  } catch (err) {
    console.error('[Update] Check failed:', err.message);
    return null;
  }
}

// Update progress tracking
let _updateProgress = { stage: 'idle', percent: 0, message: '', error: '' };

/** Download and apply update */
async function applyUpdate(updateInfo) {
  const appDir = BASE_DIR;
  const tmpDir = path.join(path.dirname(appDir), '_update_tmp');
  const tarPath = path.join(tmpDir, 'update.tar');

  _updateProgress = { stage: 'downloading', percent: 0, message: 'Подготовка...', error: '' };

  // Create temp dir
  if (fs.existsSync(tmpDir)) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(tmpDir, { recursive: true });

  // Download the update tar with progress
  const totalBytes = updateInfo.file_size || 0;
  console.log('[Update] Downloading update v' + updateInfo.version + ' (' + (totalBytes / 1048576).toFixed(1) + ' MB)...');
  _updateProgress = { stage: 'downloading', percent: 0, message: 'Скачивание 0%', error: '' };

  await new Promise((resolve, reject) => {
    let cookies = '';
    const download = (url, redirects) => {
      if (redirects > 15) return reject(new Error('Too many redirects'));
      const transport = url.startsWith('https') ? https : http;
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
      if (cookies) headers['Cookie'] = cookies;
      transport.get(url, { headers }, (res) => {
        // Collect cookies from Google Drive
        if (res.headers['set-cookie']) {
          const newCookies = (Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']])
            .map(c => c.split(';')[0]).join('; ');
          cookies = cookies ? cookies + '; ' + newCookies : newCookies;
        }
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location;
          if (loc.startsWith('/')) {
            const u = new URL(url);
            loc = u.protocol + '//' + u.host + loc;
          }
          return download(loc, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));

        // Google Drive virus scan page: extract form action + hidden fields
        const ct = (res.headers['content-type'] || '').toLowerCase();
        if (ct.includes('text/html')) {
          let html = '';
          res.on('data', (chunk) => { html += chunk.toString(); });
          res.on('end', () => {
            const formMatch = html.match(/action="([^"]*?)"/);
            if (formMatch) {
              let baseUrl = formMatch[1].replace(/&amp;/g, '&');
              if (baseUrl.startsWith('/')) {
                try { const u = new URL(url); baseUrl = u.protocol + '//' + u.host + baseUrl; } catch {}
              }
              // Extract all hidden input fields
              const inputs = [];
              const re1 = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/g;
              let m;
              while ((m = re1.exec(html)) !== null) {
                inputs.push(encodeURIComponent(m[1]) + '=' + encodeURIComponent(m[2].replace(/&amp;/g, '&')));
              }
              const re2 = /<input[^>]*value="([^"]*)"[^>]*name="([^"]*)"[^>]*>/g;
              while ((m = re2.exec(html)) !== null) {
                inputs.push(encodeURIComponent(m[2]) + '=' + encodeURIComponent(m[1].replace(/&amp;/g, '&')));
              }
              const sep = baseUrl.includes('?') ? '&' : '?';
              const dlUrl = baseUrl + sep + inputs.join('&');
              console.log('[Update] Google Drive confirmation page detected, following real URL...');
              return download(dlUrl, redirects + 1);
            }
            // Try direct confirm link
            const linkMatch = html.match(/href="(\/uc\?export=download[^"]*?)"/);
            if (linkMatch) {
              const dlUrl = 'https://drive.google.com' + linkMatch[1].replace(/&amp;/g, '&');
              return download(dlUrl, redirects + 1);
            }
            reject(new Error('Google Drive returned HTML page that could not be parsed'));
          });
          return;
        }

        const contentLen = parseInt(res.headers['content-length']) || totalBytes;
        let downloaded = 0;
        const file = fs.createWriteStream(tarPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          const pct = contentLen > 0 ? Math.min(99, Math.round((downloaded / contentLen) * 100)) : 0;
          const dlMB = (downloaded / 1048576).toFixed(1);
          const totalMB = contentLen > 0 ? (contentLen / 1048576).toFixed(0) : '?';
          _updateProgress = { stage: 'downloading', percent: pct, message: 'Скачивание ' + dlMB + '/' + totalMB + ' МБ (' + pct + '%)', error: '' };
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    };
    download(updateInfo.download_url, 0);
  });

  _updateProgress = { stage: 'verifying', percent: 100, message: 'Проверка целостности...', error: '' };

  // Verify hash using streaming
  if (updateInfo.sha256) {
    const h = crypto.createHash('sha256');
    const fd = fs.openSync(tarPath, 'r');
    const buf = Buffer.alloc(8 * 1024 * 1024);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length)) > 0) {
      h.update(buf.subarray(0, bytesRead));
    }
    fs.closeSync(fd);
    const actual = h.digest('hex');
    if (actual !== updateInfo.sha256) {
      _updateProgress = { stage: 'error', percent: 0, message: '', error: 'Ошибка проверки хэша' };
      throw new Error('SHA256 mismatch: expected ' + updateInfo.sha256 + ', got ' + actual);
    }
    console.log('[Update] SHA256 verified OK');
  }

  _updateProgress = { stage: 'installing', percent: 100, message: 'Установка обновления...', error: '' };

  // Create updater batch script
  const exeName = process.env.ELECTRON_RUN ? 'VisualIllusion.exe' : 'node.exe';
  const exePath = process.env.ELECTRON_RUN
    ? path.join(path.dirname(appDir), '..', 'VisualIllusion.exe')
    : process.execPath;
  const batPath = path.join(path.dirname(appDir), '_apply_update.bat');
  const bat = `@echo off
title VisualIllusion Update
echo Applying update...
taskkill /F /IM ${exeName} >nul 2>&1
timeout /t 3 /nobreak >nul
tar -xf "${tarPath}" -C "${appDir}"
if errorlevel 1 (
  echo Update extraction failed!
  pause
  exit /b 1
)
rmdir /s /q "${tmpDir}" >nul 2>&1
start "" "${exePath}"
exit
`;
  fs.writeFileSync(batPath, bat, 'utf-8');

  _updateProgress = { stage: 'restarting', percent: 100, message: 'Перезапуск приложения...', error: '' };
  console.log('[Update] Launching updater and restarting...');
  const { spawn: sp } = require('child_process');
  sp('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: false }).unref();

  // Quit the app so the batch script can replace files
  setTimeout(() => {
    if (process.env.ELECTRON_RUN) {
      try { require('electron').app.quit(); } catch {}
    }
    process.exit(0);
  }, 2000);
}

// ---- Launcher GUI HTML ----
function getHTML() {
  const localIP = getLocalIP();
  const nodeOk = !!NODE_BIN;
  const standaloneExists = fs.existsSync(path.join(BASE_DIR, '.next', 'standalone', 'server.js'));
  const wsServerExists = fs.existsSync(path.join(BASE_DIR, 'server', 'ws-server.js'));
  const envExists = fs.existsSync(path.join(DATA_DIR, '.env.local'));
  const allFilesOk = standaloneExists && wsServerExists && envExists;

  // Read license info inline for initial render (will be populated async)
  let nickname = 'Operator';
  let plan = '';
  let expiresAt = '';
  let daysLeft = 0;
  try {
    const nickFile = path.join(DATA_DIR, '.nickname');
    if (fs.existsSync(nickFile)) nickname = fs.readFileSync(nickFile, 'utf-8').trim() || 'Operator';
    // License info from cached status
    if (_cachedLicenseInfo) {
      plan = _cachedLicenseInfo.plan || '';
      expiresAt = _cachedLicenseInfo.expiresAt || '';
      daysLeft = _cachedLicenseInfo.daysLeft || 0;
    }
  } catch { /* ignore */ }

  const planLabels = { trial: 'Trial', basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' };
  const planLabel = planLabels[plan] || plan || 'N/A';
  const isInfinite = daysLeft > 3650;
  const expDate = isInfinite
    ? '∞'
    : (expiresAt ? new Date(expiresAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  let daysDisplay = '—';
  if (isInfinite) {
    daysDisplay = '∞';
  } else if (expiresAt) {
    const leftMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const d = Math.floor(leftMs / 86400000);
    const h = Math.floor((leftMs % 86400000) / 3600000);
    daysDisplay = `${d} дн. ${h} ч.`;
  }

  // Determine role label for sidebar
  let roleLabel = 'Пользователь';
  if (_cachedLicenseInfo && _cachedLicenseInfo.type === 'admin') roleLabel = 'Админ';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VisualIllusion — Launcher</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#09090b;--card:#111113;--border:#1e1e22;--border2:#2a2a2e;--text:#fafafa;--text2:#a1a1aa;--text3:#52525b;--green:#4ade80;--blue:#60a5fa;--yellow:#facc15;--red:#f87171}
html,body{scrollbar-width:thin;scrollbar-color:#2a2a2e var(--bg)}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:#2a2a2e;border-radius:999px}
::-webkit-scrollbar-thumb:hover{background:#3f3f46}
body{font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;background:transparent;color:var(--text);min-height:100vh;overflow:hidden;-webkit-app-region:no-drag}

/* ===== Phase 1: Centered vertical splash ===== */
.splash{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;background:#09090b;transition:opacity .6s ease,transform .6s ease}
.splash.hide{opacity:0;transform:scale(.96);pointer-events:none}
.splash-inner{text-align:center;animation:fadeUp .6s ease-out}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.splash-logo{width:80px;height:80px;border-radius:20px;overflow:hidden;margin:0 auto 20px;position:relative}
.splash-logo img{width:100%;height:100%;object-fit:contain}
.splash-glow{position:absolute;inset:-15px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.06) 0%,transparent 70%);animation:gPulse 2.5s ease-in-out infinite}
@keyframes gPulse{0%,100%{opacity:.4;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}
.splash h1{font-size:26px;font-weight:700;letter-spacing:-.5px;background:linear-gradient(135deg,#fafafa,#a1a1aa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.splash .sub{color:var(--text3);font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-top:6px}
.splash-bar{width:180px;height:2px;margin:32px auto 0;background:var(--border);border-radius:4px;overflow:hidden}
.splash-bar-inner{height:100%;width:35%;background:linear-gradient(90deg,#3f3f46,#71717a);border-radius:4px;animation:sLoad 1.4s cubic-bezier(.4,0,.2,1) infinite}
@keyframes sLoad{0%{left:-35%;transform:translateX(-100%)}100%{left:100%;transform:translateX(100%)}}
.splash-bar-inner{position:relative}

/* ===== Phase 2: Horizontal main layout ===== */
.main{display:flex;height:100vh;opacity:0;transition:opacity .5s ease .3s}
.main.show{opacity:1}

/* Left sidebar */
.sidebar{width:260px;min-width:260px;background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:20px;-webkit-app-region:no-drag}
.sidebar-top{flex:1}
.profile{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid var(--border)}
.avatar{width:44px;height:44px;border-radius:12px;overflow:hidden;flex-shrink:0;background:var(--border)}
.avatar img{width:100%;height:100%;object-fit:contain}
.profile-info{flex:1;min-width:0}
.profile-name{font-size:14px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.profile-plan{font-size:11px;color:var(--text3);margin-top:2px;display:flex;align-items:center;gap:4px}
.profile-plan .dot-sm{width:6px;height:6px;border-radius:50%;background:var(--green)}

.license-card{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:20px}
.license-row{display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:3px 0}
.license-row .ll{color:var(--text3)}
.license-row .lv{color:var(--text2);font-weight:500}
.license-row .lv.green{color:var(--green)}

/* Status indicators */
.status-section{margin-bottom:20px}
.status-section .sh{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;font-weight:600}
.status-row{display:flex;align-items:center;gap:8px;padding:6px 0}
.sdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:.3s}
.sdot.on{background:var(--green);box-shadow:0 0 8px rgba(74,222,128,.4)}
.sdot.starting{background:var(--yellow);box-shadow:0 0 6px rgba(250,204,21,.3);animation:blink 1.2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.sdot.off{background:var(--red);box-shadow:0 0 6px rgba(248,113,113,.3)}
.slabel{font-size:12px;color:var(--text2);flex:1}
.sbadge{font-size:10px;padding:2px 8px;border-radius:999px;font-weight:600}
.sbadge.on{background:rgba(74,222,128,.1);color:var(--green)}
.sbadge.starting{background:rgba(250,204,21,.1);color:var(--yellow)}
.sbadge.off{background:rgba(248,113,113,.1);color:var(--red)}

/* Action buttons */
.actions{margin-bottom:16px}
.btn-action{width:100%;padding:10px 14px;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:8px;margin-bottom:6px;-webkit-app-region:no-drag}
.btn-action svg{width:16px;height:16px;flex-shrink:0}
.btn-launch{background:var(--green);color:#052e16}
.btn-launch:hover{background:#6ee7a0;transform:translateY(-1px)}
.btn-launch.off{background:var(--border2);color:var(--text3);cursor:not-allowed}
.btn-launch.off:hover{transform:none}
.btn-restart{background:var(--border);color:var(--text2)}
.btn-restart:hover{background:var(--border2);color:var(--text)}

/* Bottom buttons */
.sidebar-bottom{border-top:1px solid var(--border);padding-top:14px;display:flex;flex-direction:column;gap:8px}
.btn-update{width:100%;padding:10px 14px;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;display:none;align-items:center;justify-content:center;gap:8px;background:var(--green);color:#052e16;-webkit-app-region:no-drag;position:relative;overflow:hidden}
.btn-update:hover{background:#6ee7a0;transform:translateY(-1px)}
.btn-update.show{display:flex}
.btn-update svg{width:16px;height:16px;flex-shrink:0}
.btn-update.downloading{background:var(--bg2);color:var(--text2);cursor:wait;border:1px solid var(--border)}
.btn-update.downloading:hover{transform:none}
.update-progress-wrap{width:100%;display:none;flex-direction:column;gap:4px;margin-top:4px}
.update-progress-wrap.show{display:flex}
.update-progress-bar{width:100%;height:6px;background:var(--border);border-radius:3px;overflow:hidden}
.update-progress-bar-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s ease;width:0%}
.update-progress-text{font-size:11px;color:var(--text2);text-align:center}
.bottom-row{display:flex;gap:6px}
.btn-bottom{flex:1;padding:8px;border:1px solid var(--border);background:transparent;border-radius:8px;font-size:11px;color:var(--text3);cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:5px;-webkit-app-region:no-drag}
.btn-bottom svg{width:13px;height:13px}
.btn-bottom:hover{background:var(--border);color:var(--text2)}
.btn-exit{color:#f87171;border-color:rgba(248,113,113,0.25)}
.btn-exit:hover{background:rgba(248,113,113,0.1);color:#fca5a5;border-color:rgba(248,113,113,0.4)}

/* ===== Right: Console panel ===== */
.console-panel{flex:1;display:flex;flex-direction:column;background:var(--bg);-webkit-app-region:no-drag}
.console-header{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;-webkit-app-region:drag}
.console-title{font-size:13px;font-weight:600;color:var(--text2);display:flex;align-items:center;gap:8px}
.console-title svg{width:15px;height:15px;color:var(--text3)}
.console-dots{display:flex;gap:5px}
.console-dots span{width:10px;height:10px;border-radius:50%;border:1.5px solid var(--border2)}
.console-body{flex:1;overflow-y:auto;padding:16px 20px;font-family:'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;font-size:12px;line-height:1.7}
.log-entry{animation:logIn .3s ease-out both;display:flex;gap:8px;padding:2px 0}
@keyframes logIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
.log-time{color:var(--text3);flex-shrink:0;font-size:11px;min-width:55px}
.log-icon{flex-shrink:0;width:14px;display:flex;align-items:center;justify-content:center}
.log-icon.ok{color:var(--green)}
.log-icon.run{color:var(--blue);animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.log-icon.warn{color:var(--yellow)}
.log-icon.err{color:var(--red)}
.log-icon.wait{color:var(--text3)}
.log-msg{color:var(--text2);word-break:break-word;flex:1}
.log-msg .hl{color:var(--green)}
.log-msg .hl-b{color:var(--blue)}
.log-msg .hl-y{color:var(--yellow)}
.log-msg .hl-r{color:var(--red)}
.log-msg .dim{color:var(--text3)}

/* Network info bar */
.net-bar{padding:10px 20px;border-top:1px solid var(--border);display:flex;gap:16px;flex-wrap:wrap}
.net-item{font-size:10px;color:var(--text3);display:flex;align-items:center;gap:4px}
.net-item .nv{color:var(--text2);font-weight:500;font-family:'Cascadia Code','Consolas',monospace}

/* Uptime */
.uptime-bar{padding:6px 20px;border-top:1px solid var(--border);font-size:10px;color:#27272a;text-align:right}

/* ===== Auth screen ===== */
.auth-screen{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:90;background:transparent;opacity:0;pointer-events:none;transition:opacity .5s ease;overflow:hidden}
.auth-screen.show{opacity:1;pointer-events:all}
.auth-card{width:420px;max-width:calc(100vw - 40px);background:#131316;border:1px solid var(--border);border-radius:14px;overflow:hidden;animation:fadeUp .5s ease-out;flex-shrink:0;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.auth-card-header{display:flex;align-items:center;gap:8px;padding:0 4px 0 16px;height:40px;border-bottom:1px solid var(--border);background:#0e0e10;-webkit-app-region:drag}
.auth-card-title{flex:1;font-size:10px;color:var(--text3);font-family:'Cascadia Code','Fira Code','Consolas',monospace;letter-spacing:1px}
.auth-win-controls{display:flex;gap:2px;-webkit-app-region:no-drag}
.auth-win-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:#71717a;cursor:pointer;transition:background .15s,color .15s;border-radius:6px}
.auth-win-btn:hover{background:#27272a;color:#e4e4e7}
.auth-win-btn.close:hover{background:#dc2626;color:#fff}
.auth-win-btn svg{width:14px;height:14px}
.auth-card-body{padding:28px 32px 20px}
.auth-logo{text-align:center;margin-bottom:18px}
.auth-logo img{width:48px;height:48px;border-radius:14px}
.auth-logo h2{font-size:18px;font-weight:700;color:var(--text);margin-top:14px;letter-spacing:-.3px}
.auth-logo p{color:var(--text3);font-size:11px;margin-top:5px}
.auth-form{display:flex;flex-direction:column;gap:14px}
.auth-field{position:relative}
.auth-field label{display:block;font-size:9px;color:var(--text3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:2px;font-family:'Cascadia Code','Fira Code','Consolas',monospace}
.auth-field .input-wrap{position:relative}
.auth-field input{width:100%;padding:12px 14px;background:#0a0a0c;border:1px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);outline:none;transition:border-color .2s,box-shadow .2s;font-family:inherit;-webkit-app-region:no-drag;box-sizing:border-box}
.auth-field input:focus{border-color:rgba(96,165,250,.5);box-shadow:0 0 0 3px rgba(96,165,250,.08)}
.auth-field input::placeholder{color:#3f3f46}
.auth-pw-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);font-size:9px;cursor:pointer;font-family:'Cascadia Code','Fira Code','Consolas',monospace;letter-spacing:1px;text-transform:uppercase;padding:3px 5px;border-radius:4px;transition:color .2s;-webkit-app-region:no-drag}
.auth-pw-toggle:hover{color:var(--text2)}
.auth-remember{display:flex;align-items:center;justify-content:space-between;margin-top:2px}
.auth-remember label{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text2);cursor:pointer;-webkit-app-region:no-drag}
.auth-remember input[type=checkbox]{width:15px;height:15px;accent-color:var(--blue);cursor:pointer}
.auth-btn{width:100%;padding:13px;border:1px solid var(--border);border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;-webkit-app-region:no-drag;text-transform:uppercase;letter-spacing:2px;font-family:'Cascadia Code','Fira Code','Consolas',monospace}
.auth-btn-primary{background:transparent;color:var(--text);border-color:var(--border2)}
.auth-btn-primary:hover{background:var(--border);border-color:var(--text3);transform:translateY(-1px)}
.auth-btn-primary:disabled{opacity:.4;cursor:not-allowed;transform:none}
.auth-error{background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.15);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--red);display:none;margin-bottom:2px}
.auth-error.show{display:block}
.auth-footer{text-align:center;padding:16px 32px 20px;font-size:12px;color:var(--text3)}
.auth-footer a{color:var(--text);font-weight:600;cursor:pointer;text-decoration:none;transition:color .2s;-webkit-app-region:no-drag}
.auth-footer a:hover{color:var(--blue)}
.auth-divider{display:flex;align-items:center;gap:10px;margin:4px 0}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border)}
.auth-divider span{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;font-family:'Cascadia Code','Fira Code','Consolas',monospace}
</style>
</head>
<body>

<!-- Phase 1: Vertical centered splash -->
<div class="splash" id="splash">
  <div class="splash-inner">
    <div class="splash-logo">
      <div class="splash-glow"></div>
      <img src="/visualillusion_white_n.png" alt="VI" />
    </div>
    <h1>VisualIllusion</h1>
    <div class="sub">Remote Admin</div>
    <div class="splash-bar"><div class="splash-bar-inner"></div></div>
  </div>
</div>

<!-- Phase 2: Auth screen -->
<div class="auth-screen" id="auth-screen">
  <div class="auth-card">
    <div class="auth-card-header">
      <div class="auth-card-title">credentials</div>
      <div class="auth-win-controls">
        <button class="auth-win-btn" onclick="if(window.electronAPI)window.electronAPI.minimize()" title="Свернуть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
        <button class="auth-win-btn close" onclick="if(window.electronAPI)window.electronAPI.close()" title="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg></button>
      </div>
    </div>
    <div class="auth-card-body">
      <div class="auth-logo">
        <img src="/visualillusion_white_n.png" alt="VI" />
        <h2 id="auth-heading">Войдите в аккаунт</h2>
        <p id="auth-subtitle">Добро пожаловать в VisualIllusion</p>
      </div>

      <div class="auth-error" id="auth-error"></div>

      <!-- Login form -->
      <form class="auth-form" id="form-login" onsubmit="handleLogin(event)">
        <div class="auth-field">
          <label>Логин</label>
          <div class="input-wrap">
            <input type="text" id="login-username" placeholder="Имя пользователя" required autocomplete="username" />
          </div>
        </div>
        <div class="auth-field">
          <label>Пароль</label>
          <div class="input-wrap">
            <input type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" />
            <button type="button" class="auth-pw-toggle" onclick="togglePw('login-password',this)">показать</button>
          </div>
        </div>
        <div class="auth-remember">
          <label><input type="checkbox" checked /> Запомнить</label>
        </div>
        <div class="auth-divider"><span>вход</span></div>
        <button type="submit" class="auth-btn auth-btn-primary" id="login-btn">В О Й Т И</button>
      </form>

      <!-- Register form -->
      <form class="auth-form" id="form-register" style="display:none" onsubmit="handleRegister(event)">
        <div class="auth-field">
          <label>Логин</label>
          <div class="input-wrap">
            <input type="text" id="reg-username" placeholder="Придумайте логин" required autocomplete="username" />
          </div>
        </div>
        <div class="auth-field">
          <label>Пароль</label>
          <div class="input-wrap">
            <input type="password" id="reg-password" placeholder="••••••••" required autocomplete="new-password" />
            <button type="button" class="auth-pw-toggle" onclick="togglePw('reg-password',this)">показать</button>
          </div>
        </div>
        <div class="auth-field">
          <label>Повторите пароль</label>
          <div class="input-wrap">
            <input type="password" id="reg-password2" placeholder="••••••••" required autocomplete="new-password" />
            <button type="button" class="auth-pw-toggle" onclick="togglePw('reg-password2',this)">показать</button>
          </div>
        </div>
        <div class="auth-field">
          <label>Ключ</label>
          <div class="input-wrap">
            <input type="text" id="reg-key" placeholder="VI-XXXX-XXXX-XXXX-XXXX" required />
          </div>
        </div>
        <div class="auth-divider"><span>регистрация</span></div>
        <button type="submit" class="auth-btn auth-btn-primary" id="reg-btn">С О З Д А Т Ь</button>
      </form>
    </div>
    <div class="auth-footer" id="auth-footer">
      Нет аккаунта? <a onclick="switchTab('register')">Зарегистрироваться</a>
    </div>
  </div>
</div>

<!-- Phase 3: Horizontal main layout -->
<div class="main" id="main">
  <!-- Left sidebar -->
  <div class="sidebar">
    <div class="sidebar-top">
      <!-- Profile -->
      <div class="profile">
        <div class="avatar"><img src="/visualillusion_white_n.png" alt="" /></div>
        <div class="profile-info">
          <div class="profile-name">${nickname}</div>
          <div class="profile-plan"><span class="dot-sm"></span>${roleLabel}</div>
        </div>
      </div>

      <!-- License info -->
      <div class="license-card">
        <div class="license-row"><span class="ll">Действует до</span><span class="lv" id="expDate">${expDate}</span></div>
        <div class="license-row"><span class="ll">Осталось</span><span class="lv green" id="daysLeft">${daysDisplay}</span></div>
      </div>

      <!-- Service status -->
      <div class="status-section">
        <div class="sh">Сервисы</div>
        <div class="status-row">
          <span class="sdot starting" id="dp"></span>
          <span class="slabel">Панель</span>
          <span class="sbadge starting" id="pb">Запуск</span>
        </div>
        <div class="status-row">
          <span class="sdot starting" id="dw"></span>
          <span class="slabel">WebSocket</span>
          <span class="sbadge starting" id="wb">Запуск</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions">
        <button class="btn-action btn-launch off" id="ob" onclick="openPanel()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Запустить панель
        </button>
        <button class="btn-action btn-restart" id="rb" onclick="restartAll()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Перезапустить
        </button>
      </div>
    </div>

    <!-- Bottom -->
    <div class="sidebar-bottom">
      <button class="btn-update" id="updateBtn" onclick="downloadUpdate()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span id="updateBtnText">Скачать обновление</span>
      </button>
      <div class="update-progress-wrap" id="updateProgressWrap">
        <div class="update-progress-bar"><div class="update-progress-bar-fill" id="updateProgressFill"></div></div>
        <div class="update-progress-text" id="updateProgressText"></div>
      </div>
      <div class="bottom-row">
      <button class="btn-bottom" onclick="openSettings()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Настройки
      </button>
      <button class="btn-bottom btn-exit" onclick="logout()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Выйти
      </button>
      </div>
    </div>
  </div>

  <!-- Right: Console -->
  <div class="console-panel">
    <div class="console-header">
      <div class="console-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        Консоль запуска
      </div>
      <div class="console-dots"><span></span><span></span><span></span></div>
    </div>
    <div class="console-body" id="console"></div>
    <div class="net-bar">
      <div class="net-item">Панель: <span class="nv">localhost:${PANEL_PORT}</span></div>
      <div class="net-item">WS: <span class="nv">localhost:${WS_PORT}</span></div>
      <div class="net-item">LAN: <span class="nv">${localIP}</span></div>
      <div class="net-item">Node: <span class="nv">${nodeOk ? '✓' : '✗'}</span></div>
    </div>
    <div class="uptime-bar" id="ut"></div>
  </div>
</div>

<script>
var start=Date.now();
var splashDone=false;
var logEntries=[];
var splashMinTime=1200;
var isAuthed=false;

// Transition from splash to auth screen
function transitionToAuth(){
  if(splashDone) return;
  splashDone=true;
  var splash=document.getElementById('splash');
  var authScreen=document.getElementById('auth-screen');
  splash.classList.add('hide');
  setTimeout(function(){
    splash.style.display='none';
    // Check if already logged in
    checkAuth();
  },400);
}

// Check session
function checkAuth(){
  fetch('/api/launcher-auth/check')
    .then(function(r){return r.json()})
    .then(function(d){
      if(d.authenticated){
        isAuthed=true;
        // Update nickname display
        if(d.nickname){
          var pn=document.querySelector('.profile-name');
          if(pn) pn.textContent=d.nickname;
        }
        showMain();
      }else{
        showAuthScreen();
      }
    })
    .catch(function(){showAuthScreen()});
}

function showAuthScreen(){
  document.getElementById('auth-screen').classList.add('show');
}

function showMain(){
  document.body.style.background='var(--bg)';
  document.getElementById('auth-screen').classList.remove('show');
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('main').classList.add('show');
  if(!window._pollStarted){window._pollStarted=true;poll();setInterval(poll,1500);}
}

// Toggle password visibility
function togglePw(id,btn){
  var inp=document.getElementById(id);
  if(inp.type==='password'){inp.type='text';btn.textContent='скрыть'}else{inp.type='password';btn.textContent='показать'}
}

// Tab switching
function switchTab(tab){
  document.getElementById('form-login').style.display=tab==='login'?'flex':'none';
  document.getElementById('form-register').style.display=tab==='register'?'flex':'none';
  document.getElementById('auth-error').classList.remove('show');
  document.getElementById('auth-heading').textContent=tab==='login'?'Войдите в аккаунт':'Создайте аккаунт';
  document.getElementById('auth-subtitle').textContent=tab==='login'?'Добро пожаловать в VisualIllusion':'Заполните данные для регистрации';
  document.getElementById('auth-footer').innerHTML=tab==='login'?'Нет аккаунта? <a onclick="switchTab(&apos;register&apos;)">Зарегистрироваться</a>':'Уже есть аккаунт? <a onclick="switchTab(&apos;login&apos;)">Войти</a>';
}

function showAuthError(msg){
  var el=document.getElementById('auth-error');
  el.textContent=msg;
  el.classList.add('show');
}

// Login
function handleLogin(e){
  e.preventDefault();
  var btn=document.getElementById('login-btn');
  btn.disabled=true;btn.textContent='В Х О Д . . .';
  document.getElementById('auth-error').classList.remove('show');

  var username=document.getElementById('login-username').value.trim();
  var password=document.getElementById('login-password').value;

  fetch('/api/launcher-auth/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:username,password:password})
  })
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
  .then(function(res){
    if(res.ok&&res.data.success){
      isAuthed=true;
      if(res.data.nickname){
        var pn=document.querySelector('.profile-name');
        if(pn) pn.textContent=res.data.nickname;
      }
      // Set license cookies for Next.js panel
      document.cookie='license_active=1; Path=/; Max-Age=31536000';
      document.cookie='license_nick='+encodeURIComponent(res.data.nickname||'admin')+'; Path=/; Max-Age=31536000';
      document.cookie='license_type='+(res.data.role||'user')+'; Path=/; Max-Age=31536000';
      document.cookie='license_plan=enterprise; Path=/; Max-Age=31536000';
      document.cookie='license_expires='+(res.data.expiresAt||'')+'; Path=/; Max-Age=31536000';
      var dl=res.data.daysLeft;
      document.cookie='license_days='+(dl&&dl>3650?'\\u221e':dl||'\\u221e')+'; Path=/; Max-Age=31536000';
      if(res.data.userId) document.cookie='user_id='+res.data.userId+'; Path=/; Max-Age=31536000';
      // Update sidebar display
      var pp=document.querySelector('.profile-plan');
      if(pp) pp.innerHTML='<span class=\"dot-sm\"></span>'+(res.data.role==='admin'?'Админ':'Пользователь');
      var expDate=document.getElementById('expDate');
      if(expDate) expDate.textContent=formatExpiryDate(res.data.expiresAt, dl);
      var dLeft=document.getElementById('daysLeft');
      if(dLeft) dLeft.textContent=formatRemaining(res.data.expiresAt, dl);
      showMain();
    }else{
      showAuthError(res.data.error||'Ошибка входа');
    }
  })
  .catch(function(){showAuthError('Ошибка соединения')})
  .finally(function(){btn.disabled=false;btn.textContent='В О Й Т И'});
}

// Register
function handleRegister(e){
  e.preventDefault();
  var btn=document.getElementById('reg-btn');
  btn.disabled=true;btn.textContent='С О З Д А Н И Е . . .';
  document.getElementById('auth-error').classList.remove('show');

  var username=document.getElementById('reg-username').value.trim();
  var password=document.getElementById('reg-password').value;
  var password2=document.getElementById('reg-password2').value;
  var key=document.getElementById('reg-key').value.replace(/\s+/g,'').trim();
  var name=username;

  if(password!==password2){
    showAuthError('Пароли не совпадают');
    btn.disabled=false;btn.textContent='С О З Д А Т Ь';
    return;
  }
  if(password.length<4){
    showAuthError('Пароль должен быть минимум 4 символа');
    btn.disabled=false;btn.textContent='С О З Д А Т Ь';
    return;
  }
  if(!/^VI-/i.test(key)){
    showAuthError('Ключ должен начинаться с VI-');
    btn.disabled=false;btn.textContent='С О З Д А Т Ь';
    return;
  }
  key=key.toUpperCase();

  fetch('/api/launcher-auth/register',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:name,username:username,password:password,key:key})
  })
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d}})})
  .then(function(res){
    if(res.ok&&res.data.success){
      isAuthed=true;
      if(res.data.nickname){
        var pn=document.querySelector('.profile-name');
        if(pn) pn.textContent=res.data.nickname;
      }
      // Set license cookies for Next.js panel
      document.cookie='license_active=1; Path=/; Max-Age=31536000';
      document.cookie='license_nick='+encodeURIComponent(res.data.nickname||username)+'; Path=/; Max-Age=31536000';
      document.cookie='license_type='+(res.data.role||'user')+'; Path=/; Max-Age=31536000';
      document.cookie='license_plan=enterprise; Path=/; Max-Age=31536000';
      document.cookie='license_expires='+(res.data.expiresAt||'')+'; Path=/; Max-Age=31536000';
      var dl=res.data.daysLeft;
      document.cookie='license_days='+(dl&&dl>3650?'\u221e':dl||'\u221e')+'; Path=/; Max-Age=31536000';
      var expDate=document.getElementById('expDate');
      if(expDate) expDate.textContent=formatExpiryDate(res.data.expiresAt, dl);
      var dLeft=document.getElementById('daysLeft');
      if(dLeft) dLeft.textContent=formatRemaining(res.data.expiresAt, dl);
      showMain();
    }else{
      showAuthError(res.data.error||'Ошибка регистрации');
    }
  })
  .catch(function(){showAuthError('Ошибка соединения')})
  .finally(function(){btn.disabled=false;btn.textContent='С О З Д А Т Ь'});
}

// Auto-transition after splash minimum time
setTimeout(transitionToAuth, splashMinTime);

function timeStr(){
  var d=new Date();
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');
}

function addLog(icon, msg, time){
  var c=document.getElementById('console');
  if(!c) return;
  var t=time||timeStr();
  var iconHtml='';
  if(icon==='ok') iconHtml='<span class="log-icon ok">✓</span>';
  else if(icon==='run') iconHtml='<span class="log-icon run">⟳</span>';
  else if(icon==='warn') iconHtml='<span class="log-icon warn">⚠</span>';
  else if(icon==='err') iconHtml='<span class="log-icon err">✗</span>';
  else iconHtml='<span class="log-icon wait">·</span>';
  var el=document.createElement('div');
  el.className='log-entry';
  el.style.animationDelay=(logEntries.length*30)+'ms';
  el.innerHTML='<span class="log-time">'+t+'</span>'+iconHtml+'<span class="log-msg">'+msg+'</span>';
  c.appendChild(el);
  c.scrollTop=c.scrollHeight;
  logEntries.push({icon:icon,msg:msg,time:t});
}

function formatExpiryDate(expiresAt, daysLeft){
  var d=Number(daysLeft);
  if(d>3650) return '\u221e';
  if(!expiresAt) return '\u2014';
  var exp=new Date(expiresAt);
  if(isNaN(exp.getTime())) return '\u2014';
  return exp.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function formatRemaining(expiresAt, daysLeft){
  var d=Number(daysLeft);
  if(d>3650) return '\u221e';
  if(!expiresAt) return '\u2014';
  var leftMs=Math.max(0,new Date(expiresAt).getTime()-Date.now());
  var days=Math.floor(leftMs/86400000);
  var hours=Math.floor((leftMs%86400000)/3600000);
  return days+' дн. '+hours+' ч.';
}

function S(prefix,st){
  var d=document.getElementById('d'+prefix),b=document.getElementById(prefix+'b');
  if(!d||!b)return;
  d.className='sdot '+(st==='online'?'on':st==='starting'?'starting':'off');
  b.className='sbadge '+(st==='online'?'on':st==='starting'?'starting':'off');
  b.textContent=st==='online'?'Работает':st==='starting'?'Запуск':'Остановлен';
}

var _prevSetupJSON='';
var _prevPanel='';
var _prevWs='';

addLog('wait','Инициализация сервисов...');

async function poll(){
  try{
    var r=await fetch('/api/status');
    var d=await r.json();

    // Service status
    if(d.next!==_prevPanel){
      if(d.next==='online') addLog('ok','<span class="hl">Панель управления</span> запущена');
      else if(d.next==='starting'&&_prevPanel!=='starting') addLog('run','Запуск панели управления...');
      _prevPanel=d.next;
    }
    if(d.ws!==_prevWs){
      if(d.ws==='online') addLog('ok','<span class="hl">WebSocket сервер</span> запущен');
      else if(d.ws==='starting'&&_prevWs!=='starting') addLog('run','Запуск WebSocket сервера...');
      _prevWs=d.ws;
    }

    S('p',d.next);S('w',d.ws);

    // Setup steps → console
    if(d.setup&&d.setup.steps){
      var json=JSON.stringify(d.setup.steps);
      if(json!==_prevSetupJSON){
        d.setup.steps.forEach(function(s){
          var key='step_'+s.id;
          if(!window[key]||window[key]!==s.status){
            if(s.status==='ok') addLog('ok',s.label+' <span class="dim">— '+s.message+'</span>');
            else if(s.status==='running') addLog('run',s.label+'...');
            else if(s.status==='warning') addLog('warn',s.label+' <span class="hl-y">'+s.message+'</span>');
            else if(s.status==='error') addLog('err',s.label+' <span class="hl-r">'+s.message+'</span>');
            window[key]=s.status;
          }
        });
        _prevSetupJSON=json;

        if(d.setup.done){
          var netParts=[];
          if(d.setup.wsUrl) netParts.push('WS: <span class="hl-b">'+d.setup.wsUrl+'</span>');
          if(d.setup.panelUrl) netParts.push('Panel: <span class="hl-b">'+d.setup.panelUrl+'</span>');
          if(netParts.length) addLog('ok',netParts.join(' | '));
          addLog('ok','<span class="hl">Все системы готовы</span>');
        }
      }
    }

    // Launch button state
    var ob=document.getElementById('ob');
    if(d.next==='online'){
      ob.classList.remove('off');
      ob.querySelector('svg').nextSibling.textContent=' Запустить панель';
    }else{
      ob.classList.add('off');
    }

    // License info update
    if(d.license&&d.license.daysLeft!==undefined){
      var dl=document.getElementById('daysLeft');
      if(dl) dl.textContent=formatRemaining(d.license.expiresAt, d.license.daysLeft);
      var exp=document.getElementById('expDate');
      if(exp) exp.textContent=formatExpiryDate(d.license.expiresAt, d.license.daysLeft);
    }
  }catch(e){}
  var fmt=function(ms){var s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60);s%=60;m%=60;return(h?h+'ч ':'')+(m?m+'м ':'')+(s+'с')};
  var ut=document.getElementById('ut');
  if(ut) ut.textContent='Uptime: '+fmt(Date.now()-start);
}

function openPanel(){
  var ob=document.getElementById('ob');
  if(ob.classList.contains('off')) return;
  window.open('http://localhost:${PANEL_PORT}','_blank');
}
function restartAll(){
  var btn=document.getElementById('rb');
  btn.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg> Перезапуск...';
  btn.disabled=true;
  addLog('run','Перезапуск всех сервисов...');
  fetch('/api/restart',{method:'POST'}).catch(function(){});
  setTimeout(function(){location.reload()},3000);
}
function openSettings(){
  addLog('wait','Настройки: <span class="dim">скоро</span>');
}
function logout(){
  if(confirm('Выйти из аккаунта?')){
    fetch('/api/launcher-auth/logout',{method:'POST'}).then(function(){
      location.reload();
    }).catch(function(){location.reload()});
  }
}

// ---- Auto-update ----
var _updateInfo=null;
async function checkForUpdate(){
  try{
    var r=await fetch('/api/check-update');
    var d=await r.json();
    if(d.hasUpdate){
      _updateInfo=d;
      var btn=document.getElementById('updateBtn');
      var txt=document.getElementById('updateBtnText');
      if(btn){
        btn.classList.add('show');
        var sizeMB=d.file_size?(d.file_size/1048576).toFixed(0)+' МБ':'';
        txt.textContent='Обновление v'+d.version+(sizeMB?' ('+sizeMB+')':'');
      }
      addLog('ok','<span class="hl-y">Доступно обновление v'+d.version+'</span>');
    }
  }catch(e){}
}
var _updatePolling=null;
async function downloadUpdate(){
  if(!_updateInfo) return;
  var btn=document.getElementById('updateBtn');
  var txt=document.getElementById('updateBtnText');
  var wrap=document.getElementById('updateProgressWrap');
  var fill=document.getElementById('updateProgressFill');
  var ptxt=document.getElementById('updateProgressText');
  if(btn.classList.contains('downloading')) return;
  btn.classList.add('downloading');
  txt.textContent='Подготовка...';
  wrap.classList.add('show');
  fill.style.width='0%';
  ptxt.textContent='Инициализация...';
  addLog('run','Загрузка обновления v'+_updateInfo.version+'...');
  try{
    var r=await fetch('/api/apply-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:_updateInfo.version})});
    var d=await r.json();
    if(d.success){
      // Start polling progress
      _updatePolling=setInterval(async function(){
        try{
          var pr=await fetch('/api/update-progress');
          var pd=await pr.json();
          fill.style.width=(pd.percent||0)+'%';
          ptxt.textContent=pd.message||pd.stage||'';
          txt.textContent=pd.message||'Загрузка...';
          if(pd.stage==='restarting'){
            clearInterval(_updatePolling);
            addLog('ok','Обновление установлено. Перезапуск...');
            txt.textContent='Перезапуск...';
            fill.style.width='100%';
            ptxt.textContent='Перезапуск приложения...';
          }
          if(pd.stage==='error'){
            clearInterval(_updatePolling);
            addLog('err','Ошибка: '+(pd.error||'неизвестная'));
            btn.classList.remove('downloading');
            wrap.classList.remove('show');
            txt.textContent='Повторить обновление';
          }
        }catch(e){}
      },500);
    }else{
      addLog('err','Ошибка обновления: '+(d.error||'неизвестная'));
      btn.classList.remove('downloading');
      wrap.classList.remove('show');
      txt.textContent='Повторить обновление';
    }
  }catch(e){
    addLog('err','Ошибка загрузки: '+e.message);
    btn.classList.remove('downloading');
    wrap.classList.remove('show');
    txt.textContent='Повторить обновление';
  }
}
// Check for updates immediately, then every 10 min
checkForUpdate();
setInterval(checkForUpdate,600000);
</script>
</body></html>`;
}

// ---- Rate Limiting ----
const _loginAttempts = new Map(); // ip -> { count, firstAttempt, blockedUntil }
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 5; // max attempts per window
const RATE_LIMIT_BLOCK = 15 * 60 * 1000; // 15 min block

function _checkRateLimit(ip) {
  const now = Date.now();
  const entry = _loginAttempts.get(ip);
  if (!entry) return true;
  if (entry.blockedUntil && now < entry.blockedUntil) return false;
  if (entry.blockedUntil && now >= entry.blockedUntil) { _loginAttempts.delete(ip); return true; }
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW) { _loginAttempts.delete(ip); return true; }
  return entry.count < RATE_LIMIT_MAX;
}

function _recordLoginAttempt(ip, success) {
  const now = Date.now();
  if (success) { _loginAttempts.delete(ip); return; }
  const entry = _loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  entry.count++;
  if (entry.count >= RATE_LIMIT_MAX) {
    entry.blockedUntil = now + RATE_LIMIT_BLOCK;
  }
  _loginAttempts.set(ip, entry);
}

// ---- Launcher HTTP server ----
async function startLauncherServer() {
  // ALWAYS kill launcher port first — no stale instances
  await killPort(LAUNCHER_PORT);
  await new Promise(r => setTimeout(r, 500));

  const server = http.createServer(async (req, res) => {
    const clientIP = req.socket.remoteAddress || '127.0.0.1';

    // Security headers for user privacy & protection
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // CORS: Only allow local origins
    const origin = req.headers.origin || '';
    const allowedOrigins = [
      `http://localhost:${LAUNCHER_PORT}`,
      `http://127.0.0.1:${LAUNCHER_PORT}`,
      `http://localhost:${PANEL_PORT}`,
      `http://127.0.0.1:${PANEL_PORT}`,
    ];
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      // Same-origin requests (no Origin header) — allow
      res.setHeader('Access-Control-Allow-Origin', `http://localhost:${LAUNCHER_PORT}`);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve logo
    if (req.url === '/visualillusion_white_n.png' || req.url === '/visualillusion_white.png') {
      const logoPath = path.join(BASE_DIR, 'public', 'visualillusion_white_n.png');
      if (fs.existsSync(logoPath)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
        res.end(fs.readFileSync(logoPath));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // ---- Auth API endpoints ----
    if (req.url === '/api/launcher-auth/check') {
      const cookies = req.headers.cookie || '';
      const token = getCookieValue(cookies, 'launcher_session');
      const session = token ? getSession(token) : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (session) {
        res.end(JSON.stringify({ authenticated: true, nickname: session.nickname || session.username, role: session.role }));
      } else {
        res.end(JSON.stringify({ authenticated: false }));
      }
      return;
    }

    if (req.url === '/api/launcher-auth/login' && req.method === 'POST') {
      // Rate limiting
      if (!_checkRateLimit(clientIP)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Слишком много попыток. Подождите 15 минут.' }));
        return;
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { username, password } = JSON.parse(body);
          if (!username || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Логин и пароль обязательны' }));
            return;
          }

          // Query Supabase for user
          let user = null;
          try {
            console.log('[Auth] Querying Supabase for user:', username, 'URL:', SUPABASE_URL ? 'configured' : 'EMPTY');
            const resp = await supabaseRequest('GET', 'users?username=eq.' + encodeURIComponent(username) + '&select=id,username,password_hash,role,license_key_id&limit=1');
            if (resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
              user = resp.data[0];
              console.log('[Auth] User found in DB:', user.username, 'role:', user.role, 'has_hash:', !!user.password_hash);
            } else {
              console.log('[Auth] User not found in DB. Response:', JSON.stringify(resp).substring(0, 200));
            }
          } catch (dbErr) {
            console.error('[Auth] Supabase query failed:', dbErr.message);
          }

          // Fallback: admin account if Supabase unavailable
          if (!user && username === 'admin') {
            try { fs.writeFileSync(path.join(DATA_DIR, '.nickname'), 'admin', 'utf-8'); } catch {}
            const licInfo = await ensureAdminLicense('admin');
            const token = createSession({ id: 'local-admin', username: 'admin', nickname: 'admin', role: 'admin' });
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Set-Cookie': [
                'launcher_session=' + token + '; Path=/; HttpOnly; Max-Age=86400',
                'user_id=local-admin; Path=/; Max-Age=86400',
                'user_role=admin; Path=/; Max-Age=86400',
              ],
            });
            res.end(JSON.stringify({ success: true, nickname: 'admin', role: 'admin', userId: 'local-admin', daysLeft: licInfo ? licInfo.daysLeft : 36500, expiresAt: licInfo ? licInfo.expiresAt : '' }));
            return;
          }

          if (!user) {
            _recordLoginAttempt(clientIP, false);
            console.log('[Auth] Login failed: user not found and not admin fallback');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Неверный логин или пароль' }));
            return;
          }

          // Password verification
          let passwordOk = false;
          if (bcrypt && user.password_hash) {
            try { passwordOk = bcrypt.compareSync(password, user.password_hash); } catch {}
          }

          if (!passwordOk) {
            console.log('[Auth] bcrypt check failed. bcrypt loaded:', !!bcrypt, 'hash present:', !!user.password_hash);
            // Fallback for admin: known default password or env variable
            const envAdminPass = process.env.ADMIN_PASSWORD;
            const isAdminDefault = (user.username === 'admin' && password === 'admin123');
            const isAdminEnv = (user.username === 'admin' && envAdminPass && password === envAdminPass);
            if (isAdminDefault || isAdminEnv) {
              console.log('[Auth] Admin password matched via fallback, updating hash in Supabase...');
              // Update the hash in Supabase so bcrypt works next time
              if (bcrypt) {
                const newHash = bcrypt.hashSync(password, 10);
                try {
                  await supabaseRequest('PATCH', 'users?id=eq.' + user.id, { password_hash: newHash });
                  console.log('[Auth] Admin hash updated in Supabase');
                } catch (e) { console.error('[Auth] Failed to update admin hash:', e.message); }
              }
              passwordOk = true;
            }
          }

          if (!passwordOk) {
              _recordLoginAttempt(clientIP, false);
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Неверный логин или пароль' }));
              return;
          }

          // Success — clear rate limit
          _recordLoginAttempt(clientIP, true);

          // Update last_login & hwid
          const hwid = getLocalHWID();
          await supabaseRequest('PATCH', 'users?id=eq.' + user.id, { last_login: new Date().toISOString(), hwid: hwid });

          // Also save .nickname file for the launcher sidebar
          try { fs.writeFileSync(path.join(DATA_DIR, '.nickname'), username, 'utf-8'); } catch {}

          // Get per-user license info from their linked license_key_id
          let licDays = 0, licExpires = '';
          if (user.license_key_id) {
            // Fetch user's personal license key from DB
            try {
              const keyResp = await supabaseRequest('GET', 'license_keys?id=eq.' + user.license_key_id + '&select=expires_at&limit=1');
              if (keyResp.data && Array.isArray(keyResp.data) && keyResp.data.length > 0) {
                const keyData = keyResp.data[0];
                const expiresDate = new Date(keyData.expires_at);
                licExpires = keyData.expires_at;
                licDays = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / 86400000));
              }
            } catch {}
          }

          const token = createSession({ id: user.id, username: user.username, nickname: user.username, role: user.role });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': [
              'launcher_session=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400',
              'user_id=' + user.id + '; Path=/; SameSite=Strict; Max-Age=86400',
              'user_role=' + user.role + '; Path=/; SameSite=Strict; Max-Age=86400',
            ],
          });
          res.end(JSON.stringify({ success: true, nickname: user.username, role: user.role, userId: user.id, daysLeft: licDays, expiresAt: licExpires }));
        } catch (e) {
          console.error('[Auth] Login error:', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ошибка сервера' }));
        }
      });
      return;
    }

    if (req.url === '/api/launcher-auth/register' && req.method === 'POST') {
      // Rate limiting for registration too
      if (!_checkRateLimit(clientIP)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Слишком много попыток. Подождите 15 минут.' }));
        return;
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { name, username, password, key } = JSON.parse(body);
          const normalizedKey = normalizeLicenseKey(key);
          if (!username || !password || !normalizedKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Все поля обязательны' }));
            return;
          }
          const displayName = name || username;

          // Verify license key against Supabase DB only
          const keyInfo = await verifyKeyFromDB(normalizedKey);
          
          if (!keyInfo) {
            console.error('[Auth] Key not found in DB:', normalizedKey);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Недействительный ключ' }));
            return;
          }
          if (keyInfo.expired) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Срок действия ключа истёк' }));
            return;
          }
          const dbKey = { id: keyInfo.dbId, activated: keyInfo.activated, activated_by: keyInfo.activated_by, hwid: keyInfo.hwid };
          const hwid = getLocalHWID();

          // Check if already activated by another machine
          if (dbKey.activated && dbKey.hwid && dbKey.hwid !== hwid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ключ уже активирован: ' + (dbKey.activated_by || 'другой пользователь') }));
            return;
          }

          // Check if username already taken
          try {
            const existUser = await supabaseRequest('GET', 'users?username=eq.' + encodeURIComponent(username) + '&select=id&limit=1');
            if (existUser.data && Array.isArray(existUser.data) && existUser.data.length > 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Пользователь с таким логином уже существует' }));
              return;
            }
          } catch {}

          // Hash password
          if (!bcrypt) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'bcrypt не доступен' }));
            return;
          }
          const passwordHash = bcrypt.hashSync(password, 10);

          // Register user in Supabase  
          const role = keyInfo.type === 'admin' ? 'admin' : 'viewer';
          try {
            console.log('[Auth] Creating user in Supabase:', { username, role, hwid, license_key_id: dbKey.id });
            const createResp = await supabaseRequest('POST', 'users', {
              username: username,
              password_hash: passwordHash,
              role: role,
              hwid: hwid,
              license_key_id: dbKey.id,
            });

            console.log('[Auth] Supabase user creation response:', createResp.status, JSON.stringify(createResp.data));

            if (createResp.status >= 400) {
              const errMsg = createResp.data && typeof createResp.data === 'object' && createResp.data.message
                ? createResp.data.message
                : (createResp.data && typeof createResp.data === 'string' ? createResp.data : 'Ошибка создания пользователя в БД');
              console.error('[Auth] Supabase user creation failed:', createResp.status, errMsg);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Ошибка БД: ' + errMsg }));
              return;
            }

            // Mark key as activated
            console.log('[Auth] Marking key as activated for:', displayName);
            const activateResp = await supabaseRequest('PATCH', 'license_keys?key=eq.' + encodeURIComponent(normalizedKey), {
              activated: true,
              activated_by: displayName,
              activated_at: new Date().toISOString(),
              hwid: hwid,
            });
            console.log('[Auth] Key activation response:', activateResp.status);
          } catch (dbErr) {
            console.error('[Auth] Supabase register write failed:', dbErr.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка подключения к БД: ' + dbErr.message }));
            return;
          }

          // Save license + nickname locally (encrypted)
          _saveLicenseFile(normalizedKey);
          try { fs.writeFileSync(path.join(DATA_DIR, '.nickname'), displayName, 'utf-8'); } catch {}

          const token = createSession({ id: username, username: username, nickname: displayName, role: role });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'launcher_session=' + token + '; Path=/; HttpOnly; Max-Age=86400',
          });
          res.end(JSON.stringify({ success: true, nickname: displayName, role: role, daysLeft: keyInfo.daysLeft, expiresAt: keyInfo.expiresAt }));
        } catch (e) {
          console.error('[Auth] Register error:', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ошибка сервера' }));
        }
      });
      return;
    }

    if (req.url === '/api/launcher-auth/logout' && req.method === 'POST') {
      const cookies = req.headers.cookie || '';
      const token = getCookieValue(cookies, 'launcher_session');
      if (token) destroySession(token);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'launcher_session=; Path=/; HttpOnly; Max-Age=0',
      });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.url === '/logout' && req.method === 'GET') {
      const cookies = req.headers.cookie || '';
      const token = getCookieValue(cookies, 'launcher_session');
      if (token) destroySession(token);
      res.writeHead(302, {
        'Location': '/',
        'Set-Cookie': 'launcher_session=; Path=/; HttpOnly; Max-Age=0',
      });
      res.end();
      return;
    }

    // ---- Activate subscription (new key) ----
    if (req.url === '/api/activate-subscription' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const cookies = req.headers.cookie || '';
          const sessionToken = getCookieValue(cookies, 'launcher_session');
          const session = sessionToken ? getSession(sessionToken) : null;
          if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
          }
          const { key } = JSON.parse(body);
          const normalizedKey = normalizeLicenseKey(key);
          if (!normalizedKey) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ключ обязателен' }));
            return;
          }
          // Verify key
          const keyInfo = await verifyKeyFromDB(normalizedKey);
          if (!keyInfo) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Недействительный ключ' }));
            return;
          }
          if (keyInfo.expired) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Срок действия ключа истёк' }));
            return;
          }
          const hwid = getLocalHWID();
          if (keyInfo.activated && keyInfo.hwid && keyInfo.hwid !== hwid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ключ уже активирован на другом устройстве' }));
            return;
          }
          // Link key to user in DB
          const userId = session.id || getCookieValue(cookies, 'user_id');
          if (userId) {
            await supabaseRequest('PATCH', 'users?id=eq.' + userId, { license_key_id: keyInfo.dbId });
          }
          // Mark key as activated
          if (!keyInfo.activated) {
            await supabaseRequest('PATCH', 'license_keys?key=eq.' + encodeURIComponent(normalizedKey), {
              activated: true,
              activated_by: session.nickname || session.username || 'user',
              activated_at: new Date().toISOString(),
              hwid: hwid,
            });
          }
          // Save locally too (encrypted)
          _saveLicenseFile(normalizedKey);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            expiresAt: keyInfo.expiresAt,
            daysLeft: keyInfo.daysLeft,
            plan: keyInfo.plan,
            type: keyInfo.type,
          }));
        } catch (e) {
          console.error('[Auth] Activate subscription error:', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Ошибка сервера' }));
        }
      });
      return;
    }

    // ---- Update progress API ----
    if (req.url === '/api/update-progress') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(_updateProgress));
      return;
    }

    // ---- Update API endpoints ----
    if (req.url === '/api/check-update') {
      try {
        // Re-check every 5 minutes instead of caching forever
        const now = Date.now();
        if (!_cachedUpdateInfo || (now - _lastUpdateCheck > 5 * 60 * 1000)) {
          _cachedUpdateInfo = await checkForUpdateDB();
          _lastUpdateCheck = now;
        }
        if (_cachedUpdateInfo) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            hasUpdate: true,
            version: _cachedUpdateInfo.version,
            download_url: _cachedUpdateInfo.download_url,
            file_size: _cachedUpdateInfo.file_size || 0,
            sha256: _cachedUpdateInfo.sha256 || '',
            changelog: _cachedUpdateInfo.changelog || '',
            currentVersion: getLocalVersion(),
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasUpdate: false, currentVersion: getLocalVersion() }));
        }
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hasUpdate: false, error: e.message }));
      }
      return;
    }

    if (req.url === '/api/apply-update' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          if (!_cachedUpdateInfo) {
            _cachedUpdateInfo = await checkForUpdateDB();
          }
          if (!_cachedUpdateInfo) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Нет доступных обновлений' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Загрузка обновления...' }));
          // Apply update async (will restart the app)
          setTimeout(() => applyUpdate(_cachedUpdateInfo).catch(e => {
            console.error('[Update] Apply failed:', e.message);
            _updateProgress = { stage: 'error', percent: 0, message: '', error: e.message };
          }), 500);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // ---- Existing routes ----
    if (req.url === '/api/status') {
      const status = await getStatus();
      _cachedLicenseInfo = status.license || null;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(status));
    } else if (req.url === '/api/restart' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      // Restart both servers
      (async () => {
        console.log('[Launcher] Перезапуск по запросу...');
        if (wsProcess) try { wsProcess.kill('SIGKILL'); } catch {}
        if (nextProcess) try { nextProcess.kill('SIGKILL'); } catch {}
        await new Promise(r => setTimeout(r, 500));
        await startWS();
        await startNext();
      })();
    } else {
      // Populate license cache before serving HTML if not yet done
      if (!_cachedLicenseInfo) {
        try {
          const status = await getStatus();
          _cachedLicenseInfo = status.license || null;
        } catch {}
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getHTML());
    }
  });

  return new Promise((resolve) => {
    server.listen(LAUNCHER_PORT, () => {
      console.log(`[Launcher] GUI: http://localhost:${LAUNCHER_PORT}`);
      resolve(true);
    });
    server.on('error', (e) => {
      console.error(`[Launcher] Ошибка сервера GUI: ${e.message}`);
      resolve(false);
    });
  });
}

// ---- Open browser ----
function openBrowser(url) {
  const p = os.platform();
  if (p === 'win32') exec(`start "" "${url}"`);
  else if (p === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`);
}

// ---- Graceful shutdown ----
function cleanup() {
  console.log('\n[Launcher] Завершение работы...');
  if (wsTunnel) try { wsTunnel.stop(); } catch {}
  if (panelTunnel) try { panelTunnel.stop(); } catch {}
  if (wsProcess) try { wsProcess.kill('SIGKILL'); } catch {}
  if (nextProcess) try { nextProcess.kill('SIGKILL'); } catch {}
  if (!process.env.ELECTRON_RUN) process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => console.error('[Launcher] Ошибка:', err.message));

// ---- Main ----
async function main() {
  console.log('');
  console.log('==============================================');
  console.log('   VisualIllusion — Launcher');
  console.log('==============================================');
  console.log(`  GUI:       http://localhost:${LAUNCHER_PORT}`);
  console.log(`  Panel:     http://localhost:${PANEL_PORT}`);
  console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`  Node:      ${NODE_BIN || 'НЕ НАЙДЕН'}`);
  console.log('==============================================');
  console.log('');

  // PROTECTION: Start reverse-engineering tool monitor
  _startProtectionMonitor();

  // PROTECTION: Start periodic license re-validation
  _startLicenseRevalidation();

  // Step 1: Ensure static files are in standalone
  ensureStaticFiles();

  // Reload Supabase config and LICENSE_SECRET after ensureStaticFiles may have created/patched .env.local
  reloadSupabaseConfig();
  {
    const envPath = path.join(DATA_DIR, '.env.local');
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf-8');
      const m = raw.match(/^LICENSE_SECRET=(.+)$/m);
      if (m) {
        process.env.LICENSE_SECRET = m[1].trim();
        LICENSE_SECRET = m[1].trim();
        console.log('[Launcher] LICENSE_SECRET загружен из .env.local');
      }
    }
  }

  // Step 2: Kill ALL ports — clean slate
  await killAllPorts();

  // Step 3: Start launcher GUI first (so user sees something immediately)
  const guiOk = await startLauncherServer();
  if (guiOk && !process.env.ELECTRON_RUN) {
    openBrowser(`http://localhost:${LAUNCHER_PORT}`);
  }

  // Step 4: Auto-setup (firewall/upnp/env/tunnel), progress visible in GUI
  // Note: runAutoSetup may start WS early for external port check
  await runAutoSetup();

  // Step 5: Start services (WS may already be running from setup)
  if (!wsAlive) await startWS();
  await startNext();

  // Step 6: Start health monitor — checks every 3s, auto-restarts
  setInterval(healthCheck, 3000);
  // Run first health check after 2s (give servers time to boot)
  setTimeout(healthCheck, 2000);

  console.log('[Launcher] Все сервисы запущены. Мониторинг активен.');
}

if (process.env.ELECTRON_RUN) {
  module.exports = { main, getStatus, cleanup, setupState, LAUNCHER_PORT, PANEL_PORT, WS_PORT };
} else {
  main();
  // Keep process alive
  setInterval(() => {}, 60000);
}
