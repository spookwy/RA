/**
 * VisualIllusion — Electron Main Process
 *
 * Wraps the launcher backend and admin panel in a native Windows GUI window.
 * No console window — just a clean desktop application.
 */

const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage, screen, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// Tell launcher.js we're running inside Electron
process.env.ELECTRON_RUN = '1';

const LAUNCHER_PORT = 3333;
const PANEL_PORT = 3000;
const IS_PROD = !process.defaultApp && !process.argv.includes('--dev');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ============================================================
// PROTECTION LAYER 1: Anti-Debugging & Anti-Reverse-Engineering
// ============================================================

const _DANGEROUS_PROCESSES = [
  'ollydbg', 'x64dbg', 'x32dbg', 'windbg', 'ida', 'ida64', 'idag', 'idag64',
  'idaw', 'idaw64', 'idaq', 'idaq64', 'radare2', 'r2', 'ghidra',
  'processhacker', 'procmon', 'procmon64', 'procexp', 'procexp64',
  'fiddler', 'wireshark', 'charles', 'mitmproxy', 'httpdebuggerpro',
  'dnspy', 'de4dot', 'ilspy', 'dotpeek', 'justdecompile',
  'cheatengine', 'cheatengine-x86_64', 'ce', 'hxd', 'hxd64',
  'resourcehacker', 'reshack', 'pestudio', 'die', 'exeinfope',
  'apimonitor', 'api_monitor', 'scylla', 'scylla_x64', 'scylla_x86',
  'httpdebugger', 'httpdebuggersvc', 'binaryninja', 'cutter',
];

function _checkDebuggers() {
  if (!IS_PROD) return;
  try {
    const tasks = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8', timeout: 5000 }).toLowerCase();
    for (const proc of _DANGEROUS_PROCESSES) {
      if (tasks.includes(proc)) {
        // Silently kill the debugging process instead of showing a dialog
        try {
          execSync(`taskkill /F /IM "${proc}.exe"`, { encoding: 'utf-8', timeout: 5000, windowsHide: true });
        } catch { /* process may already be gone */ }
      }
    }
  } catch { /* tasklist may fail in sandbox */ }
}

// Periodic check every 15 seconds
let _debugCheckInterval;
function _startDebugWatch() {
  if (!IS_PROD) return;
  _checkDebuggers();
  _debugCheckInterval = setInterval(_checkDebuggers, 15000);
}

// ============================================================
// PROTECTION LAYER 2: DevTools Blocking
// ============================================================

function _blockDevTools(win) {
  if (!IS_PROD) return;
  
  win.webContents.on('before-input-event', (event, input) => {
    // Block F12
    if (input.key === 'F12') { event.preventDefault(); return; }
    // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
    if (input.control && input.shift && ['I', 'J', 'C', 'i', 'j', 'c'].includes(input.key)) {
      event.preventDefault(); return;
    }
    // Block Ctrl+U (view source)
    if (input.control && (input.key === 'U' || input.key === 'u')) {
      event.preventDefault(); return;
    }
  });

  // If DevTools are opened externally, close them or the window
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools();
  });
}

// ============================================================
// PROTECTION LAYER 3: ASAR Integrity Verification
// ============================================================

function _verifyIntegrity() {
  if (!IS_PROD) return true;
  try {
    const appPath = app.getAppPath();

    // Verify key files exist and aren't obviously tampered
    const keyFiles = ['launcher.js', 'electron/main.js', 'version.json'];
    for (const f of keyFiles) {
      const fp = path.join(appPath, f);
      if (!fs.existsSync(fp)) return false;
    }

    // Check version.json hasn't been replaced with something weird
    const vj = JSON.parse(fs.readFileSync(path.join(appPath, 'version.json'), 'utf-8'));
    if (!vj.version || !/^\d+\.\d+\.\d+$/.test(vj.version)) return false;

    // Check launcher.js isn't a tiny stub
    const launcherStat = fs.statSync(path.join(appPath, 'launcher.js'));
    if (launcherStat.size < 10000) return false;

    return true;
  } catch {
    return false;
  }
}

// ============================================================
// PROTECTION LAYER 4: Environment Integrity
// ============================================================

function _checkEnvironment() {
  if (!IS_PROD) return;
  
  // Check if running under a debugger
  if (process.env.NODE_OPTIONS && (
    process.env.NODE_OPTIONS.includes('--inspect') ||
    process.env.NODE_OPTIONS.includes('--debug')
  )) {
    app.exit(1);
    return;
  }

  // Check for Electron debug flags
  if (process.argv.some(a => a.includes('--inspect') || a.includes('--debug') || a.includes('--remote-debugging-port'))) {
    app.exit(1);
    return;
  }
}

