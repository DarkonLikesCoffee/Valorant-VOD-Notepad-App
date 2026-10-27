const {
  app,
  globalShortcut,
  ipcMain,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { SessionManager } = require("../../core/session");
const {
  createFloatingWindow,
  defaultPositionFor,
  clampToScreen,
} = require("../../core/window");
const { createToolbarWindow } = require("../../core/toolbar-window");
const { createScratchWindow } = require("../../core/scratch-window");
const { createSessionsWindow } = require("../../core/sessions-window");
const { createBrowserWindow } = require("../../core/browser-window");
const { createBackdropWindow } = require("../../core/overlay-backdrop");
const { createEndSessionToastWindow } = require("../../core/end-session-toast");
const { createMainWindow } = require("../../core/main-window");
const { WindowManager } = require("../../core/window-manager");
const settingsStore = require("../../core/settings-store");
const { RoundWatcher } = require("./round-watcher");
const { TabCapture } = require("./tab-capture");
const { FocusWatcher } = require("./focus-watcher");
const { SessionArchiveStore } = require("../../core/session-archive-store");
const { registerSessionIpc } = require("../../core/session-ipc");
const { WindowBounds } = require("../../core/window-bounds");
const { registerMainWindowIpc } = require("../../core/main-window-ipc");
const { registerBrowserIpc } = require("../../core/browser-ipc");
const { ScratchStore } = require("../../core/scratch-store");
const { registerScratchIpc } = require("../../core/scratch-ipc");
const { registerConfiguredHotkeys } = require("../../core/hotkey-registry");
const { OverlayController } = require("../../core/overlay-controller");
const { createTray } = require("../../core/tray");

// Only one copy of this app should ever run at once. Without this, a
// crashed/frozen instance left running in the background (e.g. after
// force-closing just the terminal, which doesn't always kill the actual
// background process) will silently fight any new instance you launch
// over the global hotkeys -- only one process can hold a given hotkey,
// so the new instance's windows would sit on screen never responding to
// anything, while a completely different, possibly-frozen instance
// owns your keypresses instead. This is exactly the "windows never
// close no matter what I press" symptom.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const NOTES_DIR = path.join(app.getPath("documents"), "ValorantVODNotes");
const sessionArchiveStore = new SessionArchiveStore(NOTES_DIR);
const SETTINGS_PATH = path.join(app.getPath("userData"), "settings.json");
const scratchStore = new ScratchStore(NOTES_DIR);

const wm = new WindowManager();

let notepadWin = null;
let toolbarWin = null;
let scratchWin = null;
let sessionsWin = null;
let backdropWin = null;
let mainWin = null;
let browserWin = null;
let endSessionToastWin = null;
let tray = null;
let isQuitting = false;

let session = null;
let watcher = null;
let tabCapture = null;
let focusWatcher = null;
let settings = settingsStore.load(SETTINGS_PATH);
let currentGameState = "not-running";

// LOCK: position/size lock for every overlay window at once. Toolbar-only
// concept -- toggled from the toolbar's lock button.
let locked = false;

// PERSIST: separate, per-window concept. A panel in this set stays
// visible when overlayController.closeOverlay() runs instead of being hidden -- this is
// what lets you keep the notepad (or scratch pad) open and readable
// while playing, without the whole overlay/backdrop being up. Only
// notepad and scratch ever go in here (see their own pin buttons).
const overlayState = {
  persistentPanels: new Set(),
  overlayOpen: false,
  overlayWantsOpen: false,
  visiblePanels: new Set(),
  panelsHiddenForFocusLoss: new Set(),
  valorantFocused: false,
};

// ---- Unified overlay state ----
// overlayState.overlayOpen: is the backdrop + any panels actually visible right now.
// overlayState.overlayWantsOpen: the user's intent to keep the overlay open. The
// focus watcher temporarily hides it outside VALORANT and restores it
// when the game regains focus.
// overlayState.visiblePanels: which panel ids (notepad/toolbar/scratch/sessions) are
// currently part of the open overlay.

let endSessionConfirmationPending = false;
let endSessionEnterShortcutRegistered = false;
let endSessionConfirmationTimer = null;

// Always reflects whether Valorant is the current OS-focused window,
// updated continuously by focus-watcher regardless of whether the
// overlay is open. Used to gate every "open the overlay" entry point --
// the overlay should only ever be openable while actually tabbed into
// the game, same as Valorant Tracker.


const PANEL_IDS = ["notepad", "toolbar", "scratch", "sessions", "browser"];

function pushRoundToRenderer() {
  if (!notepadWin || !session || !session.active) return;
  const payload = session.currentRoundPayload();
  if (payload) notepadWin.webContents.send("round-data", payload);
}
function pushSessionState() {
  if (notepadWin)
    notepadWin.webContents.send("session-state", !!(session && session.active));
}
function pushEndSessionConfirmation(visible) {
  if (notepadWin)
    notepadWin.webContents.send("end-session-confirmation", visible);
}
function pushAppearance() {
  if (notepadWin)
    notepadWin.webContents.send("appearance-data", settings.notepad);
}
function pushHotkeys() {
  if (notepadWin) notepadWin.webContents.send("hotkeys-data", settings.hotkeys);
}
function pushGameState(state) {
  if (notepadWin) notepadWin.webContents.send("game-state", state);
}
function pushThemeToAll() {
  [
    notepadWin,
    toolbarWin,
    scratchWin,
    sessionsWin,
    mainWin,
    endSessionToastWin,
  ].forEach((w) => {
    if (w) w.webContents.send("theme-data", settings.theme);
  });
}

// Live-preview only -- broadcasts a theme name to every window WITHOUT
// touching settings.theme or saving anything to disk. This is what makes
// switching the dropdown in Settings show up everywhere immediately,
// before Save is ever pressed. If the user closes Settings without
// saving, closeSettingsPanel() below calls the real pushThemeToAll() to
// snap everything back to the actually-committed theme.
function previewThemeToAll(theme) {
  // console.log('[theme-preview] broadcasting:', theme);

  [notepadWin, toolbarWin, scratchWin, sessionsWin, mainWin].forEach((w) => {
    if (w) {
      // console.log('[theme-preview] sending to window');
      w.webContents.send("theme-data", theme);
    }
  });
}
// LOCK's UI only lives on the toolbar (the lock icon), so this only
// needs to reach that one window -- unlike theme, which every window
// needs to know about.
function pushLockStateToAll() {
  if (toolbarWin) toolbarWin.webContents.send("lock-state", locked);
}

// PERSIST is per-panel, so tell just that one panel's window whether
// IT specifically is currently pinned-to-stay-open.
function pushPersistState(id) {
  const w = getPanelWin(id);
  if (w) w.webContents.send("persist-state", overlayState.persistentPanels.has(id));
}

// ---- Lock: locks every overlay window's position AND size ----
// win.setMovable(false) / win.setResizable(false) are Electron's own,
// built-in controls -- unlike the old CSS "-webkit-app-region: drag"
// toggle trick (which only ever touched the notepad, and even then only
// blocked dragging, never resizing), these two calls work identically on
// ANY window and can't be bypassed by dragging an edge to resize. This
// is the reliable way to lock a window from the main process, so this
// is the one true source of truth for "is locking currently enforced" --
// nothing else in the app should try to lock movement/size on its own.
//
// TO EXTEND THIS LATER: if you ever add another panel window, just add
// its variable to the array below -- nothing else needs to change.
function applyLockState() {
  [notepadWin, toolbarWin, scratchWin, sessionsWin, browserWin].forEach((w) => {
    if (!w) return;
    w.setMovable(!locked);
    w.setResizable(!locked);
  });
}

// ---- Window bounds persistence ----
// Debounced per-window save whenever the user drags/resizes -- flips
// that window to "custom" mode in settings automatically. Ignores any
// resize/move event that just echoes bounds WE set programmatically
// The WindowBounds helper tracks programmatic bounds changes so delayed
// native events are not mistaken for user-driven movement or resizing.
// Every place in this file that changes `settings` should call this
// instead of settingsStore.save() directly. Saving to disk was already
// happening from three separate spots (dragging a window, the toolbar's
// theme toggle, and Settings' Save button) -- but only the Save button
// was telling the main window's embedded Settings tab about it, which is
// exactly why toggling theme from the toolbar looked right in the
// overlay's own settings panel (it re-reads the live `settings` object
// fresh every time it opens) but stayed stale in the main window (which
// stays mounted and never "re-opens" to pick up a fresh read).
// TO REUSE THIS LATER: any new code path that changes `settings` should
// call persistSettings() at the end, not settingsStore.save() directly --
// that's what guarantees every currently-open settings UI, no matter
// which one, always reflects reality.
function persistSettings() {
  settingsStore.save(SETTINGS_PATH, settings);
  if (mainWin) mainWin.webContents.send("settings-data", settings);
}

const windowBounds = new WindowBounds({
  getSettings: () => settings,
  settingsStore,
  defaultPositionFor,
  clampToScreen,
  persistSettings: () => persistSettings(),
});

// ---- Notepad ----
function createNotepad() {
  const size = settingsStore.sizeFor("notepad", settings.notepad.size);
  const rawPos =
    settings.notepad.position.mode === "custom" &&
    settings.notepad.position.x !== null
      ? { x: settings.notepad.position.x, y: settings.notepad.position.y }
      : defaultPositionFor(settings.notepad.position.preset, size);
  const pos = clampToScreen(rawPos, size);

  notepadWin = createFloatingWindow({
    width: size.width,
    height: size.height,
    x: pos.x,
    y: pos.y,
    preload: path.join(__dirname, "..", "..", "core", "preload.js"),
    htmlFile: path.join(__dirname, "..", "..", "core", "overlay.html"),
    minWidth: 260,
    minHeight: 200,
  });
  wm.register(notepadWin);
  windowBounds.watch(notepadWin, "notepad");
}

// Manual fallback: bumps the LIVE round by one by hand, for whenever OCR
// misses a change (alt-tab timing, weird HUD moment, etc). Deliberately
// does NOT touch the watcher's internal round tracking -- the watcher's
// forward-only guard (see round-watcher.js) means it will just pick back
// up seamlessly once the real on-screen score changes, crediting the
// correct round's outcome without any extra bookkeeping needed here.
function manualNewRound() {
  if (!session || !session.active) return;
  session.newRound(session.round + 1);
  pushRoundToRenderer();
}

function startSession() {
  if (!session || session.active) return false;
  const started = session.start();
  if (!started) return false;
  if (watcher) watcher.resetRoundTracking();
  setEndSessionConfirmationPending(false);
  pushSessionState();
  pushRoundToRenderer();
  return true;
}

function endSession() {
  if (!session || !session.active) return false;

  session.end();
  setEndSessionConfirmationPending(false);
  pushSessionState();
  return true;
}

function setEndSessionConfirmationPending(pending) {
  endSessionConfirmationPending = pending;
  pushEndSessionConfirmation(pending);

  if (!pending && endSessionConfirmationTimer) {
    clearTimeout(endSessionConfirmationTimer);
    endSessionConfirmationTimer = null;
  }

  if (!pending && endSessionEnterShortcutRegistered) {
    globalShortcut.unregister("Return");
    endSessionEnterShortcutRegistered = false;
  }
  if (!pending && endSessionToastWin) endSessionToastWin.hide();
}

function registerEndSessionEnterShortcut() {
  if (
    endSessionEnterShortcutRegistered ||
    globalShortcut.isRegistered("Return")
  )
    return;
  try {
    endSessionEnterShortcutRegistered = globalShortcut.register(
      "Return",
      () => {
        if (endSessionConfirmationPending && overlayState.valorantFocused) endSession();
      },
    );
  } catch (err) {
    console.error(
      "Unable to register Enter for End Session confirmation:",
      err.message,
    );
  }
}

function showEndSessionToast() {
  if (!endSessionToastWin || endSessionToastWin.isDestroyed()) {
    endSessionToastWin = createEndSessionToastWindow();
    endSessionToastWin.webContents.once("did-finish-load", () => {
      endSessionToastWin.webContents.send("theme-data", settings.theme);
      if (endSessionConfirmationPending && overlayState.valorantFocused)
        endSessionToastWin.showInactive();
    });
    return;
  }
  endSessionToastWin.webContents.send("theme-data", settings.theme);
  endSessionToastWin.showInactive();
}

function requestEndSession({ showOverlay = false } = {}) {
  if (
    !session ||
    !session.active ||
    endSessionConfirmationPending ||
    !overlayState.valorantFocused
  )
    return false;
  setEndSessionConfirmationPending(true);
  registerEndSessionEnterShortcut();
  if (showOverlay) {
    overlayController.ensurePanelShown("notepad");
  } else {
    showEndSessionToast();
    endSessionConfirmationTimer = setTimeout(() => cancelEndSession(), 5000);
  }
  return true;
}

function cancelEndSession() {
  if (!endSessionConfirmationPending) return;
  setEndSessionConfirmationPending(false);
}

// ---- Toolbar ----
function createToolbar() {
  const size = settingsStore.sizeFor("toolbar", settings.toolbar.size);
  const rawPos =
    settings.toolbar.position.mode === "custom" &&
    settings.toolbar.position.x !== null
      ? { x: settings.toolbar.position.x, y: settings.toolbar.position.y }
      : defaultPositionFor(settings.toolbar.position.preset, size);
  const pos = clampToScreen(rawPos, size);

  toolbarWin = createToolbarWindow(size, pos);
  wm.register(toolbarWin);
  windowBounds.watch(toolbarWin, "toolbar");
}

// ---- Scratch notepad ----
function ensureScratchWindow() {
  if (scratchWin) return;
  const size = settingsStore.sizeFor("scratch", settings.scratch.size);
  const rawPos =
    settings.scratch.position.mode === "custom" &&
    settings.scratch.position.x !== null
      ? { x: settings.scratch.position.x, y: settings.scratch.position.y }
      : defaultPositionFor(settings.scratch.position.preset, size);
  const pos = clampToScreen(rawPos, size);
  scratchWin = createScratchWindow(size, pos);
  wm.register(scratchWin);
  windowBounds.watch(scratchWin, "scratch");
}

function loadScratchIntoWindow() {
  const text = scratchStore.load();
  scratchWin.webContents.send("theme-data", settings.theme);
  scratchWin.webContents.send("scratch-load", text);
}

// ---- Session browser ----
function ensureSessionsWindow() {
  if (sessionsWin) return;
  const size = settingsStore.sizeFor("sessions", settings.sessions.size);
  const rawPos =
    settings.sessions.position.mode === "custom" &&
    settings.sessions.position.x !== null
      ? { x: settings.sessions.position.x, y: settings.sessions.position.y }
      : defaultPositionFor(settings.sessions.position.preset, size);
  const pos = clampToScreen(rawPos, size);
  sessionsWin = createSessionsWindow(size, pos);
  wm.register(sessionsWin);
  windowBounds.watch(sessionsWin, "sessions");
}

// ---- Browser browser ----
function ensureBrowserWindow() {
  if (browserWin) return;

  const size = {
    width: 900,
    height: 650,
  };

  const rawPos = defaultPositionFor("center", size);
  const pos = clampToScreen(rawPos, size);

  browserWin = createBrowserWindow(size, pos);

  const webView = browserWin.browserWebView;

  webView.webContents.on("did-navigate", (_event, url) => {
    browserWin.webContents.send("browser-url-changed", url);
  });

  webView.webContents.on("did-navigate-in-page", (_event, url) => {
    browserWin.webContents.send("browser-url-changed", url);
  });

  wm.register(browserWin);

  browserWin.on("closed", () => {
    browserWin = null;
  });
}

// ---- Main app window ----
// The one normal, non-overlay window -- Scratch Pad and Session History
// built in directly, plus a button into the shared Settings window.
// Independent of the overlay/game-focus gating entirely: works anytime,
// whether Valorant is running or not. Closing it (the X button) just
// hides it -- see the 'close' handler below -- so the background
// hotkeys/overlay keep working even with this window shut.
function createMainAppWindow() {
  mainWin = createMainWindow();
  wm.register(mainWin);
  mainWin.once("ready-to-show", () => {
    pushThemeToAll();
    mainWin.show();
  });
  mainWin.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWin.hide();
    }
  });
}

