import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Недействительный токен' }, { status: 401 });
  }

  // Fetch real data from DB
  let registeredAt = new Date().toISOString();
  let subscriptionExpires = '2099-12-31T00:00:00Z';

  const { data: userData } = await supabase
    .from('users')
    .select('created_at, license_key_id')
    .eq('id', payload.userId)
    .single();

  if (userData) {
    registeredAt = userData.created_at;
    if (userData.license_key_id) {
      const { data: keyData } = await supabase
        .from('license_keys')
        .select('expires_at')
        .eq('id', userData.license_key_id)
        .single();
      if (keyData?.expires_at) {
        subscriptionExpires = keyData.expires_at;
      }
    }
  }

  return NextResponse.json({
    user: {
      id: payload.userId,
      username: payload.username,
      role: payload.role,
      registeredAt,
      subscriptionExpires,
      email: payload.username + '@corp.local',
    },
  });
}
