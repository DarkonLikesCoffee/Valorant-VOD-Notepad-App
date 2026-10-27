"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const PRELOAD_FILES = [
  "core/preload.js",
  "core/toolbar-preload.js",
  "core/scratch-preload.js",
  "core/sessions-preload.js",
  "core/backdrop-preload.js",
  "core/browser-preload.js",
  "core/main-preload.js",
  "core/end-session-toast-preload.js",
];
const HANDLER_FILES = [
  "providers/standalone/main.js",
  "core/session-ipc.js",
  "core/scratch-ipc.js",
  "core/browser-ipc.js",
  "core/main-window-ipc.js",
];

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function channels(source, expression) {
  return [...source.matchAll(expression)].map((match) => match[1]);
}

test("every preload IPC send/invoke has a registered main-process handler", () => {
  const exposedChannels = new Set();
  for (const file of PRELOAD_FILES) {
    const source = readSource(file);
    for (const channel of channels(
      source,
      /ipcRenderer\.(?:send|invoke)\(\s*["']([^"']+)["']/g,
    )) {
      exposedChannels.add(channel);
    }
  }

  const registeredChannels = new Set();
  for (const file of HANDLER_FILES) {
    const source = readSource(file);
    for (const channel of channels(
      source,
      /ipcMain\.(?:on|handle)\(\s*["']([^"']+)["']/g,
    )) {
      registeredChannels.add(channel);
    }
  }

  const missing = [...exposedChannels].filter(
    (channel) => !registeredChannels.has(channel),
  );
  assert.deepEqual(missing, []);
});

test("main-process IPC channels are not registered more than once", () => {
  const occurrences = [];
  for (const file of HANDLER_FILES) {
    const source = readSource(file);
    for (const channel of channels(
      source,
      /ipcMain\.(?:on|handle)\(\s*["']([^"']+)["']/g,
    )) {
      occurrences.push({ channel, file });
    }
  }

  const duplicates = occurrences
    .filter((entry, index) => occurrences.findIndex(
      (candidate) => candidate.channel === entry.channel,
    ) !== index)
    .map(({ channel, file }) => ({ channel, file }));

  assert.deepEqual(duplicates, []);
});


test("the configured settings hotkey opens the existing Settings tab", () => {
  const main = readSource("providers/standalone/main.js");
  const settings = readSource("core/settings-store.js");
  assert.match(settings, /settings:\s*['"]Alt\+S['"]/);
  assert.match(main, /settings:\s*openSettings/);
  assert.match(main, /function openSettings\(\)\s*\{\s*selectMainWindowTab\(["']settings["']\);\s*\}/);
});