// ---- Unified overlay ----
// The backdrop plus whichever panel windows are "in" the overlay are
// shown/hidden together. Individual panel hotkeys add/remove that panel
// from the currently open overlay rather than opening a standalone
// window -- opening the overlay for the first time if it wasn't already.
function getPanelWin(id) {
  return {
    notepad: notepadWin,
    toolbar: toolbarWin,
    scratch: scratchWin,
    sessions: sessionsWin,
    browser: browserWin,
  }[id];
}

function showPanelWindow(id) {
  switch (id) {
    case "notepad":
      session.openForViewing();
      pushAppearance();
      pushHotkeys();
      pushThemeToAll();
      pushGameState(currentGameState);
      pushPersistState("notepad");
      pushSessionState();
      pushEndSessionConfirmation(endSessionConfirmationPending);
      pushRoundToRenderer();
      wm.showAndFocus(notepadWin);
      break;
    case "toolbar":
      pushThemeToAll();
      pushLockStateToAll();
      wm.showAndFocus(toolbarWin);
      break;
    case "scratch":
      ensureScratchWindow();
      loadScratchIntoWindow();
      pushPersistState("scratch");
      wm.showAndFocus(scratchWin);
      break;
    case "sessions":
      ensureSessionsWindow();
      sessionsWin.webContents.send("theme-data", settings.theme);
      wm.showAndFocus(sessionsWin);
      break;
    case "browser":
      ensureBrowserWindow();
      wm.showAndFocus(browserWin);
      break;
  }
  applyLockState(); // in case this panel is newly created/shown while lock was already on
}

