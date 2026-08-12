const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  onSettings: (callback) => {
    ipcRenderer.on('settings-data', (_event, data) => callback(data));
  },
  save: (data) => ipcRenderer.send('save-settings', data),
  previewTheme: (theme) => ipcRenderer.send('preview-theme', theme),
  close: () => ipcRenderer.send('close-settings')
});