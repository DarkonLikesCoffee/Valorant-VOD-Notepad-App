"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerConfiguredHotkeys } = require("../../../core/hotkey-registry");

test("registerConfiguredHotkeys clears old shortcuts and registers configured handlers", () => {
  const calls = [];
  const handlers = {
    toggle: () => {},
    scratch: () => {},
  };
  const globalShortcut = {
    unregisterAll: () => calls.push("clear"),
    register: (accelerator, handler) => {
      calls.push({ accelerator, handler });
      return true;
    },
  };

  registerConfiguredHotkeys({
    globalShortcut,
    hotkeys: { toggle: "Alt+N", scratch: "Alt+M", unused: "Alt+U" },
    handlers,
  });

  assert.equal(calls[0], "clear");
  assert.deepEqual(calls.slice(1), [
    { accelerator: "Alt+N", handler: handlers.toggle },
    { accelerator: "Alt+M", handler: handlers.scratch },
  ]);
});

test("registerConfiguredHotkeys skips missing accelerators", () => {
  const registrations = [];
  registerConfiguredHotkeys({
    globalShortcut: {
      unregisterAll: () => {},
      register: (...args) => {
        registrations.push(args);
        return true;
      },
    },
    hotkeys: { toggle: "", scratch: null },
    handlers: { toggle: () => {}, scratch: () => {} },
    logger: { error: () => {} },
  });

  assert.deepEqual(registrations, []);
});

test("registerConfiguredHotkeys logs registration failures and continues", () => {
  const errors = [];
  const registered = [];
  const handlers = {
    unavailable: () => {},
    invalid: () => {},
    valid: () => {},
  };

  registerConfiguredHotkeys({
    globalShortcut: {
      unregisterAll: () => {},
      register: (accelerator) => {
        if (accelerator === "Alt+X") return false;
        if (accelerator === "Not A Hotkey") throw new Error("invalid accelerator");
        registered.push(accelerator);
        return true;
      },
    },
    hotkeys: {
      unavailable: "Alt+X",
      invalid: "Not A Hotkey",
      valid: "Alt+V",
    },
    handlers,
    logger: { error: (...args) => errors.push(args) },
  });

  assert.deepEqual(registered, ["Alt+V"]);
  assert.equal(errors.length, 2);
  assert.match(errors[0][0], /Failed to register hotkey/);
  assert.match(errors[1][0], /is invalid and was skipped/);
  assert.equal(errors[1][1], "invalid accelerator");
});