function hidePanelWindow(id) {
  const win = getPanelWin(id);
  if (!win) return;
  if (id === "notepad" && session) session.closeViewing();
  win.hide();
}

function navRound(direction) {
  overlayController.ensurePanelShown("notepad");
  session.navigate(direction);
  pushRoundToRenderer();
}

function showBackdrop() {
  if (!backdropWin) {
    backdropWin = createBackdropWindow();
    wm.register(backdropWin);
  }
  backdropWin.show();
}

function showExistingBackdrop() {
  if (backdropWin) backdropWin.show();
}

function hideBackdrop() {
  if (backdropWin) backdropWin.hide();
}

const overlayController = new OverlayController({
  state: overlayState,
  panelIds: PANEL_IDS,
  getSettings: () => settings,
  getPanelWindow: getPanelWin,
  showPanelWindow,
  hidePanelWindow,
  showBackdrop,
  showExistingBackdrop,
  hideBackdrop,
  isGameFocused: () => overlayState.valorantFocused,
  showAndFocus: (win) => wm.showAndFocus(win),
  onPersistChange: (id) => pushPersistState(id),
});

// ---- Hotkeys ----
function registerHotkeys() {
  const handlers = {
    toggle: () => overlayController.toggleOverlay(),
    manualRound: manualNewRound,
    newSession: startSession,
    endSession: requestEndSession,
    prevRound: () => navRound("prev"),
    nextRound: () => navRound("next"),
    toolbar: () => overlayController.togglePanel("toolbar"),
    scratch: () => overlayController.togglePanel("scratch"),
    sessions: () => overlayController.togglePanel("sessions"),
  };

  registerConfiguredHotkeys({
    globalShortcut,
    hotkeys: settings.hotkeys,
    handlers,
  });

  // unregisterAll() also removes the temporary Enter confirmation shortcut,
  // so restore it if settings are saved mid-confirmation.
  endSessionEnterShortcutRegistered = false;
  if (endSessionConfirmationPending) registerEndSessionEnterShortcut();
  // Tab is handled separately by TabCapture (dynamic, foreground-scoped).
}

