const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dialogAPI', {
  respond: (action, remember) => ipcRenderer.send('close-dialog-response', action, remember),
});
