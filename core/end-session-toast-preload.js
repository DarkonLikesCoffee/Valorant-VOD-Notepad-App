const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('endSessionToast', {
  onTheme: (callback) => ipcRenderer.on('theme-data', (_event, theme) => callback(theme))
});