// If a second launch is attempted while this instance is already
// running, bring the main app window forward instead of letting two
// copies coexist.
app.on("second-instance", () => {
  if (mainWin) wm.showAndFocus(mainWin);
});

app.whenReady().then(async () => {
  session = new SessionManager(NOTES_DIR);

  createMainAppWindow();
  tray = createTray({
    Tray,
    Menu,
    nativeImage,
    showMainApp: () => {
      if (mainWin) wm.showAndFocus(mainWin);
    },
    quitApp: () => app.quit(),
  });

  createNotepad();
  createToolbar();

  watcher = new RoundWatcher({
    onRoundChange: (round, meta) => {
      if (!session || !session.active) return;
      if (meta && meta.outcome)
        session.setRoundOutcome(meta.concludedRound, meta.outcome);
      session.newRound(round);
      pushRoundToRenderer();
    },
    onStateChange: (state) => {
      currentGameState = state;
      pushGameState(state);
    },
  });
  await watcher.start();
  currentGameState = watcher.state;
  if (session && session.active) watcher.resetRoundTracking(session.round);

  tabCapture = new TabCapture({
    enabled: settings.tabCapture.enabled,
    notesDir: NOTES_DIR,
    getSessionId: () => (session && session.active ? session.id : null),
    onCaptured: (filePath) => {
      if (session && session.active) session.attachScoreboard(filePath);
    },
  });
  tabCapture.start();

  // Leaving VALORANT hides the overlay, including pinned panels. Returning
  // to the game restores exactly the panels that were open before tabbing
  // out, but never shows them in any other application.
  focusWatcher = new FocusWatcher((isValorantFocused) => {
    overlayState.valorantFocused = isValorantFocused;
    if (!isValorantFocused) {
      if (endSessionToastWin) endSessionToastWin.hide();
      overlayController.hideOverlayForFocusLoss();
    } else if (
      (overlayState.overlayWantsOpen || overlayState.panelsHiddenForFocusLoss.size > 0) &&
      !overlayState.overlayOpen
    ) {
      overlayController.restoreAfterFocusGain();
    }
  });
  focusWatcher.start();

  registerHotkeys();
});

