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
  }

  watch(win, windowId) {
    let timer = null;
    const pendingKinds = new Set();

    const save = (kind) => {
      const bounds = win.getBounds();
      const applied = this.lastAppliedBounds[windowId];

      if (
        applied &&
        bounds.x === applied.x &&
        bounds.y === applied.y &&
        bounds.width === applied.width &&
        bounds.height === applied.height
      ) {
        return;
      }

      pendingKinds.add(kind);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const currentBounds = win.getBounds();
        const settings = this.getSettings();

        if (pendingKinds.has("resize")) {
          settings[windowId].size = {
            mode: "custom",
            preset: settings[windowId].size.preset,
            width: currentBounds.width,
            height: currentBounds.height,
          };
        }

        if (pendingKinds.has("move")) {
          settings[windowId].position = {
            mode: "custom",
            preset: settings[windowId].position.preset,
            x: currentBounds.x,
            y: currentBounds.y,
          };
        }

        pendingKinds.clear();
        this.persistSettings();
      }, this.debounceMs);
    };

    win.on("resize", () => save("resize"));
    win.on("move", () => save("move"));
  }

  apply(win, windowId) {
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

    this.lastAppliedBounds[windowId] = bounds;
    win.setBounds(bounds);
  }
}

module.exports = { WindowBounds };
