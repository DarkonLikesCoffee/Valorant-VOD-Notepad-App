"use strict";

/**
 * Keeps the frameless main window's native-style controls out of the
 * application's large Electron entry point.
 */
function registerMainWindowIpc({ ipcMain, getMainWindow, openSettings = () => {} }) {
  ipcMain.on("main-window-minimize", () => {
    console.log("[main-window-ipc] minimize received");
    const mainWin = getMainWindow();
    if (mainWin) mainWin.minimize();
  });

  ipcMain.on("main-window-toggle-maximize", () => {
    console.log("[main-window-ipc] toggle-maximize received");
    const mainWin = getMainWindow();
    if (!mainWin) return;
    if (mainWin.isMaximized()) mainWin.unmaximize();
    else mainWin.maximize();
  });

  ipcMain.on("main-window-close", () => {
    console.log("[main-window-ipc] close received");
    const mainWin = getMainWindow();
    if (mainWin) mainWin.close();
  });

  ipcMain.on("open-settings", () => openSettings());
  ipcMain.on("toolbar-open-settings", () => openSettings());
}

module.exports = { registerMainWindowIpc };
