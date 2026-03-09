/**
 * Standalone WebSocket Server for real-time communication with agents.
 * Run: node server/ws-server.js
 *
 * Devices are persisted in Supabase (per-user isolation).
 * In production, use WSS (WebSocket Secure) with TLS certificates.
 */

const { WebSocketServer } = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ==================== Load .env.local ====================
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq > 0) {
          const k = t.slice(0, eq).trim();
          const v = t.slice(eq + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  } catch (e) { console.error('[WS Server] .env.local load error:', e.message); }
})();

const PORT = process.env.WS_PORT || 3001;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

// ==================== Supabase REST helper ====================
function supabaseRequest(method, restPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(restPath, SUPABASE_URL);
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    };
    if (method === 'POST') opts.headers['Prefer'] = 'resolution=merge-duplicates,return=minimal';
    if (method === 'PATCH' || method === 'DELETE') opts.headers['Prefer'] = 'return=minimal';

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Supabase request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ==================== WebSocket Server ====================
const wss = new WebSocketServer({ port: PORT, maxPayload: 200 * 1024 * 1024 }, () => {
  console.log(`[WS Server] WebSocket server started on port ${PORT}`);
});

// clients Map stores: { type: 'admin'|'agent', deviceId?, ownerId?, userId?, role?, alive }
const clients = new Map();

// In-memory cache of all known agents (deviceId -> agent info)
// ownerId is a comma-separated list of owner IDs (multi-owner support)
const knownAgents = new Map();

// ==================== Multi-Owner Helpers ====================
// Parse comma-separated owner_id into array of unique IDs
// Validate that a string looks like a UUID (loose check)
function isValidOwnerId(id) {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function parseOwnerIds(ownerIdStr) {
  if (!ownerIdStr) return [];
  return [...new Set(
    ownerIdStr.split(',').map(s => s.trim()).filter(id => id && isValidOwnerId(id))
  )];
}

// Merge a new ownerId into an existing comma-separated list
function mergeOwnerId(existingStr, newId) {
  if (!newId || !isValidOwnerId(newId)) return parseOwnerIds(existingStr).join(',') || '';
  const ids = parseOwnerIds(existingStr);
  if (!ids.includes(newId)) ids.push(newId);
  return ids.join(',');
}

// Check if a specific userId is in the owner list
function isOwner(ownerIdStr, userId) {
  if (!userId || !ownerIdStr) return false;
  return parseOwnerIds(ownerIdStr).includes(userId);
}

// Remove a specific userId from the owner list
function removeOwnerFromList(ownerIdStr, userId) {
  if (!userId || !ownerIdStr) return ownerIdStr || '';
  return parseOwnerIds(ownerIdStr).filter(id => id !== userId).join(',');
}

// ==================== Owner Validation Against Users DB ====================
// Cache valid user IDs to reduce DB calls (TTL 60s)
const _validUserCache = new Map(); // userId -> { valid: bool, ts: number }
const VALID_USER_CACHE_TTL = 60000;

async function isUserExists(userId) {
  if (!userId || !isValidOwnerId(userId)) return false;
  const cached = _validUserCache.get(userId);
  if (cached && (Date.now() - cached.ts) < VALID_USER_CACHE_TTL) return cached.valid;
  
  if (!SUPABASE_URL || !SUPABASE_KEY) return true; // can't validate without DB, assume valid
  try {
    const { status, data } = await supabaseRequest('GET', '/rest/v1/users?id=eq.' + encodeURIComponent(userId) + '&select=id&limit=1');
    const valid = status === 200 && Array.isArray(data) && data.length > 0;
    _validUserCache.set(userId, { valid, ts: Date.now() });
    return valid;
  } catch (err) {
    console.error('[WS Server] User validation error:', err.message);
    return true; // on error, don't block — assume valid
  }
}

// Validate a list of owner IDs, return only those that exist in the users table
async function validateOwnerIds(ownerIdStr) {
  const ids = parseOwnerIds(ownerIdStr);
  if (ids.length === 0) return '';
  const results = await Promise.all(ids.map(id => isUserExists(id).then(valid => ({ id, valid }))));
  const validIds = results.filter(r => r.valid).map(r => r.id);
  const invalidIds = results.filter(r => !r.valid).map(r => r.id);
  if (invalidIds.length > 0) {
    console.log(`[WS Server] Purged invalid owner_ids: [${invalidIds.join(',')}] — users no longer exist`);
  }
  return validIds.join(',');
}

// ==================== Supabase Persistence ====================
async function loadAgentsFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[WS Server] Supabase not configured — no agents loaded');
    return;
  }
  try {
    const { status, data } = await supabaseRequest('GET', '/rest/v1/devices?select=*');
    if (status === 200 && Array.isArray(data)) {
      for (const r of data) {
        // Sanitize owner_id on load (strip 'none', trailing commas, non-UUID values)
        const cleanedOwnerId = parseOwnerIds(r.owner_id).join(',');
        // Validate owner_ids exist in users table — async, will clean up stale ones
        const validatedOwnerId = await validateOwnerIds(cleanedOwnerId);
        knownAgents.set(r.device_id, {
          deviceId: r.device_id,
          ownerId: validatedOwnerId,
          hostname: r.hostname || 'Unknown',
          ip: r.ip || '0.0.0.0',
          os: r.os || 'Unknown',
          agentVersion: r.agent_version || '1.0.0',
          clientName: r.client_name || 'Agent',
          status: 'offline',
          lastSeen: r.last_seen || new Date().toISOString(),
          country: r.country || '',
          countryCode: r.country_code || '',
          city: r.city || '',
        });
        // If owner_id was corrupted or contained stale users, persist the cleaned version back
        if (validatedOwnerId !== (r.owner_id || '')) {
          console.log(`[WS Server] Cleaning owner_id for ${r.device_id}: "${r.owner_id}" → "${validatedOwnerId}"`);
          upsertAgentDebounced({ deviceId: r.device_id, ownerId: validatedOwnerId });
        }
      }
      console.log(`[WS Server] Loaded ${data.length} agents from Supabase`);
    } else {
      console.warn(`[WS Server] Supabase load status: ${status}`);
    }
  } catch (err) {
    console.error('[WS Server] Supabase load error:', err.message);
  }
}

