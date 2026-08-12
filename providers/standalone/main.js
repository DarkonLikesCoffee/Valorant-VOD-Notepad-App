const { app, globalShortcut, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { SessionManager } = require('../../core/session');
const { createFloatingWindow, defaultPositionFor, clampToScreen } = require('../../core/window');
const { createToolbarWindow } = require('../../core/toolbar-window');
const { createScratchWindow } = require('../../core/scratch-window');
const { createSessionsWindow } = require('../../core/sessions-window');
const { createBackdropWindow } = require('../../core/overlay-backdrop');
const { createMainWindow } = require('../../core/main-window');
const { WindowManager } = require('../../core/window-manager');
const settingsStore = require('../../core/settings-store');
const { RoundWatcher } = require('./round-watcher');
const { TabCapture } = require('./tab-capture');
const { FocusWatcher } = require('./focus-watcher');

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

const NOTES_DIR = path.join(app.getPath('documents'), 'ValorantVODNotes');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const SCRATCH_PATH = path.join(NOTES_DIR, 'scratchpad.md');

const wm = new WindowManager();

let notepadWin = null;
let toolbarWin = null;
let scratchWin = null;
let sessionsWin = null;
let backdropWin = null;
let mainWin = null;
let tray = null;
let isQuitting = false;

let session = null;
let watcher = null;
let tabCapture = null;
let focusWatcher = null;
let settings = settingsStore.load(SETTINGS_PATH);
let currentGameState = 'not-running';

let suppressBoundsSave = { notepad: false, toolbar: false, scratch: false, sessions: false };

// LOCK: position/size lock for every overlay window at once. Toolbar-only
// concept -- toggled from the toolbar's lock button.
let locked = false;

// PERSIST: separate, per-window concept. A panel in this set stays
// visible when closeOverlay() runs instead of being hidden -- this is
// what lets you keep the notepad (or scratch pad) open and readable
// while playing, without the whole overlay/backdrop being up. Only
// notepad and scratch ever go in here (see their own pin buttons).
let persistentPanels = new Set();

// ---- Unified overlay state ----
// overlayOpen: is the backdrop + any panels actually visible right now.
// overlayWantsOpen: the user's INTENT -- stays true even when
// focus-watcher auto-hides everything for tabbing out, so it can restore
// exactly what was showing once Valorant is focused again.
// visiblePanels: which panel ids (notepad/toolbar/scratch/sessions) are
// currently part of the open overlay.
let overlayOpen = false;
let overlayWantsOpen = false;
let visiblePanels = new Set();

// Always reflects whether Valorant is the current OS-focused window,
// updated continuously by focus-watcher regardless of whether the
// overlay is open. Used to gate every "open the overlay" entry point --
// the overlay should only ever be openable while actually tabbed into
// the game, same as Valorant Tracker.
let valorantFocused = false;

const PANEL_IDS = ['notepad', 'toolbar', 'scratch', 'sessions'];

// Guards against a window's own resize/move handler saving a bounds
// change that WE triggered programmatically (e.g. applying a preset) --
// only user-driven drags/resizes should flip a window to "custom" mode.
//
// This used to be a timing-based flag (set true, then cleared 100ms
// later). That broke for hidden panels: Electron can defer a hidden
// window's 'resize'/'move' events until it's actually shown again, which
// can be seconds later -- long after the 100ms window had closed. The fix
// is to remember exactly what bounds we last applied programmatically and
// compare against that instead of racing a timer.
let lastAppliedBounds = { notepad: null, toolbar: null, scratch: null, sessions: null };

function pushRoundToRenderer() {
  if (notepadWin) notepadWin.webContents.send('round-data', session.currentRoundPayload());
}
function pushAppearance() {
  if (notepadWin) notepadWin.webContents.send('appearance-data', settings.notepad);
}
function pushHotkeys() {
  if (notepadWin) notepadWin.webContents.send('hotkeys-data', settings.hotkeys);
}
function pushGameState(state) {
  if (notepadWin) notepadWin.webContents.send('game-state', state);
}
function pushThemeToAll() {
  [notepadWin, toolbarWin, scratchWin, sessionsWin, mainWin].forEach((w) => {
    if (w) w.webContents.send('theme-data', settings.theme);
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
      w.webContents.send('theme-data', theme);
    }
  });
}
// LOCK's UI only lives on the toolbar (the lock icon), so this only
// needs to reach that one window -- unlike theme, which every window
// needs to know about.
function pushLockStateToAll() {
  if (toolbarWin) toolbarWin.webContents.send('lock-state', locked);
}

