/**
 * Post-build JavaScript Obfuscation Script
 * 
 * Obfuscates critical JS files (launcher.js, electron/*.js)
 * to protect source code from reverse engineering.
 * 
 * Usage: node scripts/obfuscate.js <directory>
 * Called automatically by the afterPack hook.
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// High-strength obfuscation config
const OBFUSCATION_CONFIG = {
  // Control flow
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,

  // String protection
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

  // Identifier mangling
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // false = keep module.exports accessible
  renameProperties: false,

  // Anti-debug
  debugProtection: true,
  debugProtectionInterval: 2000,
  selfDefending: true,

  // Misc
  disableConsoleOutput: false, // Keep console for launcher logging
  numbersToExpressions: true,
  simplify: true,
  transformObjectKeys: true,
  unicodeEscapeSequence: false,

  // Target
  target: 'node',

  // Exclude patterns — keep these strings readable
  reservedStrings: [
    'electron',
    'require',
    'module',
    'exports',
    '__dirname',
    '__filename',
    'process',
  ],
};

// Lighter config for preload scripts (must keep API names)
const PRELOAD_CONFIG = {
  ...OBFUSCATION_CONFIG,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,
  stringArrayEncoding: ['base64'],
  splitStrings: false,
};

/**
 * Obfuscate a single file in-place
 */
function obfuscateFile(filePath, config = OBFUSCATION_CONFIG) {
  const code = fs.readFileSync(filePath, 'utf-8');
  console.log(`[obfuscate] Processing: ${path.basename(filePath)} (${(code.length / 1024).toFixed(1)} KB)`);

  const startTime = Date.now();
  const result = JavaScriptObfuscator.obfuscate(code, config);
  const obfuscatedCode = result.getObfuscatedCode();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  fs.writeFileSync(filePath, obfuscatedCode, 'utf-8');
  console.log(`[obfuscate] Done: ${path.basename(filePath)} (${(obfuscatedCode.length / 1024).toFixed(1)} KB, ${elapsed}s)`);
}

/**
 * Obfuscate all critical files in a built app directory
 */
function obfuscateDirectory(appDir) {
  console.log('[obfuscate] === Starting obfuscation ===');
  console.log('[obfuscate] App directory:', appDir);

  const targets = [
    { file: 'launcher.js', config: OBFUSCATION_CONFIG },
    { file: 'electron/main.js', config: OBFUSCATION_CONFIG },
    { file: 'electron/preload.js', config: PRELOAD_CONFIG },
    { file: 'electron/preload-dialog.js', config: PRELOAD_CONFIG },
  ];

  let successCount = 0;
  for (const { file, config } of targets) {
    const fullPath = path.join(appDir, file);
    if (fs.existsSync(fullPath)) {
      try {
        obfuscateFile(fullPath, config);
        successCount++;
      } catch (err) {
        console.error(`[obfuscate] FAILED: ${file} — ${err.message}`);
      }
    } else {
      console.warn(`[obfuscate] Skipped (not found): ${file}`);
    }
  }

  console.log(`[obfuscate] === Complete: ${successCount}/${targets.length} files obfuscated ===`);
}

// CLI mode
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/obfuscate.js <app-directory>');
    process.exit(1);
  }
  obfuscateDirectory(path.resolve(dir));
}

module.exports = { obfuscateDirectory, obfuscateFile };