// ---- IPC: notepad ----
ipcMain.on("save-note", (_event, text) => {
  if (session && session.active) session.saveNote(text);
});
ipcMain.on("start-session", () => startSession());
ipcMain.on("end-session", () => requestEndSession());
ipcMain.on("toolbar-end-session", () =>
  requestEndSession({ showOverlay: true }),
);
ipcMain.on("end-session-confirmed", () => endSession());
ipcMain.on("end-session-cancelled", () => cancelEndSession());
ipcMain.on("hide-overlay", () => overlayController.closeOverlay());
ipcMain.on("nav-round", (_event, direction) => navRound(direction));
ipcMain.on("toggle-lock", () => {
  locked = !locked;
  pushLockStateToAll();
  applyLockState();
});

// PERSIST toggles -- one channel per panel that HAS a persist button
// (only notepad and scratch, per the design). Each just flips that one
// id in/out of overlayState.persistentPanels and tells that panel's own window to
// update its pin icon.
ipcMain.on("notepad-toggle-persist", () => {
  if (overlayState.persistentPanels.has("notepad")) overlayState.persistentPanels.delete("notepad");
  else overlayState.persistentPanels.add("notepad");
  pushPersistState("notepad");
});
ipcMain.on("scratch-toggle-persist", () => {
  if (overlayState.persistentPanels.has("scratch")) overlayState.persistentPanels.delete("scratch");
  else overlayState.persistentPanels.add("scratch");
  pushPersistState("scratch");
});

