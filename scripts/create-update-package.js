/**
 * Creates a lightweight update package (.tar) containing only the app code
 * (no node_modules, no Electron shell). Users download this instead of
 * the full 1.3 GB installer.
 *
 * Usage:  node scripts/create-update-package.js
 * Output: build/update-<version>.tar  (~50-150 MB)
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const version = pkg.version;

const buildOutputDir = process.env.BUILD_OUTPUT_DIR || 'dist-electron-new';
const srcDir = path.join(__dirname, '..', buildOutputDir, 'win-unpacked', 'resources', 'app');
const buildDir = path.join(__dirname, '..', 'build');
const tarName = `update-${version}.tar`;
const tarPath = path.join(buildDir, tarName);
const metaPath = tarPath + '.meta';

if (!fs.existsSync(srcDir)) {
  console.error('[update] ERROR: App build not found:', srcDir);
  console.error('[update] Run "npm run build:exe" first.');
  process.exit(1);
}

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Write version.json into the source so it's included in the tar
const versionInfo = {
  version,
  buildDate: new Date().toISOString(),
  buildHost: require('os').hostname(),
};
fs.writeFileSync(path.join(srcDir, 'version.json'), JSON.stringify(versionInfo, null, 2), 'utf-8');

// Exclude patterns — all heavy dirs that should NOT be in the update
// IMPORTANT: Do NOT exclude .next/standalone/.next — it contains compiled
// client-side JS bundles (.next/static/) that the browser needs to load.
const excludes = [
  '--exclude=./node_modules',
  '--exclude=./.next/standalone/node_modules',
  '--exclude=./.next/standalone/dist-electron-new',
  '--exclude=./.next/standalone/dist-electron-*',
  '--exclude=./.next/standalone/dist-installer',
  '--exclude=./.next/standalone/.pkg-cache',
  '--exclude=./.next/standalone/build',
  '--exclude=./dist-electron-new',
  '--exclude=./dist-electron-*',
  '--exclude=./dist-installer',
  '--exclude=./.pkg-cache',
  '--exclude=./build',
  '--exclude=./downloads',
  '--exclude=./.license',
  '--exclude=./.nickname',
];

console.log(`[update] Creating update package v${version}...`);
console.log(`[update] Source: ${srcDir}`);

// Create tar excluding heavy dirs
const excludeStr = excludes.join(' ');
execSync(`tar -cf "${tarPath}" ${excludeStr} -C "${srcDir}" .`, { stdio: 'inherit' });

const tarSize = fs.statSync(tarPath).size;
console.log(`[update] Archive size: ${(tarSize / 1048576).toFixed(1)} MB`);

if (tarSize > 2 * 1024 * 1024 * 1024) {
  console.error(`[update] WARNING: Archive is ${(tarSize / 1073741824).toFixed(2)} GB — this is too large!`);
  console.error(`[update] The update should be < 200 MB. Check excludes.`);
}

// Calculate SHA256 using streaming (works for files > 2 GB)
console.log(`[update] Calculating SHA256...`);
const sha256 = (() => {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(tarPath, 'r');
  const buf = Buffer.alloc(8 * 1024 * 1024); // 8 MB chunks
  let bytesRead;
  while ((bytesRead = fs.readSync(fd, buf, 0, buf.length)) > 0) {
    h.update(buf.subarray(0, bytesRead));
  }
  fs.closeSync(fd);
  return h.digest('hex');
})();

// Count files in tar
let fileCount = 0;
try {
  const output = execSync(`tar -tf "${tarPath}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  fileCount = output.split('\n').filter(l => l.trim()).length;
} catch { fileCount = -1; }

// Write meta
const meta = { version, fileCount, totalSize: tarSize, sha256, createdAt: new Date().toISOString() };
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

console.log(`[update] Archive: ${tarName} (${(tarSize / 1048576).toFixed(1)} MB, ${fileCount} files)`);
console.log(`[update] SHA256: ${sha256}`);
console.log(`[update]`);
console.log(`[update] Next steps:`);
console.log(`[update]   1. Upload ${tarName} to a file host (GitHub Releases, etc.)`);
console.log(`[update]   2. Add a row to Supabase 'app_updates' table:`);
console.log(`[update]      version: "${version}"`);
console.log(`[update]      download_url: "<your-upload-url>"`);
console.log(`[update]      file_size: ${tarSize}`);
console.log(`[update]      sha256: "${sha256}"`);
console.log(`[update] Done!`);
