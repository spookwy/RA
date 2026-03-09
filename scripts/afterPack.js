/**
 * electron-builder afterPack hook
 * Sets version metadata on the exe using rcedit
 */
const path = require('path');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

exports.default = async function afterPack(context) {
  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );
  const iconPath = path.join(context.packager.projectDir, 'public', 'visualillusion_white.ico');

  const fs = require('fs');

  if (!fs.existsSync(exePath)) {
    console.log('[afterPack] EXE not found:', exePath);
    return;
  }

  console.log('[afterPack] Setting metadata on', path.basename(exePath));
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { rcedit } = require('rcedit');
      const opts = {
        'version-string': {
          ProductName: 'VisualIllusion',
          FileDescription: 'VisualIllusion — Remote Support System',
          CompanyName: 'VisualIllusion',
          LegalCopyright: '© 2026 VisualIllusion',
        },
        'file-version': '1.0.0',
        'product-version': '1.0.0',
      };
      if (fs.existsSync(iconPath)) {
        opts.icon = iconPath;
      }
      await rcedit(exePath, opts);
      console.log('[afterPack] Metadata set successfully (attempt', attempt + ')');
      return;
    } catch (e) {
      console.warn('[afterPack] rcedit attempt', attempt, 'failed:', e.message);
      if (attempt < 3) await sleep(2000);
    }
  }
  console.warn('[afterPack] All rcedit attempts failed');
};
