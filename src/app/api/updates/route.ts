import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { cookies } from 'next/headers';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { verifyLicenseKey } from '@/lib/license';

const LICENSE_FILE = join(process.cwd(), '.license');

async function isAdminRequest(): Promise<boolean> {
  if (existsSync(LICENSE_FILE)) {
    const currentKey = readFileSync(LICENSE_FILE, 'utf-8').trim();
    if (currentKey) {
      const currentLicense = await verifyLicenseKey(currentKey);
      if (currentLicense && !currentLicense.expired && currentLicense.type === 'admin') {
        return true;
      }
    }
  }
  const cookieStore = await cookies();
  const licenseType = cookieStore.get('license_type')?.value;
  return licenseType === 'admin';
}

/**
 * GET /api/updates — list all updates
 */
export async function GET() {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('app_updates')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ updates: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/updates — publish a new update
 * Body: { version, download_url, file_size?, sha256?, changelog? }
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }

    const body = await req.json();
    const { version, download_url, file_size, sha256, changelog } = body;

    if (!version || !version.trim()) {
      return NextResponse.json({ error: 'Версия обязательна' }, { status: 400 });
    }
    if (!download_url || !download_url.trim()) {
      return NextResponse.json({ error: 'Ссылка на файл обязательна' }, { status: 400 });
    }

    // Check if version already exists
    const { data: existing } = await supabase
      .from('app_updates')
      .select('id')
      .eq('version', version.trim())
      .maybeSingle();

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from('app_updates')
        .update({
          download_url: download_url.trim(),
          file_size: file_size ? Number(file_size) : null,
          sha256: sha256?.trim() || null,
          changelog: changelog?.trim() || null,
          published_at: new Date().toISOString(),
        })
        .eq('version', version.trim())
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, update: data, updated: true });
    }

    // Insert new
    const { data, error } = await supabase
      .from('app_updates')
      .insert({
        version: version.trim(),
        download_url: download_url.trim(),
        file_size: file_size ? Number(file_size) : null,
        sha256: sha256?.trim() || null,
        changelog: changelog?.trim() || null,
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, update: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE /api/updates — remove an update record
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'ID обязателен' }, { status: 400 });
    }

    const { error } = await supabase
      .from('app_updates')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
