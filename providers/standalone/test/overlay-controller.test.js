"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { OverlayController } = require("../../../core/overlay-controller");

function makeHarness({ focused = true, showOnOpen = { notepad: true, toolbar: true } } = {}) {
  const state = {
    persistentPanels: new Set(),
    overlayOpen: false,
    overlayWantsOpen: false,
    visiblePanels: new Set(),
    panelsHiddenForFocusLoss: new Set(),
    valorantFocused: focused,
  };
  const calls = [];
  const windows = {};
  const settings = {};
  for (const id of ["notepad", "toolbar", "scratch"]) {
    settings[id] = { showOnOpen: !!showOnOpen[id] };
    windows[id] = {
      visible: false,
      isVisible() { return this.visible; },
    };
  }

  const controller = new OverlayController({
    state,
    panelIds: ["notepad", "toolbar", "scratch"],
    getSettings: () => settings,
    getPanelWindow: (id) => windows[id] || null,
    showPanelWindow: (id) => {
      calls.push(["show", id]);
      if (windows[id]) windows[id].visible = true;
    },
    hidePanelWindow: (id) => {
      calls.push(["hide", id]);
      if (windows[id]) windows[id].visible = false;
    },
    showBackdrop: () => calls.push(["backdrop-show"]),
    showExistingBackdrop: () => calls.push(["backdrop-show-existing"]),
    hideBackdrop: () => calls.push(["backdrop-hide"]),
    isGameFocused: () => state.valorantFocused,
    showAndFocus: (win) => calls.push(["focus", win]),
  });

  return { controller, state, calls, windows };
}

test("openOverlay shows configured panels and records open intent", () => {
  const { controller, state, calls } = makeHarness();
  controller.openOverlay();

  assert.equal(state.overlayOpen, true);
  assert.equal(state.overlayWantsOpen, true);
  assert.deepEqual([...state.visiblePanels], ["notepad", "toolbar"]);
  assert.deepEqual(calls, [
    ["backdrop-show"],
    ["show", "notepad"],
    ["show", "toolbar"],
  ]);
});

test("closeOverlay preserves pinned panels but clears overlay membership", () => {
  const { controller, state, calls } = makeHarness();
  controller.openOverlay();
  state.persistentPanels.add("notepad");
  calls.length = 0;

  controller.closeOverlay();

  assert.equal(state.overlayOpen, false);
  assert.equal(state.overlayWantsOpen, false);
  assert.equal(state.visiblePanels.size, 0);
  assert.deepEqual(calls, [
    ["hide", "toolbar"],
    ["hide", "scratch"],
    ["backdrop-hide"],
  ]);
});

test("focus loss hides visible panels and focus gain restores the same overlay", () => {
  const { controller, state, calls, windows } = makeHarness();
  controller.openOverlay();
  windows.scratch.visible = true;
  calls.length = 0;

  controller.hideOverlayForFocusLoss();
  assert.deepEqual([...state.panelsHiddenForFocusLoss], ["notepad", "toolbar", "scratch"]);
  assert.equal(state.overlayOpen, false);
  assert.equal(windows.notepad.visible, false);
  assert.equal(windows.toolbar.visible, false);
  assert.equal(windows.scratch.visible, false);

  calls.length = 0;
  controller.restoreAfterFocusGain();
  assert.equal(state.overlayOpen, true);
  assert.deepEqual(calls, [
    ["backdrop-show-existing"],
    ["show", "notepad"],
    ["show", "toolbar"],
  ]);
  assert.equal(state.panelsHiddenForFocusLoss.size, 0);
});

test("togglePanel cannot open outside the game and closes an emptied overlay", () => {
  const { controller, state, calls } = makeHarness({ focused: false });
  controller.togglePanel("scratch");
  assert.equal(state.overlayOpen, false);
  assert.equal(calls.length, 0);

  state.valorantFocused = true;
  controller.togglePanel("scratch");
  assert.equal(state.overlayOpen, true);
  assert.equal(state.visiblePanels.has("scratch"), true);
  assert.equal(calls.includes(["show", "scratch"]), false);

  // The only explicitly-added panel is removed, but the default panels
  // remain because openOverlay applies their showOnOpen preferences.
  controller.togglePanel("scratch");
  assert.equal(state.overlayOpen, true);
  assert.equal(state.visiblePanels.has("scratch"), false);
});
