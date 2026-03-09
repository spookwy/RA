import crypto from 'crypto';
import { supabase } from './supabase';

// ==================== License Key System ====================
// Keys are simple random tokens in format VI-XXXX-XXXX-XXXX-XXXX
// All verification is done against Supabase DB.
// No HMAC signatures — the DB is the source of truth.

export type LicenseType = 'admin' | 'user';
export type LicensePlan = 'trial' | 'basic' | 'pro' | 'enterprise';

export interface LicenseInfo {
  id: string;
  type: LicenseType;
  plan: LicensePlan;
  maxDevices: number;
  expiresAt: string;
  createdAt: string;
  owner: string;
  valid: boolean;
  expired: boolean;
  daysLeft: number;
}

// ---- Key format helpers ----

/** Generate a random 4-char hex block (uppercase) */
function randomBlock(): string {
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

/** Generate a key in format VI-XXXX-XXXX-XXXX-XXXX */
function generateKeyString(): string {
  return `VI-${randomBlock()}-${randomBlock()}-${randomBlock()}-${randomBlock()}`;
}

/** Normalize a key: trim, remove spaces, uppercase */
export function normalizeLicenseKey(rawKey: string): string {
  if (!rawKey) return '';
  return String(rawKey).replace(/\s+/g, '').trim().toUpperCase();
}

/** Check if a key has valid VI-XXXX-XXXX-XXXX-XXXX format */
export function isValidKeyFormat(key: string): boolean {
  const k = normalizeLicenseKey(key);
  return /^VI-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(k);
}

/**
 * Generate a license key and store it in Supabase.
 */
export async function generateLicenseKey(opts: {
  type: LicenseType;
  plan: LicensePlan;
  maxDevices: number;
  durationDays: number;
  owner: string;
}): Promise<string> {
  const now = new Date();
  const expires = new Date(now.getTime() + opts.durationDays * 24 * 60 * 60 * 1000);
  const keyId = crypto.randomBytes(8).toString('hex').toUpperCase();
  const key = generateKeyString();

  const { error } = await supabase.from('license_keys').insert({
    key,
    key_id: keyId,
    type: opts.type,
    plan: opts.plan,
    max_devices: opts.maxDevices,
    duration_days: opts.durationDays,
    owner: opts.owner,
    expires_at: expires.toISOString(),
    created_at: now.toISOString(),
    activated: false,
  });

  if (error) {
    console.error('[License] Supabase insert error:', error.message);
    throw new Error('Ошибка сохранения ключа в БД');
  }

  return key;
}

/**
 * Verify a license key by checking Supabase DB.
 * Returns null if key not found.
 */
export async function verifyLicenseKey(key: string): Promise<LicenseInfo | null> {
  try {
    const normalizedKey = normalizeLicenseKey(key);
    if (!normalizedKey) return null;

    const { data, error } = await supabase
      .from('license_keys')
      .select('key_id, type, plan, max_devices, expires_at, created_at, owner')
      .eq('key', normalizedKey)
      .single();

    if (error || !data) return null;

    const expiresAt = new Date(data.expires_at);
    const now = new Date();
    const expired = now > expiresAt;
    const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    return {
      id: data.key_id,
      type: (data.type as LicenseType) || 'user',
      plan: (data.plan as LicensePlan) || 'basic',
      maxDevices: data.max_devices || 1,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
      owner: data.owner || '',
      valid: !expired,
      expired,
      daysLeft,
    };
  } catch {
    return null;
  }
}

/**
 * Activate a key in Supabase — mark as activated with nickname + HWID.
 */
export async function activateKeyInDB(key: string, nickname: string, hwid?: string): Promise<boolean> {
  const normalizedKey = normalizeLicenseKey(key);
  const { error } = await supabase
    .from('license_keys')
    .update({
      activated: true,
      activated_by: nickname,
      activated_at: new Date().toISOString(),
      hwid: hwid || null,
    })
    .eq('key', normalizedKey);

  if (error) {
    console.error('[License] Supabase activate error:', error.message);
    return false;
  }
  return true;
}

/**
 * Check if a key exists in Supabase and if it's already activated.
 */
export async function checkKeyInDB(key: string): Promise<{
  exists: boolean;
  activated: boolean;
  hwid: string | null;
  activated_by: string | null;
} | null> {
  const normalizedKey = normalizeLicenseKey(key);
  const { data, error } = await supabase
    .from('license_keys')
    .select('activated, hwid, activated_by')
    .eq('key', normalizedKey)
    .single();

  if (error || !data) return null;
  return {
    exists: true,
    activated: data.activated,
    hwid: data.hwid,
    activated_by: data.activated_by,
  };
}

/**
 * Get all keys from Supabase.
 */
export async function getAllKeysFromDB(): Promise<Array<{
  id: string;
  key: string;
  key_id: string;
  type: string;
  plan: string;
  max_devices: number;
  duration_days: number;
  owner: string;
  expires_at: string;
  created_at: string;
  activated: boolean;
  activated_by: string | null;
  activated_at: string | null;
  hwid: string | null;
}>> {
  const { data, error } = await supabase
    .from('license_keys')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[License] Supabase fetch error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Delete a key from Supabase.
 */
export async function deleteKeyFromDB(keyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('license_keys')
    .delete()
    .eq('key_id', keyId);

  if (error) {
    console.error('[License] Supabase delete error:', error.message);
    return false;
  }
  return true;
}

/**
 * Deactivate a key in Supabase — reset activation fields.
 */
export async function deactivateKeyInDB(keyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('license_keys')
    .update({
      activated: false,
      activated_by: null,
      activated_at: null,
      hwid: null,
    })
    .eq('key_id', keyId);

  if (error) {
    console.error('[License] Supabase deactivate error:', error.message);
    return false;
  }
  return true;
}

/**
 * Plan display names and defaults.
 */
export const PLAN_DETAILS: Record<LicensePlan, { label: string; defaultMaxDevices: number; defaultDays: number }> = {
  trial:      { label: 'Пробный',       defaultMaxDevices: 3,   defaultDays: 7 },
  basic:      { label: 'Базовый',       defaultMaxDevices: 10,  defaultDays: 30 },
  pro:        { label: 'Профессионал',   defaultMaxDevices: 50,  defaultDays: 30 },
  enterprise: { label: 'Предприятие',    defaultMaxDevices: 500, defaultDays: 365 },
};
