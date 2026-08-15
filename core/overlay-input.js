const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");

let helper = null;
let running = false;

let onKeyDown = null;
let onKeyUp = null;
let onHotkey = null;

function helperPath() {
  return path.join(__dirname, "..", "native", "keyboard", "keyboard-hook.exe");
}

function start({ onDown, onUp, onHotkey: hotkeyHandler, hotkeys = [] }) {
  if (running) return;

  onKeyDown = onDown;
  onKeyUp = onUp;
  onHotkey = hotkeyHandler;

  helper = spawn(helperPath(), [], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stdout = readline.createInterface({
    input: helper.stdout,
    crlfDelay: Infinity,
  });

  stdout.on("line", (line) => {
    try {
      const event = JSON.parse(line);

      if (event.ready) {
        helper.stdin.write("enable\n");

        // Send configured application hotkeys to the native hook.
        const serializedHotkeys = JSON.stringify(hotkeys);
        helper.stdin.write(`hotkeys ${serializedHotkeys}\n`);

        return;
      }

      if (event.error) {
        console.error("[overlay-input]", event.error);
        return;
      }

      if (event.status) {
        console.log("[overlay-input]", event.status);
        return;
      }

      if (event.type === "shortcut") {
        onHotkey?.({
          vk: event.vk,
          shift: event.shift,
          ctrl: event.ctrl,
          alt: event.alt,
          win: event.win,
        });

        return;
      }

      if (event.type === "editor-shortcut") {
        onKeyDown?.({
          type: "editor-shortcut",
          vk: event.vk,
          shift: event.shift,
          ctrl: event.ctrl,
          alt: event.alt,
          win: event.win,
        });

        return;
      }

      if (event.type === "keydown") {
        onKeyDown?.(event);
        return;
      }

      if (event.type === "keyup") {
        onKeyUp?.(event);
        return;
      }
    } catch (err) {
      console.error("[overlay-input] Invalid helper message:", line, err);
    }
  });

  helper.stderr.on("data", (data) => {
    console.error("[overlay-input helper]", data.toString().trim());
  });

  helper.on("error", (err) => {
    console.error("[overlay-input] helper failed:", err);
  });

  helper.on("exit", (code) => {
    console.log("[overlay-input] helper exited:", code);
    helper = null;
    running = false;
  });

  running = true;

  console.log("[overlay-input] starting native keyboard hook");
}

function stop() {
  if (!helper) {
    running = false;
    return;
  }

  try {
    helper.stdin.write("disable\n");
    helper.stdin.write("quit\n");
  } catch {}

  onKeyDown = null;
  onKeyUp = null;
  onHotkey = null;

  helper = null;
  running = false;

  console.log("[overlay-input] stopped");
}

module.exports = {
  start,
  stop,
};