// PERSIST is per-panel, so tell just that one panel's window whether
// IT specifically is currently pinned-to-stay-open.
function pushPersistState(id) {
  const w = getPanelWin(id);
  if (w) w.webContents.send('persist-state', persistentPanels.has(id));
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
  [notepadWin, toolbarWin, scratchWin, sessionsWin].forEach((w) => {
    if (!w) return;
    w.setMovable(!locked);
    w.setResizable(!locked);
  });
}

// ---- Window bounds persistence ----
// Debounced per-window save whenever the user drags/resizes -- flips
// that window to "custom" mode in settings automatically. Ignores any
// resize/move event that just echoes bounds WE set programmatically
// (see lastAppliedBounds above), no matter how long after the fact that
// event actually arrives.
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
  if (mainWin) mainWin.webContents.send('settings-data', settings);
}

function watchWindowBounds(win, windowId) {
  let timer = null;
  // Tracks WHICH kind(s) of change happened during the debounce window --
  // needed because dragging a corner (not just an edge) fires BOTH
  // 'resize' and 'move' as separate native events, and each one resets
  // the shared timer below. Without this, whichever event fired LAST
  // would silently win and the other's change would never get saved at
  // all -- so this accumulates both if both genuinely occurred, instead
  // of only remembering the most recent one.
  const pendingKinds = new Set();
  const save = (kind) => {
    const b = win.getBounds();
    const applied = lastAppliedBounds[windowId];
    if (applied && b.x === applied.x && b.y === applied.y && b.width === applied.width && b.height === applied.height) {
      return; // this is our own programmatic change echoing back, not a real user drag
    }
    pendingKinds.add(kind);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const b2 = win.getBounds();
      // Only touch the field(s) that actually changed -- a pure drag
      // (move only) must never flip size to custom, and a pure edge-drag
      // resize must never flip position to custom. Dragging a corner
      // genuinely changes both, so both get updated in that case, and
      // only in that case.
      if (pendingKinds.has('resize')) {
        settings[windowId].size = { mode: 'custom', preset: settings[windowId].size.preset, width: b2.width, height: b2.height };
      }
      if (pendingKinds.has('move')) {
        settings[windowId].position = { mode: 'custom', preset: settings[windowId].position.preset, x: b2.x, y: b2.y };
      }
      pendingKinds.clear();
      persistSettings();
    }, 400);
  };
  win.on('resize', () => save('resize'));
  win.on('move', () => save('move'));
}

function applyBounds(win, windowId) {
  const size = settingsStore.sizeFor(windowId, settings[windowId].size);
  const rawPos = settings[windowId].position.mode === 'custom' && settings[windowId].position.x !== null
    ? { x: settings[windowId].position.x, y: settings[windowId].position.y }
    : defaultPositionFor(settings[windowId].position.preset, size);
  const pos = clampToScreen(rawPos, size); // keeps it fully on-screen even if a saved custom x/y + new size would push it off an edge
  const bounds = { x: pos.x, y: pos.y, width: size.width, height: size.height };
  lastAppliedBounds[windowId] = bounds;
  win.setBounds(bounds);
}

