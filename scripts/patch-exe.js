/**
 * Patch the pkg base binary (fetched node.exe) with custom icon + version info
 * BEFORE pkg compiles. This way pkg appends its VFS overlay after an already-
 * patched PE, keeping all offsets valid.
 *
 * Usage:
 *   node scripts/patch-exe.js          — patch base, run pkg, restore base (all-in-one)
 *   node scripts/patch-exe.js --restore — restore the original base binary (cleanup)
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE_DIR = path.resolve(__dirname, '..');
const ICO_PATH = path.join(BASE_DIR, 'public', 'visualillusion_white.ico');

// Find the pkg cached base binary
function findBaseBinary() {
  const cacheLocations = [
    path.join(BASE_DIR, '.pkg-cache'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', '.pkg-cache'),
  ];
  for (const cacheDir of cacheLocations) {
    if (!fs.existsSync(cacheDir)) continue;
    const versions = fs.readdirSync(cacheDir);
    for (const ver of versions) {
      const verDir = path.join(cacheDir, ver);
      if (!fs.statSync(verDir).isDirectory()) continue;
      const files = fs.readdirSync(verDir);
      for (const f of files) {
        if (f.startsWith('fetched-') && f.includes('win')) {
          return path.join(verDir, f);
        }
      }
    }
  }
  return null;
}

function restoreBase(basePath, backupPath) {
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, basePath);
    fs.unlinkSync(backupPath);
    console.log('[patch-exe] ✓ Base binary restored');
  }
}

// --restore mode: just restore and exit
if (process.argv.includes('--restore')) {
  const basePath = findBaseBinary();
  if (basePath) restoreBase(basePath, basePath + '.bak');
  process.exit(0);
}

// Main: patch → pkg → restore
(async () => {
  const basePath = findBaseBinary();
  if (!basePath) {
    console.log('[patch-exe] No pkg base binary found — running pkg without patching');
    execSync('npx @yao-pkg/pkg launcher.js --target node18-win-x64 --output VisualIllusion.exe --compress GZip', {
      cwd: BASE_DIR, stdio: 'inherit',
    });
    return;
  }

  const backupPath = basePath + '.bak';

  try {
    // ---- Patch the base binary ----
    if (!fs.existsSync(ICO_PATH)) {
      console.log(`[patch-exe] ICO not found: ${ICO_PATH} — skipping icon`);
    } else {
      console.log(`[patch-exe] Base binary: ${basePath}`);

      // Backup original
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(basePath, backupPath);
        console.log('[patch-exe] ✓ Backup saved');
      }

      const ResEdit = require('resedit');
      const data = fs.readFileSync(basePath);
      const exe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
      const res = ResEdit.NtExecutableResource.from(exe);

      // Set icon
      const iconData = fs.readFileSync(ICO_PATH);
      const iconFile = ResEdit.Data.IconFile.from(iconData);
      ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries, 1, 1033,
        iconFile.icons.map((icon) => icon.data)
      );
      console.log('[patch-exe] ✓ Icon set');

      // Set version info
      const vi = ResEdit.Resource.VersionInfo.createEmpty();
      vi.setFileVersion(1, 0, 0, 0);
      vi.setProductVersion(1, 0, 0, 0);
      vi.setStringValues({ lang: 1033, codepage: 1200 }, {
        FileDescription: 'VisualIllusion \u2014 Remote Administration Tool',
        ProductName: 'VisualIllusion',
        CompanyName: 'VisualIllusion',
        LegalCopyright: '\u00A9 2026 VisualIllusion. All rights reserved.',
        OriginalFilename: 'VisualIllusion.exe',
        InternalName: 'VisualIllusion',
        FileVersion: '1.0.0.0',
        ProductVersion: '1.0.0.0',
      });
      vi.outputToResourceEntries(res.entries);
      console.log('[patch-exe] ✓ Version info set');

      res.outputResource(exe);
      const newBinary = Buffer.from(exe.generate());
      fs.writeFileSync(basePath, newBinary);
      const sizeMB = (newBinary.length / 1024 / 1024).toFixed(1);
      console.log(`[patch-exe] ✓ Base patched (${sizeMB} MB). Ready for pkg.`);
    }

    // ---- Run pkg with PKG_NODE_PATH to skip hash check ----
    console.log('[patch-exe] Running pkg...');
    execSync('npx @yao-pkg/pkg launcher.js --target node18-win-x64 --output VisualIllusion.exe --compress GZip', {
      cwd: BASE_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        PKG_NODE_PATH: basePath, // Skip hash verification of our patched base binary
      },
    });
    console.log('[patch-exe] ✓ pkg completed');

  } catch (err) {
    console.error('[patch-exe] Error:', err.message);
    process.exitCode = 1;
  } finally {
    // Always restore the original base binary
    restoreBase(basePath, backupPath);
  }
})();
