const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mainApp", {
  // Scratch pad -- reuses the exact same on-disk file and IPC channel
  // the overlay's scratch panel already uses, just pulled on demand
  // instead of pushed when a floating window opens.
  getScratch: () => ipcRenderer.invoke("get-scratch"),
  saveScratch: (text) => ipcRenderer.send("scratch-save", text),

  // Session history -- reuses the existing list/open channels as-is.
  listSessions: () => ipcRenderer.invoke("list-sessions"),
  getSession: (id) => ipcRenderer.invoke("get-session", id),
  getSessionDetails: (sessionId = null) =>
  ipcRenderer.invoke("get-session-details", sessionId),
  updateClosedSessionDetails: (id, details) =>
  ipcRenderer.invoke("update-closed-session-details", id, details),
  openSession: (mdFile) => ipcRenderer.send("open-session", mdFile),
  deleteSession: (id) =>
  ipcRenderer.invoke("delete-session", id),

  // Settings -- the embedded Settings tab talks to the exact same
  // save-settings/get-settings channels the floating overlay panel uses,
  // via settings-form.js, so there is only ever one settings brain, always
  // in sync no matter which UI touched it last.
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (data) => ipcRenderer.send("save-settings", data),
  onSettingsPush: (cb) =>
    ipcRenderer.on("settings-data", (_e, data) => cb(data)),

  onTheme: (cb) => ipcRenderer.on("theme-data", (_e, theme) => cb(theme)),
  onSelectTab: (cb) =>
    ipcRenderer.on("main-window-select-tab", (_event, tab) => cb(tab)),
  onSessionsRefresh: (cb) =>
    ipcRenderer.on("main-sessions-refresh", () => cb()),

  // Window controls -- needed now that the window is frameless (see
  // main-window.js) and no longer has the OS's own minimize/maximize/
  // close buttons. The custom title bar's three buttons call these.
  minimize: () => ipcRenderer.send("main-window-minimize"),
  toggleMaximize: () => ipcRenderer.send("main-window-toggle-maximize"),
  closeWindow: () => ipcRenderer.send("main-window-close"),
  startSession: () => ipcRenderer.send("start-session"),
  endSession: () => ipcRenderer.send("end-session"),

  previewTheme: (theme) => ipcRenderer.send("preview-theme", theme),
});
