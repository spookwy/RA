import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== Database Types ====================

export interface DbLicenseKey {
  id: string;
  key: string;              // full VI-XXXX-XXXX-XXXX-XXXX key string
  key_id: string;           // unique key id from payload
  type: 'admin' | 'user';
  plan: 'trial' | 'basic' | 'pro' | 'enterprise';
  max_devices: number;
  duration_days: number;
  owner: string;
  expires_at: string;       // ISO date
  created_at: string;       // ISO date
  activated: boolean;       // whether someone has activated this key
  activated_by: string | null;  // nickname of who activated
  activated_at: string | null;  // when activated
  hwid: string | null;      // hardware ID of the machine that activated
}

export interface DbUser {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'viewer';
  license_key_id: string | null;  // FK to license_keys.id
  hwid: string | null;
  created_at: string;
  last_login: string | null;
}
