const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onRoundData: (callback) => ipcRenderer.on('round-data', (_event, payload) => callback(payload)),
  onSessionState: (callback) => ipcRenderer.on('session-state', (_event, active) => callback(active)),
  onEndSessionConfirmation: (callback) => ipcRenderer.on('end-session-confirmation', (_event, visible) => callback(visible)),
  onAppearance: (callback) => ipcRenderer.on('appearance-data', (_event, payload) => callback(payload)),
  onHotkeys: (callback) => ipcRenderer.on('hotkeys-data', (_event, payload) => callback(payload)),
  onGameState: (callback) => ipcRenderer.on('game-state', (_event, state) => callback(state)),
  onPersistState: (callback) => ipcRenderer.on('persist-state', (_event, persistent) => callback(persistent)),
  onTheme: (callback) => ipcRenderer.on('theme-data', (_event, theme) => callback(theme)),
  saveNote: (text) => ipcRenderer.send('save-note', text),
  updateSessionDetails: (details) => ipcRenderer.invoke('update-session-details', details),
  getSessionDetails: (sessionId = null) => ipcRenderer.invoke("get-session-details", sessionId),
  updateClosedSessionDetails: (id, details) => ipcRenderer.invoke("update-closed-session-details", id, details),
  onEditSessionDetails: (callback) => ipcRenderer.on("edit-session-details", (_event, sessionId) => { callback(sessionId); }),
  startSession: () => ipcRenderer.send('start-session'),
  confirmEndSession: () => ipcRenderer.send('end-session-confirmed'),
  cancelEndSession: () => ipcRenderer.send('end-session-cancelled'),
  hide: () => ipcRenderer.send('hide-overlay'),
  navRound: (direction) => ipcRenderer.send('nav-round', direction),
  openSettings: () => ipcRenderer.send('open-settings'),
  togglePersist: () => ipcRenderer.send('notepad-toggle-persist')
});
