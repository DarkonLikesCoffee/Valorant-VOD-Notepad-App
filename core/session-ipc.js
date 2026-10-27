/**
 * Registers IPC handlers for session data used by the session-history UI.
 *
 * UI/window lifecycle handlers stay in the Electron entry point; file-backed
 * session-history operations are delegated to SessionArchiveStore.
 */
function registerSessionIpc({ ipcMain, store, getActiveSession }) {
  ipcMain.handle("list-sessions", async () => store.listSessions());

  ipcMain.handle("get-session", async (_event, id) => store.getSession(id));

  ipcMain.handle("update-closed-session-details", (_event, id, details) =>
    store.updateClosedSessionDetails(id, details),
  );

  ipcMain.handle("delete-session", (_event, id) => store.deleteSession(id));

  ipcMain.handle("update-session-details", (_event, details) =>
    getActiveSession().updateDetails(details),
  );

  ipcMain.handle("get-session-details", (_event, sessionId = null) =>
    store.getSessionDetails(sessionId, getActiveSession()),
  );
}

module.exports = { registerSessionIpc };