// ---- Notepad ----
function createNotepad() {
  const size = settingsStore.sizeFor('notepad', settings.notepad.size);
  const rawPos = settings.notepad.position.mode === 'custom' && settings.notepad.position.x !== null
    ? { x: settings.notepad.position.x, y: settings.notepad.position.y }
    : defaultPositionFor(settings.notepad.position.preset, size);
  const pos = clampToScreen(rawPos, size);

  // Suppress bounds-save during creation too, not just during a later
  // applyBounds() call -- Electron/Windows can fire a spurious initial
  // resize/move once the window is actually shown, and without this guard
  // that stray event would silently flip a brand-new "small"/"medium"/etc.
  // preset back to "custom" even though the pixel size never changed.
  suppressBoundsSave.notepad = true;
  notepadWin = createFloatingWindow({
    width: size.width, height: size.height, x: pos.x, y: pos.y,
    preload: path.join(__dirname, '..', '..', 'core', 'preload.js'),
    htmlFile: path.join(__dirname, '..', '..', 'core', 'overlay.html'),
    minWidth: 260, minHeight: 200
  });
  wm.register(notepadWin);
  watchWindowBounds(notepadWin, 'notepad');
  setTimeout(() => { suppressBoundsSave.notepad = false; }, 300);
}

// Manual fallback: bumps the LIVE round by one by hand, for whenever OCR
// misses a change (alt-tab timing, weird HUD moment, etc). Deliberately
// does NOT touch the watcher's internal round tracking -- the watcher's
// forward-only guard (see round-watcher.js) means it will just pick back
// up seamlessly once the real on-screen score changes, crediting the
// correct round's outcome without any extra bookkeeping needed here.
function manualNewRound() {
  session.newRound(session.round + 1);
  pushRoundToRenderer();
}

function newGameSession() {
  session.start();
  if (watcher) watcher.resetRoundTracking();
  pushRoundToRenderer();
}

// ---- Toolbar ----
function createToolbar() {
  const size = settingsStore.sizeFor('toolbar', settings.toolbar.size);
  const rawPos = settings.toolbar.position.mode === 'custom' && settings.toolbar.position.x !== null
    ? { x: settings.toolbar.position.x, y: settings.toolbar.position.y }
    : defaultPositionFor(settings.toolbar.position.preset, size);
  const pos = clampToScreen(rawPos, size);

  suppressBoundsSave.toolbar = true;
  toolbarWin = createToolbarWindow(size, pos);
  wm.register(toolbarWin);
  watchWindowBounds(toolbarWin, 'toolbar');
  setTimeout(() => { suppressBoundsSave.toolbar = false; }, 300);
}

// ---- Scratch notepad ----
function ensureScratchWindow() {
  if (scratchWin) return;
  const size = settingsStore.sizeFor('scratch', settings.scratch.size);
  const rawPos = settings.scratch.position.mode === 'custom' && settings.scratch.position.x !== null
    ? { x: settings.scratch.position.x, y: settings.scratch.position.y }
    : defaultPositionFor(settings.scratch.position.preset, size);
  const pos = clampToScreen(rawPos, size);
  suppressBoundsSave.scratch = true;
  scratchWin = createScratchWindow(size, pos);
  wm.register(scratchWin);
  watchWindowBounds(scratchWin, 'scratch');
  setTimeout(() => { suppressBoundsSave.scratch = false; }, 300);
}

function loadScratchIntoWindow() {
  const text = fs.existsSync(SCRATCH_PATH) ? fs.readFileSync(SCRATCH_PATH, 'utf-8') : '';
  scratchWin.webContents.send('theme-data', settings.theme);
  scratchWin.webContents.send('scratch-load', text);
}

// ---- Session browser ----
function ensureSessionsWindow() {
  if (sessionsWin) return;
  const size = settingsStore.sizeFor('sessions', settings.sessions.size);
  const rawPos = settings.sessions.position.mode === 'custom' && settings.sessions.position.x !== null
    ? { x: settings.sessions.position.x, y: settings.sessions.position.y }
    : defaultPositionFor(settings.sessions.position.preset, size);
  const pos = clampToScreen(rawPos, size);
  suppressBoundsSave.sessions = true;
  sessionsWin = createSessionsWindow(size, pos);
  wm.register(sessionsWin);
  watchWindowBounds(sessionsWin, 'sessions');
  setTimeout(() => { suppressBoundsSave.sessions = false; }, 300);
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
  mainWin.once('ready-to-show', () => {
    pushThemeToAll();
    mainWin.show();
  });
  mainWin.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWin.hide();
    }
  });
}

