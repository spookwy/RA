const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installer', {
  minimize: () => ipcRenderer.invoke('minimize'),
  close: () => ipcRenderer.invoke('close'),
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
  getLogoPath: () => ipcRenderer.invoke('get-logo-path'),
  getDownloadInfo: () => ipcRenderer.invoke('get-download-info'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startInstall: (opts) => ipcRenderer.invoke('start-install', opts),
  launchApp: (installPath) => ipcRenderer.invoke('launch-app', installPath),
  onProgress: (cb) => {
    ipcRenderer.on('install-progress', (e, data) => cb(data));
  },
  onStage: (cb) => {
    ipcRenderer.on('install-stage', (e, data) => cb(data));
  },
});
