import { NextRequest, NextResponse } from 'next/server';
import { verifyLicenseKey, activateKeyInDB, checkKeyInDB } from '@/lib/license';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';
import crypto from 'crypto';

const LICENSE_FILE = join(process.cwd(), '.license');
const NICKNAME_FILE = join(process.cwd(), '.nickname');

const COOKIE_OPTS = {
  httpOnly: false as const,   // readable from client-side JS for UI display
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 365 * 24 * 60 * 60,
};

function getLocalHWID(): string {
  const cpus = os.cpus();
  const raw = `${os.hostname()}-${cpus[0]?.model || ''}-${os.totalmem()}-${os.platform()}`;
  return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16).toUpperCase();
}

/**
 * POST /api/license/activate — activate with key + nickname
 * Body: { key: string, nickname: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { key, nickname } = await req.json();

    if (!nickname || typeof nickname !== 'string' || nickname.trim().length < 1) {
      return NextResponse.json({ error: 'Введите никнейм' }, { status: 400 });
    }
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Введите лицензионный ключ' }, { status: 400 });
    }

    const info = await verifyLicenseKey(key.trim());
    if (!info) {
      return NextResponse.json({ error: 'Недействительный ключ' }, { status: 400 });
    }
    if (info.expired) {
      return NextResponse.json({ error: 'Срок действия ключа истек' }, { status: 400 });
    }

    // Check key in Supabase
    const dbCheck = await checkKeyInDB(key.trim());
    if (!dbCheck || !dbCheck.exists) {
      return NextResponse.json({ error: 'Ключ не найден в базе данных' }, { status: 400 });
    }

    const hwid = getLocalHWID();

    // If already activated by another machine, block
    if (dbCheck.activated && dbCheck.hwid && dbCheck.hwid !== hwid) {
      return NextResponse.json({ error: `Ключ уже активирован пользователем: ${dbCheck.activated_by || 'unknown'}` }, { status: 400 });
    }

    // Mark as activated in Supabase
    await activateKeyInDB(key.trim(), nickname.trim(), hwid);

    // Save to disk (for local verification)
    writeFileSync(LICENSE_FILE, key.trim(), 'utf-8');
    writeFileSync(NICKNAME_FILE, nickname.trim(), 'utf-8');

    const res = NextResponse.json({
      success: true,
      license: {
        type: info.type,
        plan: info.plan,
        maxDevices: info.maxDevices,
        expiresAt: info.expiresAt,
        daysLeft: info.daysLeft,
      },
      nickname: nickname.trim(),
    });

    // Set cookies for middleware + client UI
    res.cookies.set('license_active', '1', { ...COOKIE_OPTS, httpOnly: true });
    res.cookies.set('license_nick', nickname.trim(), COOKIE_OPTS);
    res.cookies.set('license_type', info.type, COOKIE_OPTS);
    res.cookies.set('license_plan', info.plan, COOKIE_OPTS);
    res.cookies.set('license_expires', info.expiresAt, COOKIE_OPTS);
    res.cookies.set('license_days', String(info.daysLeft), COOKIE_OPTS);

    return res;
  } catch {
    return NextResponse.json({ error: 'Ошибка активации' }, { status: 500 });
  }
}

/**
 * GET /api/license/activate — check current license status
 */
export async function GET() {
  try {
    if (!existsSync(LICENSE_FILE)) {
      return NextResponse.json({ activated: false });
    }

    const key = readFileSync(LICENSE_FILE, 'utf-8').trim();
    const info = await verifyLicenseKey(key);

    if (!info || info.expired) {
      return NextResponse.json({ activated: false, expired: info?.expired || false });
    }

    const nickname = existsSync(NICKNAME_FILE)
      ? readFileSync(NICKNAME_FILE, 'utf-8').trim()
      : 'Admin';

    const res = NextResponse.json({
      activated: true,
      license: {
        type: info.type,
        plan: info.plan,
        maxDevices: info.maxDevices,
        expiresAt: info.expiresAt,
        daysLeft: info.daysLeft,
      },
      nickname,
    });

    // Re-set cookies
    res.cookies.set('license_active', '1', { ...COOKIE_OPTS, httpOnly: true });
    res.cookies.set('license_nick', nickname, COOKIE_OPTS);
    res.cookies.set('license_type', info.type, COOKIE_OPTS);
    res.cookies.set('license_plan', info.plan, COOKIE_OPTS);
    res.cookies.set('license_expires', info.expiresAt, COOKIE_OPTS);
    res.cookies.set('license_days', String(info.daysLeft), COOKIE_OPTS);

    return res;
  } catch {
    return NextResponse.json({ activated: false });
  }
}
