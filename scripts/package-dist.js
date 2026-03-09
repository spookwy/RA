/**
 * Package Distribution — собирает всё необходимое для запуска на новом ПК
 *
 * Создаёт папку dist/VisualIllusion/ со всеми файлами:
 *   - VisualIllusion.exe (лаунчер)
 *   - .next/standalone/ (Next.js сервер + статика + public + .env.local)
 *   - server/ws-server.js (WebSocket сервер)
 *   - node_modules/ws/ (зависимость для WS сервера)
 *   - .env.local (конфигурация)
 *
 * Использование:
 *   node scripts/package-dist.js
 *   npm run package          (build + exe + package)
 *   npm run package:dist     (только упаковка, без пересборки)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Auto-pick dist folder: use 'VisualIllusion' if available, otherwise 'VisualIllusion_new'
let distName = 'VisualIllusion';
try {
  const testPath = path.join(ROOT, 'dist', distName);
  if (fs.existsSync(testPath)) {
    fs.rmSync(testPath, { recursive: true, force: true });
  }
} catch {
  distName = 'VisualIllusion_new';
}
const DIST = path.join(ROOT, 'dist', distName);
const EXE_NAME = 'VisualIllusion.exe';

// ---- Utilities ----
function copyFileSync(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`  ⚠ Пропуск: ${path.relative(ROOT, src)} (не найден)`);
    return false;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
  return true;
}

function rmDirSync(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      // If locked, try renaming to a temp name and create fresh dir
      const tmp = dir + '_old_' + Date.now();
      try {
        fs.renameSync(dir, tmp);
        console.log(`  ⚠ Папка была заблокирована, переименована в ${path.basename(tmp)}`);
        // Try to delete in background
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
      } catch {
        // Can't rename either — just warn and continue
        console.log(`  ⚠ Не удалось очистить ${path.basename(dir)} — создаём новую`);
      }
    }
  }
}

function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      size += getDirSize(p);
    } else {
      size += fs.statSync(p).size;
    }
  }
  return size;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---- Pre-flight checks ----
function preflight() {
  const errors = [];

  const exePath = path.join(ROOT, EXE_NAME);
  if (!fs.existsSync(exePath)) {
    errors.push(`${EXE_NAME} не найден. Сначала выполните: npm run build:exe`);
  }

  const standalonePath = path.join(ROOT, '.next2', 'standalone', 'server.js');
  const standalonePathAlt = path.join(ROOT, '.next', 'standalone', 'server.js');
  if (!fs.existsSync(standalonePath) && !fs.existsSync(standalonePathAlt)) {
    errors.push('.next/standalone/server.js не найден. Сначала выполните: npm run build');
  }

  const wsServerPath = path.join(ROOT, 'server', 'ws-server.js');
  if (!fs.existsSync(wsServerPath)) {
    errors.push('server/ws-server.js не найден');
  }

  const wsModulePath = path.join(ROOT, 'node_modules', 'ws');
  if (!fs.existsSync(wsModulePath)) {
    errors.push('node_modules/ws не найден. Выполните: npm install');
  }

  if (errors.length > 0) {
    console.error('\n❌ Ошибки перед упаковкой:\n');
    errors.forEach(e => console.error(`   • ${e}`));
    console.error('');
    process.exit(1);
  }
}

// ---- Main packaging ----
function packageDist() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Remote Admin — Сборка дистрибутива        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Step 0: Pre-flight checks
  console.log('[1/6] Проверка файлов...');
  preflight();
  console.log('  ✓ Все файлы на месте');

  // Step 1: Clean dist folder
  console.log('[2/6] Очистка dist/...');
  rmDirSync(DIST);
  fs.mkdirSync(DIST, { recursive: true });
  console.log('  ✓ Папка dist/VisualIllusion/ очищена');

  // Step 2: Copy RemoteAdmin.exe
  console.log('[3/6] Копирование VisualIllusion.exe...');
  const exeSrc = path.join(ROOT, EXE_NAME);
  const exeDest = path.join(DIST, EXE_NAME);
  copyFileSync(exeSrc, exeDest);
  const exeSize = fs.statSync(exeDest).size;
  console.log(`  ✓ ${EXE_NAME} (${formatSize(exeSize)})`);

  // Step 3: Copy .next/standalone/ (includes static, public, .env.local from postbuild)
  console.log('[4/6] Копирование .next/standalone/...');
  // Prefer .next2 (alternate distDir) over .next
  const nextDir = fs.existsSync(path.join(ROOT, '.next2', 'standalone', 'server.js')) ? '.next2' : '.next';
  const standaloneSrc = path.join(ROOT, nextDir, 'standalone');
  const standaloneDest = path.join(DIST, '.next', 'standalone');
  copyDirSync(standaloneSrc, standaloneDest);

  // Ensure static files are in standalone (in case postbuild didn't run)
  const staticSrc = path.join(ROOT, nextDir, 'static');
  const staticDest = path.join(standaloneDest, '.next', 'static');
  if (fs.existsSync(staticSrc) && !fs.existsSync(staticDest)) {
    console.log('  → Копирование .next/static в standalone...');
    copyDirSync(staticSrc, staticDest);
  }

  // Ensure public is in standalone
  const publicSrc = path.join(ROOT, 'public');
  const publicDest = path.join(standaloneDest, 'public');
  if (fs.existsSync(publicSrc) && !fs.existsSync(publicDest)) {
    console.log('  → Копирование public/ в standalone...');
    copyDirSync(publicSrc, publicDest);
  }

  // Ensure .env.local is in standalone
  const envSrc = path.join(ROOT, '.env.local');
  const envStandaloneDest = path.join(standaloneDest, '.env.local');
  if (fs.existsSync(envSrc) && !fs.existsSync(envStandaloneDest)) {
    copyFileSync(envSrc, envStandaloneDest);
  }

  const standaloneSize = getDirSize(standaloneDest);
  console.log(`  ✓ .next/standalone/ (${formatSize(standaloneSize)})`);

  // Step 4: Copy server/ws-server.js
  console.log('[5/6] Копирование server/ws-server.js...');
  const wsSrc = path.join(ROOT, 'server', 'ws-server.js');
  const wsDest = path.join(DIST, 'server', 'ws-server.js');
  copyFileSync(wsSrc, wsDest);

  // Also copy client-template.js if it exists (for client builder)
  const clientTplSrc = path.join(ROOT, 'server', 'client-template.js');
  if (fs.existsSync(clientTplSrc)) {
    copyFileSync(clientTplSrc, path.join(DIST, 'server', 'client-template.js'));
    console.log('  ✓ server/ws-server.js + client-template.js');
  } else {
    console.log('  ✓ server/ws-server.js');
  }

  // Step 5: Copy runtime node_modules dependencies
  console.log('[6/6] Копирование зависимостей...');

  // ws — required by ws-server.js at runtime
  const wsModuleSrc = path.join(ROOT, 'node_modules', 'ws');
  const wsModuleDest = path.join(DIST, 'node_modules', 'ws');
  copyDirSync(wsModuleSrc, wsModuleDest);
  console.log('  ✓ node_modules/ws/');

  // nat-upnp and cloudflared — used by launcher (bundled in exe, but copy for node fallback)
  const extraModules = ['nat-upnp', 'cloudflared'];
  for (const mod of extraModules) {
    const modSrc = path.join(ROOT, 'node_modules', mod);
    if (fs.existsSync(modSrc)) {
      const modDest = path.join(DIST, 'node_modules', mod);
      copyDirSync(modSrc, modDest);
      console.log(`  ✓ node_modules/${mod}/`);
      // Also copy transitive dependencies listed in its package.json
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(modSrc, 'package.json'), 'utf-8'));
        const deps = Object.keys(pkg.dependencies || {});
        for (const dep of deps) {
          const depSrc = path.join(ROOT, 'node_modules', dep);
          const depDest = path.join(DIST, 'node_modules', dep);
          if (fs.existsSync(depSrc) && !fs.existsSync(depDest)) {
            copyDirSync(depSrc, depDest);
            console.log(`    ✓ ${dep} (зависимость ${mod})`);
          }
        }
      } catch {}
    } else {
      console.log(`  ⚠ node_modules/${mod}/ не найден (туннели не будут работать без exe)`);
    }
  }

  // Copy .env.local to dist root (launcher reads it from BASE_DIR)
  if (fs.existsSync(envSrc)) {
    copyFileSync(envSrc, path.join(DIST, '.env.local'));
    console.log('  ✓ .env.local');
  }

  // @yao-pkg/pkg — needed by build-client API to compile client agents
  const pkgScopeSrc = path.join(ROOT, 'node_modules', '@yao-pkg', 'pkg');
  if (fs.existsSync(pkgScopeSrc)) {
    const pkgScopeDest = path.join(DIST, 'node_modules', '@yao-pkg', 'pkg');
    copyDirSync(pkgScopeSrc, pkgScopeDest);
    console.log('  ✓ node_modules/@yao-pkg/pkg/');
    // Copy @yao-pkg/pkg's top-level transitive deps (those not bundled inside its own node_modules)
    try {
      const pkgPkg = JSON.parse(fs.readFileSync(path.join(pkgScopeSrc, 'package.json'), 'utf-8'));
      const pkgDeps = Object.keys(pkgPkg.dependencies || {});
      for (const dep of pkgDeps) {
        // Handle scoped packages like @yao-pkg/pkg-fetch
        const depParts = dep.startsWith('@') ? dep.split('/') : [dep];
        const depSrc = path.join(ROOT, 'node_modules', ...depParts);
        const depDest = path.join(DIST, 'node_modules', ...depParts);
        // Only copy if it exists at project root and not already bundled inside @yao-pkg/pkg/node_modules
        const bundledInside = path.join(pkgScopeSrc, 'node_modules', ...depParts);
        if (fs.existsSync(depSrc) && !fs.existsSync(depDest) && !fs.existsSync(bundledInside)) {
          copyDirSync(depSrc, depDest);
          console.log(`    ✓ ${dep}`);
          // Also copy sub-deps (1 level deep)
          try {
            const subPkg = JSON.parse(fs.readFileSync(path.join(depSrc, 'package.json'), 'utf-8'));
            for (const sub of Object.keys(subPkg.dependencies || {})) {
              const subParts = sub.startsWith('@') ? sub.split('/') : [sub];
              const subSrc = path.join(ROOT, 'node_modules', ...subParts);
              const subDest = path.join(DIST, 'node_modules', ...subParts);
              if (fs.existsSync(subSrc) && !fs.existsSync(subDest)) {
                copyDirSync(subSrc, subDest);
                console.log(`      ✓ ${sub}`);
              }
            }
          } catch {}
        }
      }
    } catch {}
  } else {
    console.log('  ⚠ @yao-pkg/pkg не найден — сборка клиентов не будет работать');
  }

  // Copy downloads folder if exists (for client builder output)
  const downloadsSrc = path.join(ROOT, 'downloads');
  const downloadsDest = path.join(DIST, 'downloads');
  if (fs.existsSync(downloadsSrc)) {
    fs.mkdirSync(downloadsDest, { recursive: true });
    console.log('  ✓ downloads/ (папка для клиентов)');
  } else {
    fs.mkdirSync(downloadsDest, { recursive: true });
    console.log('  ✓ downloads/ (создана пустая)');
  }

  // Copy cloudflared.exe binary next to the exe (needed for tunnel when running from pkg)
  const cfBinSrc = path.join(ROOT, 'node_modules', 'cloudflared', 'bin', 'cloudflared.exe');
  if (fs.existsSync(cfBinSrc)) {
    copyFileSync(cfBinSrc, path.join(DIST, 'cloudflared.exe'));
    const cfSize = fs.statSync(path.join(DIST, 'cloudflared.exe')).size;
    console.log(`  ✓ cloudflared.exe (${formatSize(cfSize)}) — автотуннели`);
  } else {
    console.log('  ⚠ cloudflared.exe не найден — туннели не будут работать');
  }

  // ---- Summary ----
  const totalSize = getDirSize(DIST);
  const fileCount = countFiles(DIST);

  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  ✅ Дистрибутив собран!');
  console.log('');
  console.log(`  📁 Путь:     dist/VisualIllusion/`);
  console.log(`  📦 Размер:   ${formatSize(totalSize)}`);
  console.log(`  📄 Файлов:   ${fileCount}`);
  console.log('');
  console.log('  Для запуска на новом ПК:');
  console.log('  1. Скопируйте всю папку VisualIllusion/');
  console.log('  2. Установите Node.js (nodejs.org) или положите node.exe внутрь');
  console.log('  3. Запустите VisualIllusion.exe');
  console.log('══════════════════════════════════════════════');
  console.log('');
}

function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      count += countFiles(path.join(dir, e.name));
    } else {
      count++;
    }
  }
  return count;
}

// ---- Run ----
packageDist();
