"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { keepPanelWindowAlive } = require("../../../core/panel-window-lifecycle");

function createWindow() {
  const listeners = new Map();
  return {
    listeners,
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    closeEvent() {
      let prevented = false;
      const event = { preventDefault: () => { prevented = true; } };
      this.listeners.get("close")(event);
      return prevented;
    },
  };
}

test("closing an overlay window hides it through the controller instead of destroying it", () => {
  const win = createWindow();
  let closed = 0;
  keepPanelWindowAlive(win, {
    isQuitting: () => false,
    onClose: () => { closed += 1; },
  });

  assert.equal(win.closeEvent(), true);
  assert.equal(closed, 1);
});

test("application quit is allowed to close overlay windows", () => {
  const win = createWindow();
  let closed = 0;
  keepPanelWindowAlive(win, {
    isQuitting: () => true,
    onClose: () => { closed += 1; },
  });

  assert.equal(win.closeEvent(), false);
  assert.equal(closed, 0);
});

test("all singleton overlay panels use the same close lifecycle", () => {
  const root = path.resolve(__dirname, "../../..");
  const source = fs.readFileSync(path.join(root, "providers/standalone/main.js"), "utf8");
  const variables = {
    notepad: "notepadWin",
    toolbar: "toolbarWin",
    scratch: "scratchWin",
    sessions: "sessionsWin",
    browser: "browserWin",
  };

  for (const [id, variable] of Object.entries(variables)) {
    const expected = "keepPanelWindowAlive(" + variable +
      ', { isQuitting: () => isQuitting, onClose: () => overlayController.closePanel("' +
      id + '") });';
    assert.ok(source.includes(expected), "missing close lifecycle for " + id);
  }
});