// Upsert one agent to Supabase
function upsertAgentToSupabase(a) {
  if (!SUPABASE_URL) return;
  supabaseRequest('POST', '/rest/v1/devices', {
    device_id: a.deviceId,
    owner_id: a.ownerId || '',
    hostname: a.hostname || 'Unknown',
    ip: a.ip || '0.0.0.0',
    os: a.os || 'Unknown',
    agent_version: a.agentVersion || '1.0.0',
    client_name: a.clientName || 'Agent',
    status: a.status || 'online',
    last_seen: a.lastSeen || new Date().toISOString(),
    country: a.country || '',
    country_code: a.countryCode || '',
    city: a.city || '',
  }).catch((e) => console.error('[WS Server] Supabase upsert error:', e.message));
}

// Debounced upsert (per device)
const _upsertTimers = new Map();
function upsertAgentDebounced(agent) {
  const id = agent.deviceId;
  if (_upsertTimers.has(id)) clearTimeout(_upsertTimers.get(id));
  _upsertTimers.set(id, setTimeout(() => { _upsertTimers.delete(id); upsertAgentToSupabase(agent); }, 2000));
}

function updateAgentStatus(deviceId, status) {
  if (!SUPABASE_URL) return;
  supabaseRequest('PATCH', `/rest/v1/devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
    status, last_seen: new Date().toISOString(),
  }).catch((e) => console.error('[WS Server] Supabase status update error:', e.message));
}

function deleteAgentFromSupabase(deviceId) {
  if (!SUPABASE_URL) return;
  supabaseRequest('DELETE', `/rest/v1/devices?device_id=eq.${encodeURIComponent(deviceId)}`)
    .catch((e) => console.error('[WS Server] Supabase delete error:', e.message));
}

// Load agents on startup
loadAgentsFromSupabase();

// ==================== IP Geolocation ====================

// Cache: ip -> { country, countryCode, city, lat, lon, ts }
const geoCache = new Map();
const GEO_CACHE_TTL = 3600000; // 1 hour

// ISO 3166-1 Alpha-2 → Alpha-3 mapping for map display
const a2to3 = {
  'AF':'AFG','AL':'ALB','DZ':'DZA','AD':'AND','AO':'AGO','AG':'ATG','AR':'ARG','AM':'ARM','AU':'AUS',
  'AT':'AUT','AZ':'AZE','BS':'BHS','BH':'BHR','BD':'BGD','BB':'BRB','BY':'BLR','BE':'BEL','BZ':'BLZ',
  'BJ':'BEN','BT':'BTN','BO':'BOL','BA':'BIH','BW':'BWA','BR':'BRA','BN':'BRN','BG':'BGR','BF':'BFA',
  'BI':'BDI','KH':'KHM','CM':'CMR','CA':'CAN','CV':'CPV','CF':'CAF','TD':'TCD','CL':'CHL','CN':'CHN',
  'CO':'COL','CG':'COG','CD':'COD','CR':'CRI','CI':'CIV','HR':'HRV','CU':'CUB','CY':'CYP','CZ':'CZE',
  'DK':'DNK','DJ':'DJI','DM':'DMA','DO':'DOM','EC':'ECU','EG':'EGY','SV':'SLV','GQ':'GNQ','ER':'ERI',
  'EE':'EST','ET':'ETH','FJ':'FJI','FI':'FIN','FR':'FRA','GA':'GAB','GM':'GMB','GE':'GEO','DE':'DEU',
  'GH':'GHA','GR':'GRC','GD':'GRD','GT':'GTM','GN':'GIN','GW':'GNB','GY':'GUY','HT':'HTI','HN':'HND',
  'HU':'HUN','IS':'ISL','IN':'IND','ID':'IDN','IR':'IRN','IQ':'IRQ','IE':'IRL','IL':'ISR','IT':'ITA',
  'JM':'JAM','JP':'JPN','JO':'JOR','KZ':'KAZ','KE':'KEN','KR':'KOR','KW':'KWT','KG':'KGZ','LA':'LAO',
  'LV':'LVA','LB':'LBN','LS':'LSO','LR':'LBR','LY':'LBY','LT':'LTU','LU':'LUX','MK':'MKD','MG':'MDG',
  'MW':'MWI','MY':'MYS','MV':'MDV','ML':'MLI','MT':'MLT','MR':'MRT','MU':'MUS','MX':'MEX','MD':'MDA',
  'MC':'MCO','MN':'MNG','ME':'MNE','MA':'MAR','MZ':'MOZ','MM':'MMR','NA':'NAM','NP':'NPL','NL':'NLD',
  'NZ':'NZL','NI':'NIC','NE':'NER','NG':'NGA','NO':'NOR','OM':'OMN','PK':'PAK','PA':'PAN','PG':'PNG',
  'PY':'PRY','PE':'PER','PH':'PHL','PL':'POL','PT':'PRT','QA':'QAT','RO':'ROU','RU':'RUS','RW':'RWA',
  'SA':'SAU','SN':'SEN','RS':'SRB','SC':'SYC','SL':'SLE','SG':'SGP','SK':'SVK','SI':'SVN','SO':'SOM',
  'ZA':'ZAF','ES':'ESP','LK':'LKA','SD':'SDN','SR':'SUR','SZ':'SWZ','SE':'SWE','CH':'CHE','SY':'SYR',
  'TW':'TWN','TJ':'TJK','TZ':'TZA','TH':'THA','TG':'TGO','TT':'TTO','TN':'TUN','TR':'TUR','TM':'TKM',
  'UG':'UGA','UA':'UKR','AE':'ARE','GB':'GBR','US':'USA','UY':'URY','UZ':'UZB','VE':'VEN','VN':'VNM',
  'YE':'YEM','ZM':'ZMB','ZW':'ZWE','XK':'XKX',
};

function toAlpha3(code) { return code ? (a2to3[code.toUpperCase()] || code) : ''; }

function isPrivateIP(ip) {
  if (!ip) return true;
  return /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1|fc|fd|fe80|0\.0\.0\.0|localhost)/i.test(ip);
}

function geolocateIP(ip) {
  return new Promise((resolve) => {
    if (!ip || isPrivateIP(ip)) {
      // For private IPs, query without IP to get server's public IP geo
      return geolocatePublic(resolve);
    }
    // Check cache
    const cached = geoCache.get(ip);
    if (cached && (Date.now() - cached.ts) < GEO_CACHE_TTL) {
      return resolve({ country: cached.country, countryCode: cached.countryCode, city: cached.city });
    }
    const url = `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon`;
    http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            const result = { country: json.country, countryCode: toAlpha3(json.countryCode), city: json.city || '' };
            geoCache.set(ip, { ...result, ts: Date.now() });
            resolve(result);
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function geolocatePublic(resolve) {
  const url = 'http://ip-api.com/json/?fields=status,country,countryCode,city,query';
  http.get(url, { timeout: 5000 }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.status === 'success') {
          const result = { country: json.country, countryCode: toAlpha3(json.countryCode), city: json.city || '' };
          if (json.query) geoCache.set(json.query, { ...result, ts: Date.now() });
          resolve(result);
        } else {
          resolve(null);
        }
      } catch { resolve(null); }
    });
  }).on('error', () => resolve(null));
}

// ==================== Connection Rate Limiting ====================
const _wsConnAttempts = new Map(); // ip -> { count, firstAttempt }
const WS_RATE_WINDOW = 60 * 1000; // 1 minute
const WS_RATE_MAX = 20; // max connections per minute per IP

function _wsRateCheck(ip) {
  const now = Date.now();
  const entry = _wsConnAttempts.get(ip);
  if (!entry) { _wsConnAttempts.set(ip, { count: 1, firstAttempt: now }); return true; }
  if (now - entry.firstAttempt > WS_RATE_WINDOW) { _wsConnAttempts.set(ip, { count: 1, firstAttempt: now }); return true; }
  entry.count++;
  return entry.count <= WS_RATE_MAX;
}

// ==================== Admin Auth Verification ====================
async function verifyAdminUser(userId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !userId) return false;
  try {
    const { status, data } = await supabaseRequest('GET', `/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=id,role&limit=1`);
    if (status === 200 && Array.isArray(data) && data.length > 0) return true;
    return false;
  } catch { return false; }
}

// ==================== WebSocket Server ====================

console.log(`[WS Server] Running on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  
  // Rate limit connections
  if (!_wsRateCheck(ip)) {
    console.warn(`[WS] Rate limited connection from ${ip}`);
    ws.close(1008, 'Rate limited');
    return;
  }
  
  console.log(`[WS] New connection from ${ip}`);

  // New connections start as 'unknown' and have 30s to authenticate
  clients.set(ws, { type: 'unknown', alive: true });
  
  // Auto-disconnect if not authenticated within 30 seconds
  const authTimeout = setTimeout(() => {
    const info = clients.get(ws);
    if (info && info.type === 'unknown') {
      console.warn(`[WS] Auth timeout for ${ip} — disconnecting`);
      ws.close(1008, 'Authentication timeout');
    }
  }, 30000);

  // Ping/pong for connection health
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      // Block messages from unauthenticated connections (except register_*)
      const rawStr = raw.toString();
      const message = JSON.parse(rawStr);
      const info = clients.get(ws);
      if (info?.type === 'unknown' && !['register_agent', 'register_admin', 'heartbeat'].includes(message.type)) {
        console.warn(`[WS] Blocked unauthenticated message type: ${message.type}`);
        return;
      }
      handleMessage(ws, message);
    } catch (err) {
      console.error('[WS] Invalid message:', err.message);
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    const info = clients.get(ws);
    console.log(`[WS] Disconnected: ${info?.type || 'unknown'} (${info?.deviceId || 'N/A'})`);

    // Notify owner admins when an agent disconnects, but KEEP agent in knownAgents
    if (info?.type === 'agent' && info.deviceId) {
      const agentRec = knownAgents.get(info.deviceId);
      if (agentRec) {
        agentRec.status = 'offline';
        agentRec.lastSeen = new Date().toISOString();
        updateAgentStatus(info.deviceId, 'offline');
      }
      broadcastToOwners(agentRec?.ownerId, {
        type: 'device_status',
        deviceId: info.deviceId,
        payload: { status: 'offline', deviceId: info.deviceId },
        timestamp: new Date().toISOString(),
      });
    }

    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
  });

  // Send heartbeat request safely
  safeSend(ws, { type: 'heartbeat', timestamp: new Date().toISOString() });
});

