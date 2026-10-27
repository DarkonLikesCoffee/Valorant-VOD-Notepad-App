"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerBrowserIpc } = require("../../../core/browser-ipc");
const { registerMainWindowIpc } = require("../../../core/main-window-ipc");

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    on(channel, handler) {
      assert.equal(handlers.has(channel), false, "channel registered more than once: " + channel);
      handlers.set(channel, handler);
    },
  };
}

test("browser IPC delegates navigation actions to the current browser window", () => {
  const ipcMain = createIpcMain();
  const calls = [];
  let canGoBack = true;
  let canGoForward = true;
  let browserWindow = {
    browserWebView: {
      webContents: {
        canGoBack: () => canGoBack,
        canGoForward: () => canGoForward,
        goBack: () => calls.push("back"),
        goForward: () => calls.push("forward"),
        reload: () => calls.push("reload"),
        loadURL: (url) => calls.push(["navigate", url]),
      },
    },
    hide: () => calls.push("hide"),
  };

  registerBrowserIpc({ ipcMain, getBrowserWindow: () => browserWindow });
  ipcMain.handlers.get("browser-go-back")();
  ipcMain.handlers.get("browser-go-forward")();
  ipcMain.handlers.get("browser-reload")();
  ipcMain.handlers.get("browser-navigate")({}, "https://example.com");
  ipcMain.handlers.get("browser-close")();

  assert.deepEqual(calls, [
    "back",
    "forward",
    "reload",
    ["navigate", "https://example.com"],
    "hide",
  ]);

  calls.length = 0;
  canGoBack = false;
  canGoForward = false;
  ipcMain.handlers.get("browser-go-back")();
  ipcMain.handlers.get("browser-go-forward")();
  assert.deepEqual(calls, []);

  browserWindow = null;
  ipcMain.handlers.get("browser-reload")();
  ipcMain.handlers.get("browser-navigate")({}, "https://example.org");
  ipcMain.handlers.get("browser-close")();
  assert.deepEqual(calls, []);
});

test("browser IPC safely ignores missing webview instances", () => {
  const ipcMain = createIpcMain();
  let hidden = 0;
  const browserWindow = { browserWebView: null, hide: () => hidden++ };
  registerBrowserIpc({ ipcMain, getBrowserWindow: () => browserWindow });

  for (const channel of [
    "browser-go-back",
    "browser-go-forward",
    "browser-reload",
    "browser-navigate",
    "browser-close",
  ]) {
    ipcMain.handlers.get(channel)({}, "https://example.com");
  }

  assert.equal(hidden, 1);
});

test("main-window IPC forwards minimize, maximize toggle, and close", () => {
  const ipcMain = createIpcMain();
  const calls = [];
  let maximized = false;
  const mainWindow = {
    minimize: () => calls.push("minimize"),
    isMaximized: () => maximized,
    maximize: () => {
      maximized = true;
      calls.push("maximize");
    },
    unmaximize: () => {
      maximized = false;
      calls.push("unmaximize");
    },
    close: () => calls.push("close"),
  };

  registerMainWindowIpc({ ipcMain, getMainWindow: () => mainWindow });
  const originalLog = console.log;
  console.log = () => {};
  try {
    ipcMain.handlers.get("main-window-minimize")();
    ipcMain.handlers.get("main-window-toggle-maximize")();
    ipcMain.handlers.get("main-window-toggle-maximize")();
    ipcMain.handlers.get("main-window-close")();
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(calls, ["minimize", "maximize", "unmaximize", "close"]);
});

test("main-window IPC safely handles an absent window", () => {
  const ipcMain = createIpcMain();
  registerMainWindowIpc({ ipcMain, getMainWindow: () => null });
  const originalLog = console.log;
  console.log = () => {};
  try {
    ipcMain.handlers.get("main-window-minimize")();
    ipcMain.handlers.get("main-window-toggle-maximize")();
    ipcMain.handlers.get("main-window-close")();
  } finally {
    console.log = originalLog;
  }
});