// Close behavior preference: 'ask' | 'hide' | 'quit'
let closeBehavior = 'ask';
const prefsPath = path.join(app.getPath('userData'), 'close-prefs.json');

function loadClosePrefs() {
  try {
    if (fs.existsSync(prefsPath)) {
      const data = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      if (data.closeBehavior === 'hide' || data.closeBehavior === 'quit') {
        closeBehavior = data.closeBehavior;
      }
    }
  } catch { /* ignore */ }
}

function saveClosePrefs(behavior) {
  try {
    fs.writeFileSync(prefsPath, JSON.stringify({ closeBehavior: behavior }), 'utf-8');
  } catch { /* ignore */ }
}

// Icon path (works both in dev and packaged)
const iconPath = path.join(__dirname, '..', 'public', 'visualillusion_white.ico');
const pngIconPath = path.join(__dirname, '..', 'public', 'visualillusion_white_n.png');

// Create a high-quality nativeImage for taskbar/window
function getAppIcon() {
  // Prefer PNG for higher quality rendering in taskbar
  if (fs.existsSync(pngIconPath)) {
    const img = nativeImage.createFromPath(pngIconPath);
    // Resize to standard Windows taskbar sizes for crispness
    return img;
  }
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  return undefined;
}

const appIcon = getAppIcon();

// Clamp window size and position within the visible work area (avoids taskbar overlap)
function fitToWorkArea(win) {
  try {
    const { workArea } = screen.getPrimaryDisplay();
    let [w, h] = win.getSize();
    let [x, y] = win.getPosition();
    // Shrink if larger than work area
    if (w > workArea.width) w = workArea.width;
    if (h > workArea.height) h = workArea.height;
    win.setSize(w, h);
    // Re-center within work area
    x = Math.round(workArea.x + (workArea.width - w) / 2);
    y = Math.round(workArea.y + (workArea.height - h) / 2);
    win.setPosition(x, y);
  } catch { /* ignore */ }
}

// ---- Window ----

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 750,
    minHeight: 500,
    transparent: true,
    icon: appIcon || iconPath,
    title: 'VisualIllusion',
    show: false,
    center: true,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load splash screen while services start
  // PROTECTION: Block DevTools
  _blockDevTools(mainWindow);

  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  mainWindow.once('ready-to-show', () => {
    fitToWorkArea(mainWindow);
    mainWindow.show();
  });

  // Intercept target="_blank" links (e.g., "Open Panel" button)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Panel link → navigate the same window, resize for full dashboard
    if (url.includes(`localhost:${PANEL_PORT}`) || url.includes(`127.0.0.1:${PANEL_PORT}`)) {
      mainWindow.setSize(1400, 900);
      fitToWorkArea(mainWindow);
      mainWindow.loadURL(url);
      return { action: 'deny' };
    }
    // Any other link → open in default browser
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Close behavior: dialog, hide, or quit
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    if (isHandlingClose) return;

    if (closeBehavior === 'hide') {
      mainWindow.hide();
      return;
    }
    if (closeBehavior === 'quit') {
      isQuitting = true;
      app.quit();
      return;
    }

    // Show close dialog
    showCloseDialog();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- System tray ----