// Small dot icon built at runtime -- no external image asset needed.
function createTrayIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const radius = size / 2 - 1.5;
  const color = [255, 70, 85]; // matches the app's accent red
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const i = (y * size + x) * 4;
      if (dist <= radius) {
        buffer[i] = color[0];
        buffer[i + 1] = color[1];
        buffer[i + 2] = color[2];
        buffer[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Valorant VOD Notepad');
  const menu = Menu.buildFromTemplate([
    { label: 'Open App', click: () => { if (mainWin) wm.showAndFocus(mainWin); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { if (mainWin) wm.showAndFocus(mainWin); });
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
    sessions: sessionsWin
  }[id];
}

function showPanelWindow(id) {
  switch (id) {
    case 'notepad':
      session.openForViewing();
      pushAppearance();
      pushHotkeys();
      pushThemeToAll();
      pushGameState(currentGameState);
      pushPersistState('notepad');
      pushRoundToRenderer();
      wm.showAndFocus(notepadWin);
      break;
    case 'toolbar':
      pushThemeToAll();
      pushLockStateToAll();
      wm.showAndFocus(toolbarWin);
      break;
    case 'scratch':
      ensureScratchWindow();
      loadScratchIntoWindow();
      pushPersistState('scratch');
      wm.showAndFocus(scratchWin);
      break;
   case 'sessions':
      ensureSessionsWindow();
      sessionsWin.webContents.send('theme-data', settings.theme);
      wm.showAndFocus(sessionsWin);
      break;
  }
  applyLockState(); // in case this panel is newly created/shown while lock was already on
}

function hidePanelWindow(id) {
  const win = getPanelWin(id);
  if (!win) return;
  if (id === 'notepad' && session) session.closeViewing();
  win.hide();
}

// Opens the backdrop plus every panel marked showOnOpen in settings.
// This is what the master hotkey (Alt+N) does when the overlay is
// currently closed.
function openOverlay() {
  overlayWantsOpen = true;
  visiblePanels = new Set(PANEL_IDS.filter((id) => settings[id] && settings[id].showOnOpen));
  if (!backdropWin) {
    backdropWin = createBackdropWindow();
    wm.register(backdropWin);
  }
  backdropWin.show();
  visiblePanels.forEach((id) => showPanelWindow(id));
  overlayOpen = true;
}

// Closes everything -- backdrop and every panel, regardless of which
// were open. This is the master "close" gesture: Alt+N while open,
// clicking the dim backdrop, or Esc from the notepad.
function closeOverlay() {
  overlayWantsOpen = false;
  // Panels the user pinned (persistentPanels) are deliberately skipped
  // here -- that's the whole point of that pin: it stays open, visible,
  // and interactive even though the rest of the overlay (and the dim
  // backdrop) goes away. It becomes a normal always-on-top window until
  // its own pin is turned back off.
  PANEL_IDS.forEach((id) => {
    if (persistentPanels.has(id)) return;
    hidePanelWindow(id);
  });
  if (backdropWin) backdropWin.hide();
  visiblePanels.clear();
  overlayOpen = false;
}

function toggleOverlay() {
  // console.log(`[toggleOverlay] hotkey pressed -- overlayOpen=${overlayOpen} valorantFocused=${valorantFocused}`);
  if (overlayOpen) {
    closeOverlay();
  } else if (valorantFocused) {
    openOverlay();
  } else {
    // console.log('[toggleOverlay] blocked -- your test app is not the focused window right now');
  }
  // If Valorant isn't focused, this is a silent no-op -- same as
  // Valorant Tracker, the overlay simply doesn't exist outside the game.
}

// Ensures a specific panel is showing -- opens the overlay first if it
// wasn't already open, and adds this panel even if its own showOnOpen
// setting is off (an explicit hotkey press always wins).
function ensurePanelShown(id) {
  if (!overlayOpen) {
    if (!valorantFocused) return;
    openOverlay();
  }
  if (!visiblePanels.has(id)) {
    visiblePanels.add(id);
    showPanelWindow(id);
  } else {
    wm.showAndFocus(getPanelWin(id));
  }
}

// Toggles one panel's membership in the currently open overlay. If the
// overlay wasn't open, opens it (with its normal showOnOpen defaults)
// then also shows this panel. If, after hiding a panel, nothing is left
// visible, the whole overlay closes rather than leaving an empty dim
// backdrop on screen.
function togglePanel(id) {
  if (!overlayOpen) {
    if (!valorantFocused) return;
    openOverlay();
    if (!visiblePanels.has(id)) {
      visiblePanels.add(id);
      showPanelWindow(id);
    }
    return;
  }
  if (visiblePanels.has(id)) {
    hidePanelWindow(id);
    visiblePanels.delete(id);
    if (visiblePanels.size === 0) closeOverlay();
  } else {
    visiblePanels.add(id);
    showPanelWindow(id);
  }
}

function navRound(direction) {
  ensurePanelShown('notepad');
  session.navigate(direction);
  pushRoundToRenderer();
}

// ---- Hotkeys ----
// Every register() call is wrapped in try/catch -- a malformed
// accelerator string must never crash the whole app (this is exactly
// what happened before: an invalid saved hotkey took the process down).
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const handlers = {
    toggle: toggleOverlay,
    manualRound: manualNewRound,
    newSession: newGameSession,
    prevRound: () => navRound('prev'),
    nextRound: () => navRound('next'),
    toolbar: () => togglePanel('toolbar'),
    scratch: () => togglePanel('scratch'),
    sessions: () => togglePanel('sessions')
  };
  for (const [key, handler] of Object.entries(handlers)) {
    const accel = settings.hotkeys[key];
    if (!accel) continue;
    try {
      const ok = globalShortcut.register(accel, handler);
      if (!ok) {
        console.error(`Failed to register hotkey "${accel}" (${key}) -- it may already be in use by another app.`);
      } 
      // else {
        // console.log(`[hotkeys] Registered "${accel}" for "${key}"`);
      // }
    } catch (err) {
      console.error(`Hotkey "${accel}" (${key}) is invalid and was skipped:`, err.message);
    }
  }
  // Tab is handled separately by TabCapture (dynamic, foreground-scoped),
  // never as a permanent global shortcut here.
}

// If a second launch is attempted while this instance is already
// running, bring the main app window forward instead of letting two
// copies coexist.
app.on('second-instance', () => {
  if (mainWin) wm.showAndFocus(mainWin);
});

app.whenReady().then(async () => {
  session = new SessionManager(NOTES_DIR);

  createMainAppWindow();
  createTray();

  createNotepad();
  createToolbar();

  watcher = new RoundWatcher({
    onRoundChange: (round, meta) => {
      if (meta && meta.outcome) session.setRoundOutcome(meta.concludedRound, meta.outcome);
      session.newRound(round);
      pushRoundToRenderer();
    },
    onStateChange: (state) => {
      currentGameState = state;
      pushGameState(state);
    }
  });
  await watcher.start();
  currentGameState = watcher.state;

  tabCapture = new TabCapture({
    enabled: settings.tabCapture.enabled,
    notesDir: NOTES_DIR,
    getSessionId: () => session.id,
    onCaptured: (filePath) => session.attachScoreboard(filePath)
  });
  tabCapture.start();

  // Auto-hides the whole overlay when Valorant loses focus (tabbing to
  // desktop/another app), and restores exactly what was showing when it
  // regains focus. Only acts while the user actually wants the overlay
  // open (overlayWantsOpen). NOTE: this used to also check a "pinned"
  // flag to skip auto-hiding -- that was the OLD, removed job of the
  // lock button. Locking is position/size only now; if you want a panel
  // to survive tabbing out of the game entirely, that's a different,
  // not-yet-built feature from the "stay visible when overlay closes"
  // pin (which only concerns closeOverlay(), not tab-out).
  focusWatcher = new FocusWatcher((isValorantFocused) => {
    valorantFocused = isValorantFocused;
    if (!overlayWantsOpen) return;
    if (isValorantFocused && !overlayOpen) {
      if (backdropWin) backdropWin.show();
      visiblePanels.forEach((id) => {
        const w = getPanelWin(id);
        if (w) wm.showAndFocus(w);
      });
      overlayOpen = true;
    } else if (!isValorantFocused && overlayOpen) {
      if (backdropWin) backdropWin.hide();
      PANEL_IDS.forEach((id) => {
        const w = getPanelWin(id);
        if (w && w.isVisible()) w.hide();
      });
      overlayOpen = false;
    }
  });
  focusWatcher.start();

  registerHotkeys();
});

// ---- IPC: notepad ----
ipcMain.on('save-note', (_event, text) => { if (session) session.saveNote(text); });
ipcMain.on('hide-overlay', () => closeOverlay());
ipcMain.on('nav-round', (_event, direction) => navRound(direction));
ipcMain.on('toggle-lock', () => {
  locked = !locked;
  pushLockStateToAll();
  applyLockState();
});

// PERSIST toggles -- one channel per panel that HAS a persist button
// (only notepad and scratch, per the design). Each just flips that one
// id in/out of persistentPanels and tells that panel's own window to
// update its pin icon.
ipcMain.on('notepad-toggle-persist', () => {
  if (persistentPanels.has('notepad')) persistentPanels.delete('notepad');
  else persistentPanels.add('notepad');
  pushPersistState('notepad');
});
ipcMain.on('scratch-toggle-persist', () => {
  if (persistentPanels.has('scratch')) persistentPanels.delete('scratch');
  else persistentPanels.add('scratch');
  pushPersistState('scratch');
});

// ---- IPC: backdrop ----
ipcMain.on('backdrop-click', () => closeOverlay());

// ---- IPC: toolbar ----
// Each line here prints to the TERMINAL (this is main-process code, not
// renderer code) -- so if you click a button and the matching
// [toolbar-ipc] line never appears here, but the [toolbar] log DID show
// up in that window's DevTools, the problem is a channel-name mismatch
// between here and toolbar-preload.js. If BOTH log, but nothing visibly
// happens, the bug is inside whatever function is being called
// (togglePanel, openSettingsWindow, etc.) -- next step would be adding
// logging inside that function specifically.
ipcMain.on('toolbar-open-notepad', () => { console.log('[toolbar-ipc] open-notepad received'); togglePanel('notepad'); });
ipcMain.on('toolbar-open-scratch', () => { console.log('[toolbar-ipc] open-scratch received'); togglePanel('scratch'); });
ipcMain.on('toolbar-open-sessions', () => { console.log('[toolbar-ipc] open-sessions received'); togglePanel('sessions'); });
ipcMain.on('toolbar-manual-round', () => { console.log('[toolbar-ipc] manual-round received'); manualNewRound(); });
ipcMain.on('toolbar-toggle-theme', () => {
  console.log('[toolbar-ipc] toggle-theme received');
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  persistSettings();
  pushThemeToAll();
  pushAppearance();
});
ipcMain.on('toolbar-close-overlay', () => { console.log('[toolbar-ipc] close-overlay received'); closeOverlay(); });

// ---- IPC: main window controls ----
// Now that main-window.js is frame:false, there's no OS-provided
// minimize/maximize/close -- these three replace exactly that, acting
// directly on the mainWin BrowserWindow instance. Same pattern to reuse
// if any OTHER window ever goes frameless and needs its own controls.
ipcMain.on('main-window-minimize', () => { console.log('[main-window-ipc] minimize received'); if (mainWin) mainWin.minimize(); });
ipcMain.on('main-window-toggle-maximize', () => {
  console.log('[main-window-ipc] toggle-maximize received');
  if (!mainWin) return;
  if (mainWin.isMaximized()) mainWin.unmaximize();
  else mainWin.maximize();
});
ipcMain.on('main-window-close', () => { console.log('[main-window-ipc] close received'); if (mainWin) mainWin.close(); });

// ---- IPC: scratch notepad ----
ipcMain.handle('get-scratch', () => {
  return fs.existsSync(SCRATCH_PATH) ? fs.readFileSync(SCRATCH_PATH, 'utf-8') : '';
});
ipcMain.on('scratch-save', (_event, text) => {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });
  fs.writeFileSync(SCRATCH_PATH, text);
});
ipcMain.on('scratch-hide', () => {
  hidePanelWindow('scratch');
  visiblePanels.delete('scratch');
  if (visiblePanels.size === 0) closeOverlay();
});

