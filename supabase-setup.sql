-- ==========================================
-- VisualIllusion — Supabase Database Setup
-- Run this in the Supabase Dashboard SQL Editor
-- Безопасно перезапускать — все IF NOT EXISTS
-- ==========================================

-- 1. License Keys table
CREATE TABLE IF NOT EXISTS license_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  key_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('admin', 'user')),
  plan TEXT NOT NULL CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise')),
  max_devices INT NOT NULL DEFAULT 10,
  duration_days INT NOT NULL DEFAULT 30,
  owner TEXT NOT NULL DEFAULT 'user',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated BOOLEAN DEFAULT FALSE,
  activated_by TEXT,
  activated_at TIMESTAMPTZ,
  hwid TEXT
);

-- 2. Users table (panel users, not agents)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  license_key_id UUID REFERENCES license_keys(id),
  hwid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- 3. Devices table (agents stored per-user in Supabase)
-- owner_id: comma-separated list of user UUIDs from the users table
-- The WS server validates owner_ids against the users table and purges stale ones
-- If a user is deleted and recreated, their old UUID will be automatically cleaned
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT '',
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

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_license_keys_key ON license_keys(key);
CREATE INDEX IF NOT EXISTS idx_license_keys_key_id ON license_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_activated ON license_keys(activated);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_hwid ON users(hwid);
CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_id);

-- 5. Enable RLS
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (drop+create to avoid "already exists" errors)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow all on license_keys" ON license_keys;
  DROP POLICY IF EXISTS "Allow all on users" ON users;
  DROP POLICY IF EXISTS "Allow all on devices" ON devices;
END $$;

CREATE POLICY "Allow all on license_keys" ON license_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on devices" ON devices FOR ALL USING (true) WITH CHECK (true);

-- 7. Default admin user (password: admin123)
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2b$10$kiRo9LYKFaHdx1ISNcZUwuPlja.kUFnXHeLNI78ssau65CnmwkuSa', 'admin')
ON CONFLICT (username) DO NOTHING;

-- 8. App Updates table (auto-update system)
CREATE TABLE IF NOT EXISTS app_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,          -- semver: "1.0.1"
  download_url TEXT NOT NULL,            -- direct download link to update .tar
  file_size BIGINT DEFAULT 0,           -- bytes
  sha256 TEXT DEFAULT '',               -- hash for integrity verification
  changelog TEXT DEFAULT '',            -- what changed (shown to user)
  published_at TIMESTAMPTZ DEFAULT NOW(),
  published_by TEXT DEFAULT 'admin'
);

-- RLS for app_updates
ALTER TABLE app_updates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow all on app_updates" ON app_updates;
END $$;
CREATE POLICY "Allow all on app_updates" ON app_updates FOR ALL USING (true) WITH CHECK (true);

-- 9. File storage moved to Cloudflare R2 (no Supabase Storage needed)
-- See .env.local for R2 credentials