// ---- IPC: backdrop ----
ipcMain.on("backdrop-click", () => overlayController.closeOverlay());

// ---- IPC: toolbar ----
// Each line here prints to the TERMINAL (this is main-process code, not
// renderer code) -- so if you click a button and the matching
// [toolbar-ipc] line never appears here, but the [toolbar] log DID show
// up in that window's DevTools, the problem is a channel-name mismatch
// between here and toolbar-preload.js. If BOTH log, but nothing visibly
// happens, the bug is inside whatever function is being called
// (togglePanel, openSettingsWindow, etc.) -- next step would be adding
// logging inside that function specifically.
ipcMain.on("toolbar-open-notepad", () => {
  console.log("[toolbar-ipc] open-notepad received");
  overlayController.togglePanel("notepad");
});
ipcMain.on("toolbar-open-scratch", () => {
  console.log("[toolbar-ipc] open-scratch received");
  overlayController.togglePanel("scratch");
});
ipcMain.on("toolbar-open-sessions", () => {
  console.log("[toolbar-ipc] open-sessions received");
  overlayController.togglePanel("sessions");
});
ipcMain.on("toolbar-open-browser", () => {
  console.log("[toolbar-ipc] open-browser received");
  overlayController.togglePanel("browser");
});
ipcMain.on("toolbar-manual-round", () => {
  console.log("[toolbar-ipc] manual-round received");
  manualNewRound();
});
ipcMain.on("toolbar-close-overlay", () => {
  console.log("[toolbar-ipc] close-overlay received");
  overlayController.closeOverlay();
});

