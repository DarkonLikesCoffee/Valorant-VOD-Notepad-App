/**
 * Registers IPC handlers for session data used by the session-history UI.
 *
 * UI/window lifecycle handlers stay in the Electron entry point; file-backed
 * session-history operations are delegated to SessionArchiveStore.
 */
function registerSessionIpc({ ipcMain, store, getActiveSession }) {
  ipcMain.handle("list-sessions", async () => store.listSessions());

  ipcMain.handle("get-session", async (_event, id) => store.getSession(id));

  ipcMain.handle("update-closed-session-details", (_event, id, details) => {
    const activeSession = getActiveSession();
    if (activeSession && activeSession.active && activeSession.id === id) {
      return activeSession.updateDetails(details);
    }
    return store.updateClosedSessionDetails(id, details);
  });

  ipcMain.handle("delete-session", (_event, id) => {
    const activeSession = getActiveSession();
    if (activeSession && activeSession.active && activeSession.id === id) {
      return false;
    }
    return store.deleteSession(id);
  });

  ipcMain.handle("update-session-details", (_event, details) => {
    const activeSession = getActiveSession();
    return activeSession ? activeSession.updateDetails(details) : false;
  });

  ipcMain.handle("get-session-details", (_event, sessionId = null) =>
    store.getSessionDetails(sessionId, getActiveSession()),
  );
}

module.exports = { registerSessionIpc };