// ---- IPC: session browser ----
ipcMain.handle('list-sessions', async () => {
  if (!fs.existsSync(NOTES_DIR)) return [];
  const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(NOTES_DIR, f), 'utf-8'));
      const rounds = data.rounds || {};
      // Won/lost tally, same logic as SessionManager.saveToDisk's markdown
      // header -- surfaced here too so the session list can show a
      // result badge without opening each file.
      const tally = Object.values(rounds).reduce((acc, r) => {
        if (r.outcome === 'won') acc.won += 1;
        if (r.outcome === 'lost') acc.lost += 1;
        return acc;
      }, { won: 0, lost: 0 });
      return {
        id: data.id,
        mdFile: f.replace(/\.json$/, '.md'),
        roundCount: Object.keys(rounds).length,
        startedAt: data.startedAt,
        won: tally.won,
        lost: tally.lost
      };
    } catch {
      return null;
    }
  }).filter(Boolean).sort((a, b) => b.startedAt - a.startedAt);
});
ipcMain.on('open-session', (_event, mdFile) => shell.openPath(path.join(NOTES_DIR, mdFile)));
ipcMain.on('sessions-hide', () => {
  hidePanelWindow('sessions');
  visiblePanels.delete('sessions');
  if (visiblePanels.size === 0) closeOverlay();
});

