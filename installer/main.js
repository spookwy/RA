/**
 * VisualIllusion Installer — Electron Main Process
 * Beautiful custom installer for VisualIllusion
 * Web-installer: downloads app bundle from GitHub Releases during installation
 */
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// ---- Download configuration ----
const GITHUB_REPO = 'spookwy/RA';
let APP_VERSION = '1.4.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  APP_VERSION = pkg.version || APP_VERSION;
} catch {}
// Fallback URL — will be overridden by fetchLatestRelease()
let BUNDLE_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/app-bundle.tar.gz`;
let LATEST_VERSION = APP_VERSION;
let latestReleaseResolved = false;

/**
 * Fetch the latest GitHub release info via API.
 * Discovers the real download URL and version dynamically,
 * so installer always works regardless of asset naming.
 */
function fetchLatestRelease() {
  return new Promise((resolve) => {
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    debugLog(`Fetching latest release: ${apiUrl}`);

    https.get(apiUrl, {
      headers: {
        'User-Agent': 'VisualIllusion-Installer',
        'Accept': 'application/vnd.github.v3+json',
      },
    }, (res) => {
      // Follow redirect (GitHub sometimes 302s)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        https.get(res.headers.location, {
          headers: { 'User-Agent': 'VisualIllusion-Installer', 'Accept': 'application/vnd.github.v3+json' },
        }, (r2) => handleResponse(r2, resolve)).on('error', () => resolve(false));
        return;
      }
      handleResponse(res, resolve);
    }).on('error', (err) => {
      debugLog(`fetchLatestRelease error: ${err.message}`);
      resolve(false);
    });

    function handleResponse(res, done) {
      if (res.statusCode !== 200) {
        res.resume();
        debugLog(`fetchLatestRelease HTTP ${res.statusCode}`);
        return done(false);
      }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const tagName = release.tag_name || '';
          const ver = tagName.replace(/^v/, '') || APP_VERSION;
          debugLog(`Latest release tag: ${tagName}, version: ${ver}`);

          // Find the best download asset: prefer app-bundle.tar.gz, then update-*.tar, then any .tar/.tar.gz
          const assets = release.assets || [];
          let bestUrl = null;
          let bestName = null;

          // Priority 1: app-bundle.tar.gz
          for (const a of assets) {
            if (a.name === 'app-bundle.tar.gz') {
              bestUrl = a.browser_download_url;
              bestName = a.name;
              break;
            }
          }
          // Priority 2: update-<version>.tar
          if (!bestUrl) {
            for (const a of assets) {
              if (a.name.startsWith('update-') && a.name.endsWith('.tar')) {
                bestUrl = a.browser_download_url;
                bestName = a.name;
                break;
              }
            }
          }
          // Priority 3: any .tar.gz or .tar
          if (!bestUrl) {
            for (const a of assets) {
              if (a.name.endsWith('.tar.gz') || a.name.endsWith('.tar')) {
                bestUrl = a.browser_download_url;
                bestName = a.name;
                break;
              }
            }
          }

          if (bestUrl) {
            BUNDLE_DOWNLOAD_URL = bestUrl;
            LATEST_VERSION = ver;
            APP_VERSION = ver;
            latestReleaseResolved = true;
            debugLog(`Resolved download: ${bestName} -> ${bestUrl}`);
            debugLog(`App version updated to: ${ver}`);
            done(true);
          } else {
            debugLog('No suitable asset found in latest release');
            done(false);
          }
        } catch (e) {
          debugLog(`fetchLatestRelease parse error: ${e.message}`);
          done(false);
        }
      });
    }
  });
}

let mainWindow = null;

// Debug log to file for diagnosing installer issues
const LOG_PATH = path.join(path.dirname(process.execPath), 'installer-debug.log');
function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch {}
  console.log(msg);
}

process.on('uncaughtException', (err) => {
  debugLog(`UNCAUGHT EXCEPTION: ${err.stack || err.message}`);
});
process.on('unhandledRejection', (reason) => {
  debugLog(`UNHANDLED REJECTION: ${reason}`);
});

debugLog(`Installer starting... PID=${process.pid}`);
debugLog(`execPath: ${process.execPath}`);
debugLog(`__dirname: ${__dirname}`);
debugLog(`resourcesPath: ${process.resourcesPath}`);

// Paths
const iconPath = path.join(__dirname, '..', 'public', 'visualillusion_white.ico');
const pngIconPath = path.join(__dirname, '..', 'public', 'visualillusion_white_n.png');

function getAppIcon() {
  if (fs.existsSync(pngIconPath)) return nativeImage.createFromPath(pngIconPath);
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return undefined;
}

// Where the bundled app files are stored (dev fallback only)
function getAppBundlePath() {
  const bundled = path.join(process.resourcesPath, 'app-bundle');
  if (fs.existsSync(bundled)) return bundled;
  const dev = path.join(__dirname, '..', 'dist-electron-new', 'win-unpacked');
  if (fs.existsSync(dev)) return dev;
  return null;
}

// Pre-packed tar archive — local fallback (offline or dev mode)
function getLocalTar() {
  // Check for .tar.gz first, then .tar
  for (const ext of ['.tar.gz', '.tar']) {
    const p1 = path.join(process.resourcesPath, `app-bundle${ext}`);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(__dirname, '..', 'build', `app-bundle${ext}`);
    if (fs.existsSync(p2)) return p2;
  }
  return null;
}

function getAppBundleMeta() {
  for (const ext of ['.tar.gz.meta', '.tar.meta']) {
    for (const base of [process.resourcesPath, path.join(__dirname, '..', 'build')]) {
      const p = path.join(base, `app-bundle${ext}`);
      if (fs.existsSync(p)) {
        try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
      }
    }
  }
  return null;
}

// ---- Download with progress & redirect support ----
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function doRequest(reqUrl, redirectCount) {
      if (redirectCount > 10) return reject(new Error('Слишком много перенаправлений'));

      const proto = reqUrl.startsWith('https:') ? https : http;
      const parsed = new URL(reqUrl);

      const reqOpts = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'VisualIllusion-Installer' },
      };

      proto.get(reqOpts, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // discard body
          return doRequest(res.headers.location, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Ошибка загрузки: HTTP ${res.statusCode}`));
        }

        const totalSize = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        const startTime = Date.now();

        const file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0.5 ? downloaded / elapsed : 0;
          const remaining = speed > 0 ? Math.round((totalSize - downloaded) / speed) : 0;
          const percent = totalSize > 0 ? Math.min(Math.round((downloaded / totalSize) * 100), 99) : 0;

          onProgress({
            downloaded,
            totalSize,
            speed,
            percent,
            remainingSeconds: remaining,
          });
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });

        file.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });

        res.on('error', (err) => {
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });
      }).on('error', reject);
    }

    doRequest(url, 0);
  });
}

