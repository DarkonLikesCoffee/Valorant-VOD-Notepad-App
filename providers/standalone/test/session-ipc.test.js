"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerSessionIpc } = require("../../../core/session-ipc");

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) {
      assert.equal(handlers.has(channel), false);
      handlers.set(channel, handler);
    },
  };
}

function createStore(calls) {
  return {
    listSessions: () => [],
    getSession: (id) => ({ id }),
    getSessionDetails: (...args) => ({ args }),
    updateClosedSessionDetails: (...args) => {
      calls.push(["update-closed", ...args]);
      return "closed-updated";
    },
    deleteSession: (id) => {
      calls.push(["delete", id]);
      return "deleted";
    },
  };
}

test("history editor routes changes for the active session through SessionManager", () => {
  const ipcMain = createIpcMain();
  const calls = [];
  const activeSession = {
    id: "live",
    active: true,
    updateDetails: (details) => {
      calls.push(["update-active", details]);
      return true;
    },
  };
  const store = createStore(calls);
  registerSessionIpc({ ipcMain, store, getActiveSession: () => activeSession });

  const details = { map: "Ascent", kills: "12" };
  assert.equal(ipcMain.handlers.get("update-closed-session-details")({}, "live", details), true);
  assert.deepEqual(calls, [["update-active", details]]);
});

test("history editor delegates closed sessions and refuses to delete the active one", () => {
  const ipcMain = createIpcMain();
  const calls = [];
  const activeSession = { id: "live", active: true, updateDetails: () => true };
  const store = createStore(calls);
  registerSessionIpc({ ipcMain, store, getActiveSession: () => activeSession });

  assert.equal(ipcMain.handlers.get("update-closed-session-details")({}, "past", { map: "Haven" }), "closed-updated");
  assert.equal(ipcMain.handlers.get("delete-session")({}, "live"), false);
  assert.equal(ipcMain.handlers.get("delete-session")({}, "past"), "deleted");
  assert.deepEqual(calls, [
    ["update-closed", "past", { map: "Haven" }],
    ["delete", "past"],
  ]);
});

test("session detail updates safely handle a missing active session", () => {
  const ipcMain = createIpcMain();
  const calls = [];
  const store = createStore(calls);
  registerSessionIpc({ ipcMain, store, getActiveSession: () => null });

  assert.equal(ipcMain.handlers.get("update-session-details")({}, { map: "Ascent" }), false);
});
