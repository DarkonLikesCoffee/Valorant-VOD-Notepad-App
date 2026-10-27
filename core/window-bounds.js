"use strict";

class WindowBounds {
  constructor({
    getSettings,
    settingsStore,
    defaultPositionFor,
    clampToScreen,
    persistSettings,
    debounceMs = 400,
  }) {
    this.getSettings = getSettings;
    this.settingsStore = settingsStore;
    this.defaultPositionFor = defaultPositionFor;
    this.clampToScreen = clampToScreen;
    this.persistSettings = persistSettings;
    this.debounceMs = debounceMs;
    this.lastAppliedBounds = {};
    this.watchers = new Map();
  }

  watch(win, windowId) {
    // Capture the initial geometry too: Electron can emit native move/resize
    // events during creation/show. Those events are not user customizations.
    if (!this.lastAppliedBounds[windowId]) {
      this.lastAppliedBounds[windowId] = { ...win.getBounds() };
    }

    const pendingKinds = new Set();
    const watcher = { timer: null };

    const cancelPending = () => {
      if (watcher.timer !== null) clearTimeout(watcher.timer);
      watcher.timer = null;
      pendingKinds.clear();
    };

    const save = (kind) => {
      const current = win.getBounds();
      const applied = this.lastAppliedBounds[windowId];

      if (
        applied &&
        current.x === applied.x &&
        current.y === applied.y &&
        current.width === applied.width &&
        current.height === applied.height
      ) {
        return;
      }

      pendingKinds.add(kind);
      if (watcher.timer !== null) clearTimeout(watcher.timer);
      watcher.timer = setTimeout(() => {
        watcher.timer = null;
        if (typeof win.isDestroyed === "function" && win.isDestroyed()) {
          pendingKinds.clear();
          return;
        }

        const changedKinds = new Set(pendingKinds);
        pendingKinds.clear();
        if (changedKinds.size === 0) return;

        const bounds = win.getBounds();
        const settings = this.getSettings();

        if (changedKinds.has("resize")) {
          settings[windowId].size = {
            mode: "custom",
            preset: settings[windowId].size.preset,
            width: bounds.width,
            height: bounds.height,
          };
        }

        if (changedKinds.has("move")) {
          settings[windowId].position = {
            mode: "custom",
            preset: settings[windowId].position.preset,
            x: bounds.x,
            y: bounds.y,
          };
        }

        this.persistSettings();
      }, this.debounceMs);
    };

    this.watchers.set(windowId, { win, cancelPending });
    win.on("resize", () => save("resize"));
    win.on("move", () => save("move"));
    win.on("closed", () => {
      cancelPending();
      const currentWatcher = this.watchers.get(windowId);
      if (currentWatcher && currentWatcher.win === win) {
        this.watchers.delete(windowId);
      }
    });
  }

  apply(win, windowId) {
    // A settings save may occur while a drag/resize debounce is pending.
    // Applying the saved values wins; the old user-event timer must not
    // overwrite those values with the just-applied programmatic geometry.
    const watcher = this.watchers.get(windowId);
    if (watcher) watcher.cancelPending();

    const settings = this.getSettings();
    const size = this.settingsStore.sizeFor(windowId, settings[windowId].size);
    const rawPosition =
      settings[windowId].position.mode === "custom" &&
      settings[windowId].position.x !== null
        ? {
            x: settings[windowId].position.x,
            y: settings[windowId].position.y,
          }
        : this.defaultPositionFor(settings[windowId].position.preset, size);
    const position = this.clampToScreen(rawPosition, size);
    const bounds = {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    };

    this.lastAppliedBounds[windowId] = { ...bounds };
    win.setBounds(bounds);
  }
}

module.exports = { WindowBounds };