function createWindow() {
  debugLog('createWindow called');
  const icon = getAppIcon();
  const preloadPath = path.join(__dirname, 'preload.js');
  const htmlPath = path.join(__dirname, 'index.html');
  debugLog(`preload exists: ${fs.existsSync(preloadPath)} -> ${preloadPath}`);
  debugLog(`index.html exists: ${fs.existsSync(htmlPath)} -> ${htmlPath}`);

  mainWindow = new BrowserWindow({
    width: 660,
    height: 540,
    resizable: false,
    maximizable: false,
    transparent: true,
    frame: false,
    icon: icon || iconPath,
    title: 'VisualIllusion Setup',
    show: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    debugLog(`did-fail-load: code=${code} desc=${desc}`);
  });
  mainWindow.webContents.on('crashed', () => {
    debugLog('Renderer process crashed!');
  });
  mainWindow.on('unresponsive', () => {
    debugLog('Window unresponsive!');
  });

  mainWindow.loadFile(htmlPath)
    .then(() => debugLog('loadFile resolved OK'))
    .catch(err => debugLog(`loadFile FAILED: ${err.message}`));
  mainWindow.once('ready-to-show', () => {
    debugLog('ready-to-show fired, showing window');
    mainWindow.show();
  });
}

// Single instance lock — prevent two copies from running simultaneously
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  debugLog('SINGLE INSTANCE LOCK FAILED — another instance is running. Quitting.');
  app.quit();
} else {
  debugLog('Single instance lock acquired OK');
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    debugLog('app ready event fired');
    // Fetch latest release info BEFORE creating window so version is correct
    try {
      await fetchLatestRelease();
    } catch (e) {
      debugLog(`fetchLatestRelease failed: ${e.message}`);
    }
    createWindow();
  }).catch(err => debugLog(`app.whenReady FAILED: ${err.message}`));
  app.on('window-all-closed', () => {
    debugLog('window-all-closed — quitting');
    app.quit();
  });

  // Self-cleanup: silently uninstall the NSIS wrapper on exit
  // Skip if we just launched the app — the uninstaller can interfere with it
  app.on('before-quit', () => {
    if (appLaunched) return; // Don't run uninstaller when user clicked "Open application"
    try {
      const installDir = path.dirname(process.execPath);
      const possibleNames = [
        path.join(installDir, 'Uninstall VisualIllusion Installer.exe'),
        path.join(installDir, 'Uninstall ' + path.basename(installDir) + '.exe'),
      ];
      for (const u of possibleNames) {
        if (fs.existsSync(u)) {
          const { spawn } = require('child_process');
          spawn(u, ['/S'], { detached: true, stdio: 'ignore' }).unref();
          break;
        }
      }
    } catch {}
  });
} // end of else (gotLock)

