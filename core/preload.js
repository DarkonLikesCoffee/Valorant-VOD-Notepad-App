const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onRoundData: (callback) => ipcRenderer.on('round-data', (_event, payload) => callback(payload)),
  onAppearance: (callback) => ipcRenderer.on('appearance-data', (_event, payload) => callback(payload)),
  onHotkeys: (callback) => ipcRenderer.on('hotkeys-data', (_event, payload) => callback(payload)),
  onGameState: (callback) => ipcRenderer.on('game-state', (_event, state) => callback(state)),
  onPersistState: (callback) => ipcRenderer.on('persist-state', (_event, persistent) => callback(persistent)),
  onTheme: (callback) => ipcRenderer.on('theme-data', (_event, theme) => callback(theme)),
  onVirtualKey: (callback) => ipcRenderer.on('virtual-key', (_event, payload) => callback(payload)),
  saveNote: (text) => ipcRenderer.send('save-note', text),
  hide: () => ipcRenderer.send('hide-overlay'),
  navRound: (direction) => ipcRenderer.send('nav-round', direction),
  openSettings: () => ipcRenderer.send('open-settings'),
  togglePersist: () => ipcRenderer.send('notepad-toggle-persist'),
});