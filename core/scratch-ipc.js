"use strict";

/**
 * Registers the Scratch Pad channels. Panel visibility stays in the app
 * controller; file persistence is delegated to ScratchStore.
 */
function registerScratchIpc({ ipcMain, store, onHide }) {
  ipcMain.handle("get-scratch", () => store.load());
  ipcMain.on("scratch-save", (_event, text) => store.save(text));
  ipcMain.on("scratch-hide", () => onHide());
}

module.exports = { registerScratchIpc };