// ---- IPC Handlers ----

ipcMain.handle('get-logo-path', () => {
  // Return the file:// URL to the logo PNG for the renderer
  if (fs.existsSync(pngIconPath)) return 'file:///' + pngIconPath.replace(/\\/g, '/');
  return null;
});

ipcMain.handle('minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('close', () => {
  app.quit();
});

ipcMain.handle('get-default-path', () => {
  return path.join(process.env.LOCALAPPDATA || 'C:\\Program Files', 'VisualIllusion');
});

ipcMain.handle('get-download-info', async () => {
  // If we haven't resolved the latest release yet, try now
  if (!latestReleaseResolved) {
    try { await fetchLatestRelease(); } catch {}
  }
  const localTar = getLocalTar();
  return {
    version: APP_VERSION,
    isWebInstall: !localTar && !getAppBundlePath(),
    downloadUrl: BUNDLE_DOWNLOAD_URL,
  };
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите папку для установки',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: path.join(process.env.LOCALAPPDATA || 'C:\\Program Files', 'VisualIllusion'),
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Count all files recursively
function countFiles(dir) {
  let count = 0;
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = countFiles(fullPath);
        count += sub.count;
        totalSize += sub.totalSize;
      } else {
        count++;
        try { totalSize += fs.statSync(fullPath).size; } catch {}
      }
    }
  } catch {}
  return { count, totalSize };
}

// Copy directory recursively with progress
function copyDirRecursive(src, dest, progressCb, state) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (state.cancelled) return;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, progressCb, state);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
        state.copiedFiles++;
        state.copiedSize += fs.statSync(srcPath).size || 0;
        progressCb(state);
      } catch (err) {
        state.errors.push({ file: entry.name, error: err.message });
      }
    }
  }
}

let installState = null;

