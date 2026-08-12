const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backdropApi', {
  notifyClick: () => ipcRenderer.send('backdrop-click')
});