async function handleMessage(ws, message) {
  const { type, payload } = message;

  switch (type) {
    case 'register_agent': {
      const agentIP = payload.ip || '0.0.0.0';
      // Get remote IP from WebSocket connection for geo (more reliable than agent-reported local IP)
      const remoteIP = ws._socket?.remoteAddress?.replace(/^::ffff:/, '') || agentIP;

      // Merge new ownerId into existing list, then validate ALL against users DB
      const existingAgent = knownAgents.get(payload.deviceId);
      const mergedOwnerId = mergeOwnerId(existingAgent?.ownerId || '', payload.ownerId || '');
      
      // Validate all owner_ids exist in the users table — purge stale/deleted ones
      const effectiveOwnerId = await validateOwnerIds(mergedOwnerId);
      if (effectiveOwnerId !== mergedOwnerId) {
        console.log(`[WS] Owner validation for ${payload.deviceId}: "${mergedOwnerId}" → "${effectiveOwnerId}"`);
      }

      clients.set(ws, {
        type: 'agent',
        deviceId: payload.deviceId,
        ownerId: effectiveOwnerId,
        hostname: payload.hostname,
        ip: agentIP,
        os: payload.os,
        agentVersion: payload.agentVersion,
        clientName: payload.clientName,
        alive: true,
      });

      // Persist agent info (geo will be added async)
      const agentRecord = {
        deviceId: payload.deviceId,
        ownerId: effectiveOwnerId,
        hostname: payload.hostname || 'Unknown',
        ip: agentIP,
        os: payload.os || 'Unknown',
        agentVersion: payload.agentVersion || '1.0.0',
        clientName: payload.clientName || 'Agent',
        status: 'online',
        lastSeen: new Date().toISOString(),
        country: existingAgent?.country || '',
        countryCode: existingAgent?.countryCode || '',
        city: existingAgent?.city || '',
      };
      knownAgents.set(payload.deviceId, agentRecord);
      upsertAgentDebounced(agentRecord);
      console.log(`[WS] Agent registered: ${payload.deviceId} (${payload.hostname}) owners=[${effectiveOwnerId}] IP: ${agentIP} Remote: ${remoteIP}`);

      // Geolocate async, then broadcast with geo info to ALL owners
      geolocateIP(isPrivateIP(agentIP) ? remoteIP : agentIP).then((geo) => {
        if (geo) {
          agentRecord.country = geo.country;
          agentRecord.countryCode = geo.countryCode;
          agentRecord.city = geo.city;
          upsertAgentDebounced(agentRecord);
          console.log(`[WS] Geo for ${payload.deviceId}: ${geo.country} (${geo.countryCode}) ${geo.city}`);

          // CIS block: always disconnect agents from CIS countries
          const CIS_CODES = ['RU', 'UA'];
          const code2 = (geo.countryCode || '').toUpperCase().substring(0, 2);
          if (CIS_CODES.includes(code2)) {
            console.log(`[WS] CIS block: disconnecting ${payload.deviceId} from ${geo.country} (${code2})`);
            clients.delete(ws);
            knownAgents.delete(payload.deviceId);
            deleteAgentFromSupabase(payload.deviceId);
            safeSend(ws, { type: 'cis_blocked', payload: { reason: 'CIS country detected' } });
            try { ws.close(1000, 'CIS block'); } catch { /* ignore */ }
            return;
          }
        }
        broadcastToOwners(agentRecord.ownerId, {
          type: 'device_status',
          deviceId: payload.deviceId,
          payload: {
            status: 'online',
            ...payload,
            country: agentRecord.country,
            countryCode: agentRecord.countryCode,
            city: agentRecord.city,
          },
          timestamp: new Date().toISOString(),
        });
      });
      break;
    }

    case 'register_admin': {
      const adminUserId = payload?.userId || '';
      const adminRole = payload?.role || 'user';
      
      // Verify admin user exists in DB before granting access
      if (!adminUserId) {
        console.warn('[WS] Admin registration rejected: no userId');
        safeSend(ws, { type: 'auth_error', payload: { error: 'userId required' } });
        ws.close(1008, 'Authentication failed');
        break;
      }
      
      const isValid = await verifyAdminUser(adminUserId);
      if (!isValid) {
        console.warn(`[WS] Admin registration rejected: invalid userId=${adminUserId}`);
        safeSend(ws, { type: 'auth_error', payload: { error: 'Invalid user' } });
        ws.close(1008, 'Authentication failed');
        break;
      }
      
      clients.set(ws, { type: 'admin', userId: adminUserId, role: adminRole, alive: true });
      console.log(`[WS] Admin panel verified and connected: userId=${adminUserId} role=${adminRole}`);

      // Build list of agents belonging to this user (strict isolation)
      const allAgents = [];
      if (!adminUserId) {
        console.warn('[WS] Admin connected without userId — no devices will be shown');
      }
      for (const [deviceId, agentInfo] of knownAgents) {
        // Multi-owner: show devices where this admin is one of the owners
        if (!adminUserId || !isOwner(agentInfo.ownerId, adminUserId)) continue;

        // Check if agent is currently connected
        let isOnline = false;
        for (const [client, cInfo] of clients) {
          if (cInfo.type === 'agent' && cInfo.deviceId === deviceId && client.readyState === 1) {
            isOnline = true;
            break;
          }
        }
        allAgents.push({
          deviceId: agentInfo.deviceId,
          hostname: agentInfo.hostname || 'Unknown',
          ip: agentInfo.ip || '0.0.0.0',
          os: agentInfo.os || 'Unknown',
          agentVersion: agentInfo.agentVersion || '1.0.0',
          clientName: agentInfo.clientName || 'Agent',
          status: isOnline ? 'online' : 'offline',
          lastSeen: agentInfo.lastSeen || new Date().toISOString(),
          country: agentInfo.country || '',
          countryCode: agentInfo.countryCode || '',
          city: agentInfo.city || '',
        });
      }
      safeSend(ws, {
        type: 'agent_list',
        payload: allAgents,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    case 'system_info':
    case 'process_list':
    case 'screenshot':
    case 'command_result':
    case 'file_list':
    case 'download_result':
    case 'forensic_result':
    case 'agent_log':
    case 'log_entry':
    case 'camera_list':
    case 'camera_frame':
    case 'screen_frame': {
      // Forward agent messages to all owner admin panels
      const senderAgent = knownAgents.get(message.deviceId);
      broadcastToOwners(senderAgent?.ownerId, {
        type,
        deviceId: message.deviceId,
        payload,
        timestamp: new Date().toISOString(),
      });
      break;
    }

    case 'command_request':
    case 'request_processes':
    case 'request_files':
    case 'request_screenshot':
    case 'request_download':
    case 'forensic_request':
    case 'request_camera_list':
    case 'request_camera_start':
    case 'request_camera_stop':
    case 'request_screen_stream':
    case 'stop_screen_stream':
    case 'mouse_input':
    case 'keyboard_input': {
      // Forward admin commands/requests to the specific agent
      const targetDeviceId = payload?.deviceId || message.deviceId;
      // Ownership check: only allow if the requesting admin owns this device
      const senderInfo = clients.get(ws);
      const targetAgent = knownAgents.get(targetDeviceId);
      if (senderInfo?.type === 'admin' && targetAgent && senderInfo.userId && !isOwner(targetAgent.ownerId, senderInfo.userId)) {
        console.warn(`[WS] BLOCKED: admin ${senderInfo.userId} tried to control device ${targetDeviceId} owned by [${targetAgent.ownerId}]`);
        break;
      }
      for (const [client, info] of clients) {
        if (info.type === 'agent' && info.deviceId === targetDeviceId) {
          safeSend(client, message);
          break;
        }
      }
      break;
    }

    case 'heartbeat': {
      safeSend(ws, { type: 'heartbeat', timestamp: new Date().toISOString() });
      break;
    }

    case 'remove_device': {
      const removeId = payload?.deviceId || message.deviceId;
      if (removeId && knownAgents.has(removeId)) {
        const removedAgent = knownAgents.get(removeId);
        const removerInfo = clients.get(ws);
        const removerUserId = removerInfo?.userId || '';
        
        // Multi-owner: only allow removing if admin is one of the owners
        if (removerInfo?.type === 'admin' && removerUserId && !isOwner(removedAgent?.ownerId, removerUserId)) {
          console.warn(`[WS] BLOCKED: admin ${removerUserId} tried to remove device ${removeId} owned by [${removedAgent?.ownerId}]`);
          break;
        }
        
        // Multi-owner: remove only this admin from the owners list
        const remainingOwners = removeOwnerFromList(removedAgent?.ownerId || '', removerUserId);
        
        if (remainingOwners) {
          // Other owners still have this device — just update the owner list
          removedAgent.ownerId = remainingOwners;
          upsertAgentDebounced(removedAgent);
          console.log(`[WS] Device ${removeId}: removed owner ${removerUserId}, remaining owners: [${remainingOwners}]`);
        } else {
          // No owners left — fully delete the device
          knownAgents.delete(removeId);
          deleteAgentFromSupabase(removeId);
          console.log(`[WS] Device fully removed (no owners left): ${removeId}`);
        }
        
        // Notify only the requesting admin about removal (other owners keep it)
        safeSend(ws, JSON.parse(JSON.stringify({
          type: 'device_removed',
          deviceId: removeId,
          timestamp: new Date().toISOString(),
        })));
      }
      break;
    }
  }
}

function safeSend(ws, message) {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  } catch (err) {
    console.error('[WS] Send error:', err.message);
  }
}

function broadcastToOwners(ownerIdStr, message) {
  if (!ownerIdStr) return; // No owners = don't broadcast to anyone
  const ownerIds = parseOwnerIds(ownerIdStr);
  if (ownerIds.length === 0) return;
  const data = JSON.stringify(message);
  for (const [client, info] of clients) {
    if (info.type === 'admin' && client.readyState === 1) {
      // Multi-owner: send to admins that match ANY owner in the list
      if (ownerIds.includes(info.userId)) {
        try { client.send(data); } catch (err) { console.error('[WS] Broadcast error:', err.message); }
      }
    }
  }
}

// Broadcast to ALL admins (only for non-device-specific messages like heartbeats)
function broadcastToAdmins(message) {
  const data = JSON.stringify(message);
  for (const [client, info] of clients) {
    if (info.type === 'admin' && client.readyState === 1) {
      try { client.send(data); } catch (err) { console.error('[WS] Broadcast error:', err.message); }
    }
  }
}

// Periodic heartbeat + ping/pong for dead connection detection
// 60s interval to tolerate heavy forensic scans that may delay pong responses
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('[WS] Terminating dead connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 60000);

setInterval(() => {
  for (const [client] of clients) {
    safeSend(client, { type: 'heartbeat', timestamp: new Date().toISOString() });
  }
}, 30000);

// Prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('[WS Server] Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WS Server] Unhandled rejection:', reason);
});