// ---- IPC: main window controls ----
registerMainWindowIpc({
  ipcMain,
  getMainWindow: () => mainWin,
});

// ---- IPC: scratch notepad ----
registerScratchIpc({
  ipcMain,
  store: scratchStore,
  onHide: () => overlayController.closePanel("scratch"),
});

// ---- IPC: session browser ----
registerSessionIpc({
  ipcMain,
  store: sessionArchiveStore,
  getActiveSession: () => session,
});
ipcMain.on("open-session", (_event, mdFile) => {
  if (
    typeof mdFile !== "string" ||
    path.basename(mdFile) !== mdFile ||
    !/^session-[A-Za-z0-9_-]+\.md$/.test(mdFile)
  ) {
    return;
  }
  shell.openPath(path.join(NOTES_DIR, mdFile));
});
ipcMain.on("sessions-hide", () => overlayController.closePanel("sessions"));

// ---- IPC: browser ----
registerBrowserIpc({
  ipcMain,
  getBrowserWindow: () => browserWin,
  onClose: () => overlayController.closePanel("browser"),
});

// ---- IPC: settings ----

// Lets any renderer ask for the current settings on demand -- the
// embedded Settings tab in the main window uses this to load its first
// render, since (unlike the floating overlay panel) it can already be
// on-screen before any "open settings" action has fired a push.
ipcMain.handle("get-settings", () => JSON.parse(JSON.stringify(settings)));

ipcMain.on("preview-theme", (_event, theme) => {
  // console.log('[theme-preview] IPC received:', theme);
  previewThemeToAll(theme);
});

ipcMain.on("save-settings", (_event, data) => {
  const merged = settingsStore.load(SETTINGS_PATH); // start from valid defaults+existing
  settings = {
    hotkeys: { ...settingsStore.DEFAULTS.hotkeys, ...(data.hotkeys || {}) },
    theme: data.theme || merged.theme,
    notepad: { ...merged.notepad, ...(data.notepad || {}) },
    toolbar: { ...merged.toolbar, ...(data.toolbar || {}) },
    scratch: { ...merged.scratch, ...(data.scratch || {}) },
    sessions: { ...merged.sessions, ...(data.sessions || {}) },
    tabCapture: { ...merged.tabCapture, ...(data.tabCapture || {}) },
  };
  persistSettings();

  registerHotkeys();
  if (notepadWin) windowBounds.apply(notepadWin, "notepad");
  if (toolbarWin) windowBounds.apply(toolbarWin, "toolbar");
  if (scratchWin) windowBounds.apply(scratchWin, "scratch");
  if (sessionsWin) windowBounds.apply(sessionsWin, "sessions");
  pushAppearance();
  pushHotkeys();
  pushThemeToAll();
  if (tabCapture) tabCapture.setEnabled(settings.tabCapture.enabled);
});

// Fires for every quit path (tray "Quit", the toolbar's quit button,
// Alt+F4 on a non-main window, etc.) BEFORE any window's 'close' handler
// runs -- this is what lets the main window's close handler tell a real
// quit apart from just clicking the X to hide it.
app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", async () => {
  globalShortcut.unregisterAll();
  if (watcher) await watcher.stop();
  if (tabCapture) tabCapture.stop();
  if (focusWatcher) focusWatcher.stop();
  if (tray) tray.destroy();
});

app.on("window-all-closed", () => {
  app.quit();
});