// ---- IPC: settings ----

// Lets any renderer ask for the current settings on demand -- the
// embedded Settings tab in the main window uses this to load its first
// render, since (unlike the floating overlay panel) it can already be
// on-screen before any "open settings" action has fired a push.
ipcMain.handle('get-settings', () => JSON.parse(JSON.stringify(settings)));

ipcMain.on('preview-theme', (_event, theme) => {
  // console.log('[theme-preview] IPC received:', theme);
  previewThemeToAll(theme);
});

ipcMain.on('save-settings', (_event, data) => {
  const merged = settingsStore.load(SETTINGS_PATH); // start from valid defaults+existing
  settings = {
    hotkeys: { ...settingsStore.DEFAULTS.hotkeys, ...(data.hotkeys || {}) },
    theme: data.theme || merged.theme,
    notepad: { ...merged.notepad, ...(data.notepad || {}) },
    toolbar: { ...merged.toolbar, ...(data.toolbar || {}) },
    scratch: { ...merged.scratch, ...(data.scratch || {}) },
    sessions: { ...merged.sessions, ...(data.sessions || {}) },
    tabCapture: { ...merged.tabCapture, ...(data.tabCapture || {}) }
  };
  persistSettings();

  registerHotkeys();
  if (notepadWin) applyBounds(notepadWin, 'notepad');
  if (toolbarWin) applyBounds(toolbarWin, 'toolbar');
  if (scratchWin) applyBounds(scratchWin, 'scratch');
  if (sessionsWin) applyBounds(sessionsWin, 'sessions');
  pushAppearance();
  pushHotkeys();
  pushThemeToAll();
  if (tabCapture) tabCapture.setEnabled(settings.tabCapture.enabled);
});

// Fires for every quit path (tray "Quit", the toolbar's quit button,
// Alt+F4 on a non-main window, etc.) BEFORE any window's 'close' handler
// runs -- this is what lets the main window's close handler tell a real
// quit apart from just clicking the X to hide it.
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  if (watcher) await watcher.stop();
  if (tabCapture) tabCapture.stop();
  if (focusWatcher) focusWatcher.stop();
  if (tray) tray.destroy();
});

app.on('window-all-closed', () => {
  app.quit();
});