ipcMain.handle('start-install', async (event, options) => {
  const { installPath, desktopShortcut, startMenuShortcut } = options;

  // Check for local tar first (offline/dev mode), otherwise download
  let tarPath = getLocalTar();
  const bundlePath = !tarPath ? getAppBundlePath() : null;
  const needsDownload = !tarPath && !bundlePath;
  let downloadedTarPath = null;

  installState = { cancelled: false };

  try {
    // Stage 1: Preparing
    mainWindow.webContents.send('install-stage', {
      stage: 'prepare',
      text: 'Подготовка к установке...',
      detail: 'Анализ файлов приложения',
    });

    let totalFiles = 0, totalSize = 0;
    const meta = getAppBundleMeta();
    if (meta) {
      totalFiles = meta.fileCount || 0;
      totalSize = meta.totalSize || 0;
    } else if (tarPath) {
      totalSize = fs.statSync(tarPath).size;
    } else if (bundlePath) {
      const info = countFiles(bundlePath);
      totalFiles = info.count;
      totalSize = info.totalSize;
    }
    await sleep(300);

    // Stage 2: Creating directory
    mainWindow.webContents.send('install-stage', {
      stage: 'directory',
      text: 'Создание директории...',
      detail: installPath,
    });

    if (!fs.existsSync(installPath)) {
      fs.mkdirSync(installPath, { recursive: true });
    }
    await sleep(200);

    // Stage 3: Download (web-installer mode)
    if (needsDownload) {
      // Make sure we have the latest release URL
      if (!latestReleaseResolved) {
        try { await fetchLatestRelease(); } catch {}
      }

      const downloadFileName = BUNDLE_DOWNLOAD_URL.split('/').pop() || 'app-bundle.tar.gz';
      mainWindow.webContents.send('install-stage', {
        stage: 'download',
        text: 'Загрузка файлов...',
        detail: downloadFileName,
      });

      debugLog(`Downloading bundle from: ${BUNDLE_DOWNLOAD_URL}`);

      // Download to temp directory
      const tempDir = path.join(process.env.TEMP || path.join(installPath, '..'), 'vi-installer-temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      downloadedTarPath = path.join(tempDir, downloadFileName);

      await downloadFile(BUNDLE_DOWNLOAD_URL, downloadedTarPath, (progress) => {
        mainWindow.webContents.send('install-progress', {
          percent: Math.round(progress.percent * 0.7), // Download is 70% of total
          copiedFiles: 0,
          totalFiles: 0,
          copiedSize: progress.downloaded,
          totalSize: progress.totalSize,
          speed: progress.speed,
          remainingSeconds: progress.remainingSeconds,
          stage: 'download',
        });
      });

      tarPath = downloadedTarPath;
      debugLog(`Download complete: ${downloadedTarPath} (${(fs.statSync(downloadedTarPath).size / 1048576).toFixed(1)} MB)`);
    }

    // Stage 4: Extracting / Copying files
    if (tarPath) {
      mainWindow.webContents.send('install-stage', {
        stage: 'copying',
        text: 'Распаковка файлов...',
        detail: 'Начало извлечения...',
      });

      const extractStart = Date.now();
      const avgFileSize = totalFiles > 0 ? totalSize / totalFiles : 1;
      let extractedFiles = 0;

      // Detect if the tar is gzipped
      const isGzip = tarPath.endsWith('.tar.gz') || tarPath.endsWith('.tgz');
      const tarArgs = isGzip
        ? ['-xzf', tarPath, '-C', installPath]
        : ['-xvf', tarPath, '-C', installPath];

      // For gzip archives, use -xzf (no verbose) for speed, then simulate progress
      if (isGzip) {
        // Use verbose mode to track progress but with gzip decompression
        tarArgs[0] = '-xzvf';
      }

      await new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const tarProc = spawn('tar', tarArgs, {
          windowsHide: true,
        });

        function processOutput(chunk) {
          const lines = chunk.toString().split('\n').filter(l => l.trim());
          extractedFiles += lines.length;
          const basePct = needsDownload ? 70 : 0; // If downloaded, extraction starts at 70%
          const extractRange = needsDownload ? 25 : 95; // remaining range for extraction
          const extractPct = totalFiles > 0
            ? Math.min(Math.round((extractedFiles / totalFiles) * extractRange), extractRange)
            : Math.min(extractedFiles / 100, extractRange);
          const pct = basePct + extractPct;
          const elapsed = (Date.now() - extractStart) / 1000;
          const copiedSize = Math.min(Math.round(extractedFiles * avgFileSize), totalSize);
          const speed = elapsed > 0 ? copiedSize / elapsed : 0;
          const remaining = speed > 0 ? Math.round((totalSize - copiedSize) / speed) : 0;

          mainWindow.webContents.send('install-progress', {
            percent: Math.min(pct, 99),
            copiedFiles: extractedFiles,
            totalFiles,
            copiedSize,
            totalSize,
            speed,
            remainingSeconds: remaining,
            stage: 'extract',
          });
        }

        tarProc.stdout.on('data', processOutput);
        tarProc.stderr.on('data', processOutput);

        tarProc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Ошибка распаковки (код ${code})`));
        });
        tarProc.on('error', reject);
      });

      // Clean up downloaded temp file
      if (downloadedTarPath) {
        try {
          fs.unlinkSync(downloadedTarPath);
          const tempDir = path.dirname(downloadedTarPath);
          fs.rmdirSync(tempDir);
          debugLog('Cleaned up temp download files');
        } catch {}
      }
    } else {
      mainWindow.webContents.send('install-stage', {
        stage: 'copying',
        text: 'Копирование файлов...',
        detail: `0 / ${totalFiles} файлов`,
      });

      const state = {
        copiedFiles: 0,
        copiedSize: 0,
        totalFiles,
        totalSize,
        errors: [],
        cancelled: false,
        startTime: Date.now(),
      };

      const progressCb = (s) => {
        const pct = totalFiles > 0 ? Math.round((s.copiedFiles / s.totalFiles) * 100) : 0;
        const elapsed = Date.now() - s.startTime;
        const speed = s.copiedSize / (elapsed / 1000);
        const remaining = speed > 0 ? Math.round((s.totalSize - s.copiedSize) / speed) : 0;

        mainWindow.webContents.send('install-progress', {
          percent: pct,
          copiedFiles: s.copiedFiles,
          totalFiles: s.totalFiles,
          copiedSize: s.copiedSize,
          totalSize: s.totalSize,
          speed,
          remainingSeconds: remaining,
        });
      };

      await new Promise((resolve) => {
        setImmediate(() => {
          copyDirRecursive(bundlePath, installPath, progressCb, state);
          resolve();
        });
      });
    }

    await sleep(200);

    const exePath = path.join(installPath, 'VisualIllusion.exe');
    const icoPath = path.join(installPath, 'resources', 'app', 'public', 'visualillusion_white.ico');
    const iconForShortcut = fs.existsSync(icoPath) ? icoPath : exePath;

    // Stage 4: Creating shortcuts (first, so user sees the icon immediately)
    mainWindow.webContents.send('install-stage', {
      stage: 'shortcuts',
      text: 'Создание ярлыков...',
      detail: '',
    });

    if (desktopShortcut) {
      try {
        // Use Electron's app.getPath('desktop') — handles OneDrive folder redirection
        let desktopDir;
        try { desktopDir = app.getPath('desktop'); } catch {}
        if (!desktopDir) desktopDir = path.join(process.env.USERPROFILE || '', 'Desktop');
        const desktopPath = path.join(desktopDir, 'VisualIllusion.lnk');
        if (!fs.existsSync(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });

        // Try Electron API first (no operation = create/replace)
        let created = false;
        try {
          created = shell.writeShortcutLink(desktopPath, {
            target: exePath,
            icon: iconForShortcut,
            iconIndex: 0,
            cwd: installPath,
            description: 'VisualIllusion — Remote Support System',
          });
        } catch { created = false; }

        if (!created) {
          // VBS fallback — uses SpecialFolders("Desktop") for correct path
          try {
            const vbs = [
              'Set ws = CreateObject("WScript.Shell")',
              'desktopPath = ws.SpecialFolders("Desktop")',
              `Set sc = ws.CreateShortcut(desktopPath & "\\VisualIllusion.lnk")`,
              `sc.TargetPath = "${exePath}"`,
              `sc.IconLocation = "${iconForShortcut},0"`,
              `sc.WorkingDirectory = "${installPath}"`,
              'sc.Description = "VisualIllusion"',
              'sc.Save',
            ].join('\r\n');
            const vbsPath = path.join(installPath, '_mkshortcut.vbs');
            fs.writeFileSync(vbsPath, vbs, 'utf-8');
            execSync(`cscript //Nologo "${vbsPath}"`, { stdio: 'ignore', windowsHide: true });
            try { fs.unlinkSync(vbsPath); } catch {}
          } catch (vbsErr) {
            console.error('Desktop shortcut VBS fallback error:', vbsErr);
          }
        }
      } catch (e) {
        console.error('Desktop shortcut error:', e);
      }
    }

    if (startMenuShortcut) {
      try {
        const startMenuDir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
        const smPath = path.join(startMenuDir, 'VisualIllusion.lnk');
        let created = false;
        try {
          created = shell.writeShortcutLink(smPath, {
            target: exePath,
            icon: iconForShortcut,
            iconIndex: 0,
            cwd: installPath,
            description: 'VisualIllusion — Remote Support System',
          });
        } catch { created = false; }
        if (!created) {
          try {
            const vbs = [
              'Set ws = CreateObject("WScript.Shell")',
              `Set sc = ws.CreateShortcut("${smPath}")`,
              `sc.TargetPath = "${exePath}"`,
              `sc.IconLocation = "${iconForShortcut},0"`,
              `sc.WorkingDirectory = "${installPath}"`,
              'sc.Description = "VisualIllusion"',
              'sc.Save',
            ].join('\r\n');
            const vbsPath = path.join(installPath, '_mkshortcut_sm.vbs');
            fs.writeFileSync(vbsPath, vbs, 'utf-8');
            execSync(`cscript //Nologo "${vbsPath}"`, { stdio: 'ignore', windowsHide: true });
            try { fs.unlinkSync(vbsPath); } catch {}
          } catch {}
        }
      } catch (e) {
        console.error('Start menu shortcut error:', e);
      }
    }

    // Flush Windows icon cache so shortcut icons appear immediately
    try {
      execSync('ie4uinit.exe -show', { stdio: 'ignore', windowsHide: true, timeout: 5000 });
    } catch {
      // Fallback for older Windows
      try {
        execSync('ie4uinit.exe -ClearIconCache', { stdio: 'ignore', windowsHide: true, timeout: 5000 });
      } catch {}
    }

    await sleep(300);

    // Stage 5: Configuration
    mainWindow.webContents.send('install-stage', {
      stage: 'configure',
      text: 'Настройка приложения...',
      detail: 'Регистрация в системе',
    });

    // Register in Add/Remove Programs
    try {
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VisualIllusion';
      execSync(`reg add "${regKey}" /v DisplayName /t REG_SZ /d "VisualIllusion" /f`, { stdio: 'ignore' });
      execSync(`reg add "${regKey}" /v DisplayIcon /t REG_SZ /d "${exePath}" /f`, { stdio: 'ignore' });
      execSync(`reg add "${regKey}" /v InstallLocation /t REG_SZ /d "${installPath}" /f`, { stdio: 'ignore' });
      execSync(`reg add "${regKey}" /v UninstallString /t REG_SZ /d "${path.join(installPath, 'uninstall.bat')}" /f`, { stdio: 'ignore' });
      execSync(`reg add "${regKey}" /v Publisher /t REG_SZ /d "VisualIllusion" /f`, { stdio: 'ignore' });
      execSync(`reg add "${regKey}" /v DisplayVersion /t REG_SZ /d "${APP_VERSION}" /f`, { stdio: 'ignore' });
      execSync(`reg add "${regKey}" /v NoModify /t REG_DWORD /d 1 /f`, { stdio: 'ignore' });
      execSync(`reg add "${regKey}" /v NoRepair /t REG_DWORD /d 1 /f`, { stdio: 'ignore' });
    } catch {}

    // Create uninstaller batch script
    try {
      const uninstallScript = `@echo off
title VisualIllusion Uninstaller
echo.
echo  Удаление VisualIllusion...
echo.
taskkill /F /IM VisualIllusion.exe >nul 2>&1
timeout /t 2 /nobreak >nul
rmdir /s /q "${installPath}"
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VisualIllusion" /f >nul 2>&1
del "%USERPROFILE%\\Desktop\\VisualIllusion.lnk" >nul 2>&1
del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\VisualIllusion.lnk" >nul 2>&1
echo.
echo  VisualIllusion удалён.
echo.
pause
`;
      fs.writeFileSync(path.join(installPath, 'uninstall.bat'), uninstallScript, 'utf-8');
    } catch {}

    await sleep(300);

    // Stage 6: Done
    mainWindow.webContents.send('install-stage', {
      stage: 'done',
      text: 'Установка завершена!',
      detail: '',
    });

    return {
      success: true,
      installPath,
      errors: [],
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let appLaunched = false;

ipcMain.handle('launch-app', async (event, installPath) => {
  const exePath = path.join(installPath, 'VisualIllusion.exe');
  if (!fs.existsSync(exePath)) {
    console.error('launch-app: exe not found at', exePath);
    setTimeout(() => app.quit(), 500);
    return;
  }

  appLaunched = true;

  // Use VBS to launch — creates a truly independent process that
  // survives the installer (and its NSIS wrapper) exiting
  let launched = false;
  try {
    const vbs = [
      'Set ws = CreateObject("WScript.Shell")',
      `ws.Run """${exePath}""", 1, False`,
    ].join('\r\n');
    const vbsPath = path.join(installPath, '_launch.vbs');
    fs.writeFileSync(vbsPath, vbs, 'utf-8');
    execSync(`cscript //Nologo "${vbsPath}"`, { stdio: 'ignore', windowsHide: true, timeout: 10000 });
    // Cleanup VBS after a delay (the app will be running by then)
    setTimeout(() => { try { fs.unlinkSync(vbsPath); } catch {} }, 5000);
    launched = true;
    console.log('launch-app: VBS launch ok');
  } catch (e1) {
    console.error('launch-app VBS failed:', e1);
  }

  // Fallback: spawn detached
  if (!launched) {
    try {
      const { spawn } = require('child_process');
      const child = spawn(exePath, [], {
        cwd: installPath,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      launched = true;
      console.log('launch-app: spawn detached PID', child.pid);
    } catch (e2) {
      console.error('launch-app spawn failed:', e2);
    }
  }

  // Last resort: shell.openPath
  if (!launched) {
    try {
      await shell.openPath(exePath);
      console.log('launch-app: shell.openPath ok');
    } catch {}
  }

  // Give the OS time to spawn the app before we quit
  setTimeout(() => app.quit(), 3500);
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
