"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ScratchStore } = require("../../../core/scratch-store");
const { registerScratchIpc } = require("../../../core/scratch-ipc");

function createIpcMain() {
  const onHandlers = new Map();
  const handleHandlers = new Map();
  return {
    onHandlers,
    handleHandlers,
    on(channel, handler) {
      onHandlers.set(channel, handler);
    },
    handle(channel, handler) {
      handleHandlers.set(channel, handler);
    },
  };
}

function createTempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "valorant-vod-scratch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("ScratchStore returns empty text when no scratchpad exists", (t) => {
  const root = createTempRoot(t);
  const store = new ScratchStore(path.join(root, "not-created-yet"));

  assert.equal(store.load(), "");
  assert.equal(fs.existsSync(path.join(root, "not-created-yet")), false);
});

test("ScratchStore creates its directory and preserves saved text", (t) => {
  const root = createTempRoot(t);
  const notesDir = path.join(root, "Documents", "ValorantVODNotes");
  const store = new ScratchStore(notesDir);
  const text = "# Notes\n\nRetake more slowly.\n\nKeep the crosshair high.";

  store.save(text);

  assert.equal(store.load(), text);
  assert.equal(
    fs.readFileSync(path.join(notesDir, "scratchpad.md"), "utf-8"),
    text,
  );
});

test("Scratch IPC delegates load, save, and hide actions", () => {
  const ipcMain = createIpcMain();
  const calls = [];
  const store = {
    load: () => "saved text",
    save: (value) => calls.push(["save", value]),
  };
  registerScratchIpc({
    ipcMain,
    store,
    onHide: () => calls.push(["hide"]),
  });

  assert.equal(ipcMain.handleHandlers.get("get-scratch")(), "saved text");
  ipcMain.onHandlers.get("scratch-save")({}, "new text");
  ipcMain.onHandlers.get("scratch-hide")();

  assert.deepEqual(calls, [["save", "new text"], ["hide"]]);
});
