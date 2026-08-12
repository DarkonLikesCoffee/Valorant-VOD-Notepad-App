const { contextBridge, ipcRenderer } = require('electron');

console.log('[browser-preload] loaded');

contextBridge.exposeInMainWorld('browserApi', {
  goBack: () => ipcRenderer.send('browser-go-back'),
  goForward: () => ipcRenderer.send('browser-go-forward'),
  reload: () => ipcRenderer.send('browser-reload'),
  navigate: (url) => ipcRenderer.send('browser-navigate', url),
  close: () => ipcRenderer.send('browser-close'),

  onUrlChanged: (callback) => {
    ipcRenderer.on('browser-url-changed', (_event, url) => {
      callback(url);
    });
  }
});

