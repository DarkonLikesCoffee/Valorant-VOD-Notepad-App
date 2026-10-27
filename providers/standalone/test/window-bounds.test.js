"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { WindowBounds } = require("../../../core/window-bounds");

function createSettings() {
  return {
    notepad: {
      size: { mode: "preset", preset: "medium", width: 420, height: 360 },
      position: { mode: "preset", preset: "top-right", x: null, y: null },
    },
  };
}

function createWindowBounds(settings, persistSettings, debounceMs = 5) {
  return new WindowBounds({
    getSettings: () => settings,
    settingsStore: {
      sizeFor: () => ({ width: 420, height: 360 }),
    },
    defaultPositionFor: () => ({ x: 100, y: 20 }),
    clampToScreen: (position) => position,
    persistSettings,
    debounceMs,
  });
}

test("apply uses configured size and clamped position", () => {
  const settings = createSettings();
  let receivedBounds = null;
  const boundsManager = new WindowBounds({
    getSettings: () => settings,
    settingsStore: {
      sizeFor: () => ({ width: 420, height: 360 }),
    },
    defaultPositionFor: () => ({ x: 1200, y: -30 }),
    clampToScreen: (position) => ({
      x: Math.min(1000, Math.max(0, position.x)),
      y: Math.max(0, position.y),
    }),
    persistSettings: () => {},
  });

  boundsManager.apply({
    setBounds: (bounds) => {
      receivedBounds = bounds;
    },
  }, "notepad");

  assert.deepEqual(receivedBounds, {
    x: 1000,
    y: 0,
    width: 420,
    height: 360,
  });
});

test("watch ignores applied bounds and persists only the changed dimension", async () => {
  const settings = createSettings();
  let persistCount = 0;
  let bounds = { x: 100, y: 20, width: 420, height: 360 };
  const handlers = {};
  const win = {
    getBounds: () => ({ ...bounds }),
    setBounds: (next) => {
      bounds = { ...next };
    },
    on: (eventName, handler) => {
      handlers[eventName] = handler;
    },
  };
  const manager = createWindowBounds(settings, () => {
    persistCount += 1;
  });

  manager.apply(win, "notepad");
  manager.watch(win, "notepad");

  handlers.move();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(persistCount, 0);

  bounds = { ...bounds, x: 140, y: 50 };
  handlers.move();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(settings.notepad.position.mode, "custom");
  assert.deepEqual(
    { x: settings.notepad.position.x, y: settings.notepad.position.y },
    { x: 140, y: 50 },
  );
  assert.equal(settings.notepad.size.mode, "preset");

  bounds = { ...bounds, width: 500, height: 440 };
  handlers.resize();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(settings.notepad.size.mode, "custom");
  assert.deepEqual(
    { width: settings.notepad.size.width, height: settings.notepad.size.height },
    { width: 500, height: 440 },
  );
  assert.equal(persistCount, 2);
});


test("watch ignores native creation events against the initial geometry", async () => {
  const settings = createSettings();
  let persistCount = 0;
  const handlers = {};
  const win = {
    getBounds: () => ({ x: 100, y: 20, width: 420, height: 360 }),
    on: (eventName, handler) => {
      handlers[eventName] = handler;
    },
  };
  const manager = createWindowBounds(settings, () => {
    persistCount += 1;
  });

  manager.watch(win, "notepad");
  handlers.move();
  handlers.resize();
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(persistCount, 0);
  assert.equal(settings.notepad.position.mode, "preset");
  assert.equal(settings.notepad.size.mode, "preset");
});

test("apply cancels a pending drag save so stale events cannot overwrite settings", async () => {
  const settings = createSettings();
  let persistCount = 0;
  let bounds = { x: 100, y: 20, width: 420, height: 360 };
  const handlers = {};
  const win = {
    getBounds: () => ({ ...bounds }),
    setBounds: (next) => {
      bounds = { ...next };
    },
    on: (eventName, handler) => {
      handlers[eventName] = handler;
    },
  };
  const manager = createWindowBounds(settings, () => {
    persistCount += 1;
  });

  manager.watch(win, "notepad");
  bounds = { ...bounds, x: 240, y: 160 };
  handlers.move();

  // A user-saved preset is applied before the event debounce expires.
  settings.notepad.position = { mode: "preset", preset: "bottom-left", x: null, y: null };
  manager.apply(win, "notepad");
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(persistCount, 0);
  assert.equal(settings.notepad.position.mode, "preset");
  assert.equal(settings.notepad.position.preset, "bottom-left");
  assert.equal(bounds.x, 100);
  assert.equal(bounds.y, 20);
});
