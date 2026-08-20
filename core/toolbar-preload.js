const { contextBridge, ipcRenderer } = require('electron');

// ---- LESSON: this file is the ONLY bridge between a button click
// (toolbar.html, sandboxed, can't touch Electron/Node directly) and the
// actual logic (main.js, the "main process", has full access). Every
// function below just forwards a named message over IPC -- it does NOT
// do the actual work itself. For each one to work, main.js needs a
// matching `ipcMain.on('exact-same-name', ...)`.
//
// IMPORTANT: the name passed to exposeInMainWorld (below: 'toolbarApi')
// must NOT collide with anything that already exists on `window`.
// `window.toolbar` is actually a real, built-in browser property (an old
// leftover from the 90s, used to check if a browser's own toolbar UI is
// visible) -- every Chromium window already has one before your preload
// script even runs. Trying to expose your own API under a name that's
// already taken makes contextBridge throw immediately, which silently
// kills the ENTIRE preload script -- none of your functions get
// attached at all, which is exactly why every button failed the same
// way. General rule for next time: prefix/suffix your exposed API names
// (e.g. `toolbarApi`, `mainApp`, `settingsApi`) rather than using a bare
// word that a browser might already use for something.
contextBridge.exposeInMainWorld('toolbarApi', {
  openNotepad: () => { console.log('[toolbar] openNotepad clicked'); ipcRenderer.send('toolbar-open-notepad'); },
  openScratch: () => { console.log('[toolbar] openScratch clicked'); ipcRenderer.send('toolbar-open-scratch'); },
  openSessions: () => { console.log('[toolbar] openSessions clicked'); ipcRenderer.send('toolbar-open-sessions'); },
  openBrowser: () => { console.log('[toolbar] openBrowser clicked'); ipcRenderer.send('toolbar-open-browser'); },
  openSettings: () => { console.log('[toolbar] openSettings clicked'); ipcRenderer.send('toolbar-open-settings'); },
  toggleLock: () => { console.log('[toolbar] toggleLock clicked'); ipcRenderer.send('toggle-lock'); },
  manualRound: () => { console.log('[toolbar] manualRound clicked'); ipcRenderer.send('toolbar-manual-round'); },
  closeOverlay: () => { console.log('[toolbar] closeOverlay clicked'); ipcRenderer.send('toolbar-close-overlay'); },
  startSession: () => { console.log('[toolbar] startSession clicked'); ipcRenderer.send('start-session'); },
  endSession: () => { console.log('[toolbar] endSession clicked'); ipcRenderer.send('toolbar-end-session'); },
  onLockState: (callback) => ipcRenderer.on('lock-state', (_event, locked) => callback(locked)),
  onTheme: (callback) => ipcRenderer.on('theme-data', (_event, theme) => callback(theme))
});
