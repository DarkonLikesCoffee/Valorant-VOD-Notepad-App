"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTray } = require("../../../core/tray");

test("createTray builds the expected icon, menu, and callbacks", () => {
  const calls = [];
  let constructedIcon = null;
  let tooltip = null;
  let contextMenu = null;
  let clickHandler = null;

  class FakeTray {
    constructor(icon) {
      constructedIcon = icon;
    }
    setToolTip(value) {
      tooltip = value;
    }
    setContextMenu(menu) {
      contextMenu = menu;
    }
    on(event, handler) {
      assert.equal(event, "click");
      clickHandler = handler;
    }
  }

  const Menu = {
    buildFromTemplate(template) {
      return { items: template };
    },
  };
  const nativeImage = {
    createFromBuffer(buffer, size) {
      return { buffer, ...size };
    },
  };

  const tray = createTray({
    Tray: FakeTray,
    Menu,
    nativeImage,
    showMainApp: () => calls.push("open"),
    quitApp: () => calls.push("quit"),
  });

  assert.ok(tray instanceof FakeTray);
  assert.equal(constructedIcon.width, 16);
  assert.equal(constructedIcon.height, 16);
  assert.equal(constructedIcon.buffer.length, 16 * 16 * 4);
  assert.equal(tooltip, "Valorant VOD Notepad");
  assert.equal(contextMenu.items[0].label, "Open App");
  assert.equal(contextMenu.items[1].type, "separator");
  assert.equal(contextMenu.items[2].label, "Quit");

  clickHandler();
  contextMenu.items[0].click();
  contextMenu.items[2].click();
  assert.deepEqual(calls, ["open", "open", "quit"]);
});
