/**
 * Secure Build Script
 * 
 * Obfuscates JS source files in-place, runs electron-builder,
 * then restores the originals. This ensures the ASAR contains
 * obfuscated code while keeping dev sources clean.
 * 
 * Usage: node scripts/secure-build.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Files to obfuscate (relative to project root)
const TARGETS = [
  { file: 'launcher.js', preset: 'full' },
  { file: 'electron/main.js', preset: 'full' },
  { file: 'electron/preload.js', preset: 'light' },
  { file: 'electron/preload-dialog.js', preset: 'light' },
];

const BACKUP_SUFFIX = '.__backup__';

function backupFiles() {
  console.log('[secure-build] Backing up source files...');
  for (const { file } of TARGETS) {
    const fp = path.join(ROOT, file);
    if (fs.existsSync(fp)) {
      fs.copyFileSync(fp, fp + BACKUP_SUFFIX);
    }
  }
}

function restoreFiles() {
  console.log('[secure-build] Restoring original source files...');
  for (const { file } of TARGETS) {
    const fp = path.join(ROOT, file);
    const backup = fp + BACKUP_SUFFIX;
    if (fs.existsSync(backup)) {
      fs.copyFileSync(backup, fp);
      fs.unlinkSync(backup);
    }
  }
}

function obfuscateFiles() {
  console.log('[secure-build] Obfuscating source files...');
  const { obfuscateFile } = require('./obfuscate.js');
  const { OBFUSCATION_CONFIG, PRELOAD_CONFIG } = (() => {
    // Re-import configs from obfuscate.js by requiring it
    const mod = require('./obfuscate.js');
    // The configs aren't exported, so define them inline
    const FULL = {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayCallsTransformThreshold: 0.75,
      stringArrayEncoding: ['rc4'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 0.75,
      splitStrings: true,
      splitStringsChunkLength: 5,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,
      renameProperties: false,
      debugProtection: true,
      debugProtectionInterval: 2000,
      selfDefending: true,
      disableConsoleOutput: false,
      numbersToExpressions: true,
      simplify: true,
      transformObjectKeys: true,
      unicodeEscapeSequence: false,
      target: 'node',
      reservedStrings: ['electron', 'require', 'module', 'exports', '__dirname', '__filename', 'process'],
    };
    const LIGHT = {
      ...FULL,
      controlFlowFlatteningThreshold: 0.5,
      deadCodeInjection: false,
      debugProtection: false,
      selfDefending: false,
      stringArrayEncoding: ['base64'],
      splitStrings: false,
    };
    return { OBFUSCATION_CONFIG: FULL, PRELOAD_CONFIG: LIGHT };
  })();

  for (const { file, preset } of TARGETS) {
    const fp = path.join(ROOT, file);
    if (fs.existsSync(fp)) {
      const config = preset === 'light' ? PRELOAD_CONFIG : OBFUSCATION_CONFIG;
      try {
        obfuscateFile(fp, config);
      } catch (err) {
        console.error(`[secure-build] Failed to obfuscate ${file}: ${err.message}`);
      }
    }
  }
}

// Main
console.log('[secure-build] === Starting Secure Build ===');
console.log('');

try {
  // Step 1: Backup originals
  backupFiles();

  // Step 2: Obfuscate in-place
  obfuscateFiles();
  console.log('');

  // Step 2.5: Copy static files into standalone (ensures BUILD_ID consistency)
  console.log('[secure-build] Copying static files into standalone...');
  execSync('node scripts/copy-static.js', {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 60000,
  });

  // Step 3: Run electron-builder
  console.log('[secure-build] Running electron-builder...');
  execSync('npx cross-env BUILD_TARGET=dir electron-builder --win --config electron-builder.config.cjs', {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 600000,
  });

  console.log('');
  console.log('[secure-build] === Build Complete! ===');
} catch (err) {
  console.error('[secure-build] Build failed:', err.message);
  process.exitCode = 1;
} finally {
  // Step 4: Always restore originals
  restoreFiles();
}
