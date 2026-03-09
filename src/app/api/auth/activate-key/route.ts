import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Недействительный токен' }, { status: 401 });
  }

  try {
    const { key } = await request.json();
    const normalizedKey = key?.replace(/\s+/g, '').trim().toUpperCase();

    if (!normalizedKey) {
      return NextResponse.json({ error: 'Ключ обязателен' }, { status: 400 });
    }

    // Verify key exists in DB
    const { data: keyData, error: keyError } = await supabase
      .from('license_keys')
      .select('id, key_id, type, plan, expires_at, activated, activated_by, hwid')
      .eq('key', normalizedKey)
      .single();

    if (keyError || !keyData) {
      return NextResponse.json({ error: 'Недействительный ключ' }, { status: 400 });
    }

    const expiresAt = new Date(keyData.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ error: 'Срок действия ключа истёк' }, { status: 400 });
    }

    // Link key to user
    await supabase
      .from('users')
      .update({ license_key_id: keyData.id })
      .eq('id', payload.userId);

    // Mark key as activated if not already
    if (!keyData.activated) {
      await supabase
        .from('license_keys')
        .update({
          activated: true,
          activated_by: payload.username,
          activated_at: new Date().toISOString(),
        })
        .eq('id', keyData.id);
    }

    const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));

    return NextResponse.json({
      success: true,
      expiresAt: keyData.expires_at,
      daysLeft,
      plan: keyData.plan,
    });
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