function createTray() {
  try {
    tray = new Tray(appIcon || iconPath);
  } catch {
    // If icon doesn't exist, skip tray
    return;
  }

  tray.setToolTip('VisualIllusion');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'VisualIllusion', enabled: false },
    { type: 'separator' },
    {
      label: 'Показать',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    { type: 'separator' },
    {
      label: 'Дашборд',
      click: () => {
        if (mainWindow) {
          mainWindow.setSize(900, 700);
          fitToWorkArea(mainWindow);
          mainWindow.loadURL(`http://localhost:${LAUNCHER_PORT}`);
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Панель управления',
      click: () => {
        if (mainWindow) {
          mainWindow.setSize(1400, 900);
          fitToWorkArea(mainWindow);
          mainWindow.loadURL(`http://localhost:${PANEL_PORT}`);
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ---- IPC handlers for window controls ----

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => {
  if (!mainWindow) return;

  if (closeBehavior === 'hide') {
    mainWindow.hide();
    return;
  }
  if (closeBehavior === 'quit') {
    isQuitting = true;
    app.quit();
    return;
  }

  showCloseDialog();
});

ipcMain.handle('get-close-behavior', () => closeBehavior);
ipcMain.on('reset-close-behavior', () => {
  closeBehavior = 'ask';
  saveClosePrefs('ask');
});

// ---- Close dialog window ----

let closeDialogWindow = null;
let isHandlingClose = false;

function showCloseDialog() {
  // Prevent opening multiple dialogs
  if (closeDialogWindow && !closeDialogWindow.isDestroyed()) {
    closeDialogWindow.focus();
    return;
  }

  // Don't use parent/modal — it causes mainWindow to close when dialog closes
  closeDialogWindow = new BrowserWindow({
    width: 420,
    height: 230,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    backgroundColor: '#18181b',
    icon: appIcon || iconPath,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-dialog.js'),
    },
  });

  // Center dialog over main window
  if (mainWindow) {
    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    closeDialogWindow.setPosition(
      Math.round(wx + (ww - 420) / 2),
      Math.round(wy + (wh - 230) / 2)
    );
  }

  closeDialogWindow.loadFile(path.join(__dirname, 'close-dialog.html'));
  closeDialogWindow.once('ready-to-show', () => closeDialogWindow.show());

  const handler = (_event, action, remember) => {
    ipcMain.removeListener('close-dialog-response', handler);

    if (remember && (action === 'hide' || action === 'quit')) {
      closeBehavior = action;
      saveClosePrefs(action);
    }

    isHandlingClose = true;

    // Destroy dialog (avoid triggering extra close events)
    if (closeDialogWindow && !closeDialogWindow.isDestroyed()) {
      closeDialogWindow.destroy();
    }
    closeDialogWindow = null;

    // Perform action on main window
    if (action === 'hide') {
      mainWindow?.hide();
    } else if (action === 'quit') {
      isQuitting = true;
      app.quit();
    }
    // 'cancel' → do nothing, just close the dialog

    isHandlingClose = false;
  };

  ipcMain.removeAllListeners('close-dialog-response');
  ipcMain.on('close-dialog-response', handler);

  closeDialogWindow.on('closed', () => {
    ipcMain.removeListener('close-dialog-response', handler);
    closeDialogWindow = null;
  });
}

// ---- Wait for HTTP server ----

function waitForServer(port, timeout = 60000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (Date.now() - start > timeout) return resolve(false);
      const req = http.get(`http://localhost:${port}/api/status`, (res) => {
        if (res.statusCode === 200) return resolve(true);
        res.resume();
        setTimeout(check, 500);
      });
      req.on('error', () => setTimeout(check, 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 500); });
    };
    check();
  });
}

// ---- Single instance lock ----

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ---- App ready ----
  app.whenReady().then(async () => {
    // PROTECTION: Check environment & integrity
    _checkEnvironment();
    
    if (!_verifyIntegrity()) {
      dialog.showErrorBox('Ошибка целостности', 'Файлы приложения повреждены или были изменены. Переустановите приложение.');
      app.exit(1);
      return;
    }

    // PROTECTION: Start anti-debug monitor
    _startDebugWatch();

    loadClosePrefs();
    createWindow();
    createTray();

    // Start the launcher backend (services, tunnels, etc.)
    const launcher = require('../launcher');
    launcher.main();

    // Wait for the launcher GUI server to come up
    const ready = await waitForServer(LAUNCHER_PORT);
    if (ready && mainWindow) {
      mainWindow.loadURL(`http://localhost:${LAUNCHER_PORT}`);
    } else if (mainWindow) {
      // Timeout — show error
      mainWindow.loadURL(`data:text/html;charset=utf-8,
        <html><body style="background:#09090b;color:#fafafa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
        <div>
          <h2 style="color:#f87171">Ошибка запуска</h2>
          <p style="color:#71717a;margin-top:12px">Не удалось запустить сервисы.<br>Проверьте логи и перезапустите приложение.</p>
        </div>
        </body></html>`);
    }
  });
}

// ---- Cleanup ----

app.on('before-quit', () => {
  isQuitting = true;
  if (_debugCheckInterval) clearInterval(_debugCheckInterval);
  try {
    const launcher = require('../launcher');
    if (typeof launcher.cleanup === 'function') launcher.cleanup();
  } catch (e) {
    console.error('[Electron] Cleanup error:', e.message);
  }
});

app.on('window-all-closed', () => {
  // Never auto-quit: main window can be hidden in tray
  // Quit only happens explicitly via tray menu or close dialog "quit" button
});
