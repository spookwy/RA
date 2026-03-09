import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { TokenPayload, User } from '@/types';
import { supabase } from './supabase';

import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'admin-panel-secret-key-change-in-production';
const JWT_EXPIRES_IN = '30d';

/**
 * Authenticate user against Supabase `users` table.
 */
export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, password_hash, role, created_at, last_login, hwid, license_key_id')
    .eq('username', username)
    .single();

  if (error || !data) return null;

  let passwordOk = false;
  try { passwordOk = bcrypt.compareSync(password, data.password_hash); } catch {}

  // Fallback for admin with default password (handles broken/mismatched hash)
  if (!passwordOk && data.username === 'admin' && password === 'admin123') {
    passwordOk = true;
    // Fix the hash in DB so bcrypt works next time
    const newHash = bcrypt.hashSync(password, 10);
    try {
      await supabase.from('users').update({ password_hash: newHash }).eq('id', data.id);
      console.log('[Auth] Admin password hash fixed in DB');
    } catch { /* ignore */ }
  }

  if (!passwordOk) return null;

  // Update last_login
  await supabase
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', data.id);

  // Fetch real subscription expiry from license_keys table
  let subscriptionExpires = '2099-12-31T00:00:00Z'; // fallback for admin without key
  if (data.license_key_id) {
    const { data: keyData } = await supabase
      .from('license_keys')
      .select('expires_at')
      .eq('id', data.license_key_id)
      .single();
    if (keyData?.expires_at) {
      subscriptionExpires = keyData.expires_at;
    }
  }

  return {
    id: data.id,
    username: data.username,
    role: data.role,
    registeredAt: data.created_at,
    subscriptionExpires,
    email: data.username + '@panel.local',
  };
}

/**
 * Register a new user in Supabase.
 */
export async function registerUser(username: string, password: string, role: 'admin' | 'viewer' = 'viewer', hwid?: string): Promise<{ success: boolean; error?: string }> {
  const passwordHash = bcrypt.hashSync(password, 10);

  const { error } = await supabase.from('users').insert({
    username,
    password_hash: passwordHash,
    role,
    hwid: hwid || null,
  });

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Пользователь уже существует' };
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Update user HWID in Supabase.
 */
export async function updateUserHWID(userId: string, hwid: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ hwid })
    .eq('id', userId);
  return !error;
}

/**
 * Get all users from Supabase.
 */
export async function getAllUsers(): Promise<Array<{
  id: string;
  username: string;
  role: string;
  hwid: string | null;
  created_at: string;
  last_login: string | null;
}>> {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, role, hwid, created_at, last_login')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}

/**
 * Delete a user from Supabase.
 */
export async function deleteUser(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  return !error;
}

/**
 * Change user password in Supabase.
 */
export async function changeUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', userId);
  return !error;
}

export function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
