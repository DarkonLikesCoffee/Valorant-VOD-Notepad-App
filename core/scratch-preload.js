const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scratch', {
  onLoad: (callback) => ipcRenderer.on('scratch-load', (_event, text) => callback(text)),
  onTheme: (callback) => ipcRenderer.on('theme-data', (_event, theme) => callback(theme)),
  onPersistState: (callback) => ipcRenderer.on('persist-state', (_event, persistent) => callback(persistent)),
  save: (text) => ipcRenderer.send('scratch-save', text),
  hide: () => ipcRenderer.send('scratch-hide'),
  togglePersist: () => ipcRenderer.send('scratch-toggle-persist')
});