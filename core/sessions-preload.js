const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sessions', {
  list: () => ipcRenderer.invoke('list-sessions'),
  open: (mdFile) => ipcRenderer.send('open-session', mdFile),
  onTheme: (callback) => ipcRenderer.on('theme-data', (_event, theme) => callback(theme)),
  onRefresh: (callback) => ipcRenderer.on('sessions-refresh', () => callback()),
  hide: () => ipcRenderer.send('sessions-hide')
});
