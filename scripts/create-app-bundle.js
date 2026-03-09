/**
 * Pre-packs the app bundle into a .tar.gz archive for web-installer download.
 * Also creates an uncompressed .tar for offline/legacy mode.
 * Strips junk directories first (nested build outputs, caches, unused locales).
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const buildOutputDir = process.env.BUILD_OUTPUT_DIR || 'dist-electron-new';
const srcDir = path.join(__dirname, '..', buildOutputDir, 'win-unpacked');
const buildDir = path.join(__dirname, '..', 'build');
const tarPath = path.join(buildDir, 'app-bundle.tar');
const gzPath = path.join(buildDir, 'app-bundle.tar.gz');
const metaPath = tarPath + '.meta';
const gzMetaPath = gzPath + '.meta';

if (!fs.existsSync(srcDir)) {
  console.error('[bundle] ERROR: App build not found:', srcDir);
  process.exit(1);
}

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// ---- Strip junk before archiving ----
const junkDirs = [
  // Nested copy of dist-electron-new inside standalone output (~393MB)
  path.join(srcDir, 'resources', 'app', '.next', 'standalone', 'dist-electron-new'),
  // Nested copy inside standalone dist-installer 
  path.join(srcDir, 'resources', 'app', '.next', 'standalone', 'dist-installer'),
  // pkg cache (~41MB)
  path.join(srcDir, 'resources', 'app', '.next', 'standalone', '.pkg-cache'),
  // build artifacts inside standalone
  path.join(srcDir, 'resources', 'app', '.next', 'standalone', 'build'),
  // dist folder inside standalone
  path.join(srcDir, 'resources', 'app', '.next', 'standalone', 'dist'),
];

// Also strip any nested dist-electron-* directories (leftover from previous builds)
const standaloneDir = path.join(srcDir, 'resources', 'app', '.next', 'standalone');
if (fs.existsSync(standaloneDir)) {
  for (const entry of fs.readdirSync(standaloneDir)) {
    if (entry.startsWith('dist-electron')) {
      junkDirs.push(path.join(standaloneDir, entry));
    }
  }
}

let freedMB = 0;
for (const dir of junkDirs) {
  if (fs.existsSync(dir)) {
    const size = getDirSize(dir);
    console.log(`[bundle] Stripping ${path.relative(srcDir, dir)} (${(size / 1048576).toFixed(0)} MB)`);
    fs.rmSync(dir, { recursive: true, force: true });
    freedMB += size / 1048576;
  }
}

// Strip unused Electron locales (keep en-US + ru only)
const localesDir = path.join(srcDir, 'locales');
if (fs.existsSync(localesDir)) {
  const keepLocales = new Set(['en-US.pak', 'ru.pak']);
  let localeFreed = 0;
  for (const f of fs.readdirSync(localesDir)) {
    if (!keepLocales.has(f)) {
      const fp = path.join(localesDir, f);
      try {
        const sz = fs.statSync(fp).size;
        fs.unlinkSync(fp);
        localeFreed += sz;
      } catch {}
    }
  }
  if (localeFreed > 0) {
    console.log(`[bundle] Stripped unused locales (${(localeFreed / 1048576).toFixed(0)} MB)`);
    freedMB += localeFreed / 1048576;
  }
}

if (freedMB > 0) {
  console.log(`[bundle] Total freed: ${freedMB.toFixed(0)} MB`);
}

function getDirSize(dir) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += getDirSize(full);
      else try { total += fs.statSync(full).size; } catch {}
    }
  } catch {}
  return total;
}

function scanDir(dir) {
  let fileCount = 0;
  let totalSize = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = scanDir(full);
      fileCount += sub.fileCount;
      totalSize += sub.totalSize;
    } else {
      fileCount++;
      try { totalSize += fs.statSync(full).size; } catch {}
    }
  }
  return { fileCount, totalSize };
}

console.log('[bundle] Scanning app files...');
const { fileCount, totalSize } = scanDir(srcDir);
console.log(`[bundle] Found ${fileCount} files, ${(totalSize / 1048576).toFixed(1)} MB total`);

console.log('[bundle] Creating app-bundle.tar...');
execSync(`tar -cf "${tarPath}" -C "${srcDir}" .`, { stdio: 'inherit' });

const tarSize = fs.statSync(tarPath).size;
console.log(`[bundle] Archive (tar): ${(tarSize / 1048576).toFixed(1)} MB`);

// Save metadata for offline installer
const meta = { fileCount, totalSize, tarSize };
fs.writeFileSync(metaPath, JSON.stringify(meta));

// Create gzip-compressed version for web-installer download
console.log('[bundle] Creating app-bundle.tar.gz...');
execSync(`tar -czf "${gzPath}" -C "${srcDir}" .`, { stdio: 'inherit' });

const gzSize = fs.statSync(gzPath).size;
const compressionRatio = ((1 - gzSize / tarSize) * 100).toFixed(1);
console.log(`[bundle] Archive (tar.gz): ${(gzSize / 1048576).toFixed(1)} MB (${compressionRatio}% compression)`);

// Save metadata for web-installer
const gzMeta = { fileCount, totalSize, tarSize, gzSize };
fs.writeFileSync(gzMetaPath, JSON.stringify(gzMeta));

console.log(`[bundle] Done — ${fileCount} files, ${(totalSize / 1048576).toFixed(0)} MB`);
console.log(`[bundle] Upload app-bundle.tar.gz to GitHub Releases with: npm run upload:bundle`);
