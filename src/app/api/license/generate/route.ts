import { NextRequest, NextResponse } from 'next/server';
import { verifyLicenseKey, generateLicenseKey, getAllKeysFromDB, deleteKeyFromDB, deactivateKeyInDB } from '@/lib/license';
import type { LicenseType, LicensePlan } from '@/lib/license';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { cookies } from 'next/headers';

const LICENSE_FILE = join(process.cwd(), '.license');

/** Check if request is from an admin (via .license file or cookie fallback) */
async function isAdminRequest(): Promise<boolean> {
  // Primary: check .license file — verify against DB
  if (existsSync(LICENSE_FILE)) {
    const currentKey = readFileSync(LICENSE_FILE, 'utf-8').trim();
    if (currentKey) {
      const currentLicense = await verifyLicenseKey(currentKey);
      if (currentLicense && !currentLicense.expired && currentLicense.type === 'admin') {
        return true;
      }
    }
  }
  // Fallback: check cookie (set by launcher on login)
  const cookieStore = await cookies();
  const licenseType = cookieStore.get('license_type')?.value;
  return licenseType === 'admin';
}

/**
 * POST /api/license/generate — generate a new license key (admin only)
 * Body: { type, plan, maxDevices, durationDays, owner }
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Генерация ключей доступна только для администраторов' }, { status: 403 });
    }

    const { type, plan, maxDevices, durationDays, owner } = await req.json();

    // Validate inputs
    if (!['admin', 'user'].includes(type)) {
      return NextResponse.json({ error: 'Некорректный тип лицензии' }, { status: 400 });
    }
    if (!['trial', 'basic', 'pro', 'enterprise'].includes(plan)) {
      return NextResponse.json({ error: 'Некорректный план' }, { status: 400 });
    }
    if (!maxDevices || maxDevices < 1 || maxDevices > 10000) {
      return NextResponse.json({ error: 'Кол-во устройств: 1–10000' }, { status: 400 });
    }
    if (!durationDays || durationDays < 1 || durationDays > 3650) {
      return NextResponse.json({ error: 'Срок: 1–3650 дней' }, { status: 400 });
    }

    const key = await generateLicenseKey({
      type: type as LicenseType,
      plan: plan as LicensePlan,
      maxDevices: Number(maxDevices),
      durationDays: Number(durationDays),
      owner: String(owner || 'user').substring(0, 64),
    });

    return NextResponse.json({ key });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка генерации ключа';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/license/generate — get all keys from Supabase
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }

    const keys = await getAllKeysFromDB();
    return NextResponse.json({ keys });
  } catch {
    return NextResponse.json({ error: 'Ошибка получения ключей' }, { status: 500 });
  }
}

/**
 * DELETE /api/license/generate — delete a key from Supabase
 * Body: { keyId }
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }

    const { keyId } = await req.json();
    if (!keyId) {
      return NextResponse.json({ error: 'keyId обязателен' }, { status: 400 });
    }

    const ok = await deleteKeyFromDB(keyId);
    if (!ok) {
      return NextResponse.json({ error: 'Ошибка удаления' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Ошибка удаления ключа' }, { status: 500 });
  }
}

/**
 * PATCH /api/license/generate — deactivate a key in Supabase
 * Body: { keyId }
 */
export async function PATCH(req: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }

    const { keyId } = await req.json();
    if (!keyId) {
      return NextResponse.json({ error: 'keyId обязателен' }, { status: 400 });
    }

    const ok = await deactivateKeyInDB(keyId);
    if (!ok) {
      return NextResponse.json({ error: 'Ошибка деактивации' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Ошибка деактивации ключа' }, { status: 500 });
  }
}
