/**
 * Patches NsisTarget.js to use UninstallerReader (binary parsing) on Windows
 * instead of spawning the installer exe (which Smart App Control blocks).
 *
 * Run BEFORE electron-builder build step.
 */
const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'app-builder-lib',
  'out',
  'targets',
  'nsis',
  'NsisTarget.js'
);

const MARKER = '// [PATCHED] Use UninstallerReader on Windows';

let src = fs.readFileSync(targetFile, 'utf8');

if (src.includes(MARKER)) {
  console.log('[patch-nsis-target] Already patched, skipping.');
  process.exit(0);
}

// Original block:
//   if ((0, macosVersion_1.isMacOsCatalina)()) {
//     try { await nsisUtil_1.UninstallerReader.exec(...) } catch { ... VM fallback ... }
//   } else {
//     await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
//   }

const oldCode = `        if ((0, macosVersion_1.isMacOsCatalina)()) {
            try {
                await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
            }
            catch (error) {
                builder_util_1.log.warn(\`packager.vm is used: \${error.message}\`);
                const vm = await packager.vm.value;
                await vm.exec(installerPath, []);
                // Parallels VM can exit after command execution, but NSIS continue to be running
                let i = 0;
                while (!(await (0, builder_util_1.exists)(uninstallerPath)) && i++ < 100) {
                    // noinspection JSUnusedLocalSymbols
                    await new Promise((resolve, _reject) => setTimeout(resolve, 300));
                }
            }
        }
        else {
            await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
        }`;

const newCode = `        ${MARKER}
        try {
            await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);
        }
        catch (readerError) {
            builder_util_1.log.warn(\`UninstallerReader failed, falling back to exec: \${readerError.message}\`);
            if ((0, macosVersion_1.isMacOsCatalina)()) {
                const vm = await packager.vm.value;
                await vm.exec(installerPath, []);
                let i = 0;
                while (!(await (0, builder_util_1.exists)(uninstallerPath)) && i++ < 100) {
                    await new Promise((resolve, _reject) => setTimeout(resolve, 300));
                }
            }
            else {
                await (0, wine_1.execWine)(installerPath, null, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });
            }
        }`;

if (!src.includes(oldCode)) {
  console.error('[patch-nsis-target] Could not find the expected code block to patch!');
  console.error('The NsisTarget.js may have been updated. Manual patching required.');
  process.exit(1);
}

src = src.replace(oldCode, newCode);
fs.writeFileSync(targetFile, src, 'utf8');
console.log('[patch-nsis-target] Successfully patched NsisTarget.js — UninstallerReader will be used on Windows.');
