/**
 * Copy static files to Next.js standalone output.
 * Standalone mode doesn't include .next/static and public/ by default.
 * Without these, CSS/JS won't load and the app will be broken.
 */
const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`  Skip: ${src} (not found)`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const root = path.resolve(__dirname, '..');

// Auto-detect distDir: prefer .next, fallback to .next2
const nextDir = fs.existsSync(path.join(root, '.next', 'standalone', 'server.js')) ? '.next'
  : fs.existsSync(path.join(root, '.next2', 'standalone', 'server.js')) ? '.next2' : '.next';

const staticSrc = path.join(root, nextDir, 'static');
const staticDest = path.join(root, nextDir, 'standalone', '.next', 'static');
console.log(`[copy-static] Copying ${nextDir}/static -> standalone/.next/static`);
copyDirSync(staticSrc, staticDest);

const publicSrc = path.join(root, 'public');
const publicDest = path.join(root, nextDir, 'standalone', 'public');
console.log('[copy-static] Copying public/ -> standalone/public/');
copyDirSync(publicSrc, publicDest);

// Also copy .env.local if it exists (standalone needs env vars)
const envSrc = path.join(root, '.env.local');
const envDest = path.join(root, nextDir, 'standalone', '.env.local');
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, envDest);
  console.log('[copy-static] Copied .env.local -> standalone/.env.local');
}

console.log('[copy-static] Done!');
