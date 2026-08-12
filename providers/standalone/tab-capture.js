const fs = require('fs');
const path = require('path');
const { globalShortcut } = require('electron');
const screenshot = require('screenshot-desktop');

let activeWin;
try {
  activeWin = require('active-win');
} catch (err) {
  activeWin = null;
}

const GAME_WINDOW_HINTS = ['valorant'];

/**
 * Optional feature: when enabled, watches which window is currently in
 * the foreground (via active-win — reads window titles, same as any
 * taskbar), and only registers a global Tab hotkey WHILE Valorant is the
 * focused window. The instant it isn't, the hotkey is unregistered again.
 *
 * This is deliberately scoped this way rather than registering Tab
 * globally all the time: a permanent global Tab hotkey would swallow
 * every Tab keypress system-wide (browsers, text fields, alt-tabbing),
 * not just in-game. Scoping it to "only while Valorant has focus" means
 * Tab behaves completely normally everywhere else.
 *
 * When it does fire, it just takes a screenshot (no different from any
 * screen capture tool) and hands the file path to onCaptured — nothing
 * reads or interacts with the game process.
 */
class TabCapture {
  constructor({ enabled, notesDir, getSessionId, onCaptured }) {
    this.enabled = enabled;
    this.notesDir = notesDir;
    this.getSessionId = getSessionId;
    this.onCaptured = onCaptured;
    this.registered = false;
    this.pollTimer = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this._unregister();
  }

  start() {
    if (!activeWin) {
      console.error('tab-capture: "active-win" is unavailable on this system — this feature will stay off.');
      return;
    }
    this.pollTimer = setInterval(() => this._poll(), 1000);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this._unregister();
  }

  _unregister() {
    if (this.registered) {
      globalShortcut.unregister('Tab');
      this.registered = false;
    }
  }

  async _poll() {
    if (!this.enabled) {
      this._unregister();
      return;
    }
    try {
      const focused = await activeWin();
      const title = ((focused && focused.title) || '').toLowerCase();
      const owner = ((focused && focused.owner && focused.owner.name) || '').toLowerCase();
      const isValorantFocused = GAME_WINDOW_HINTS.some((hint) => title.includes(hint) || owner.includes(hint));

      if (isValorantFocused && !this.registered) {
        this.registered = globalShortcut.register('Tab', () => this._captureNow());
        if (!this.registered) {
          console.error('tab-capture: failed to register the Tab hotkey (may be in use elsewhere).');
        }
      } else if (!isValorantFocused && this.registered) {
        this._unregister();
      }
    } catch (err) {
      console.error('tab-capture: foreground window check failed:', err.message);
    }
  }

  async _captureNow() {
    try {
      const dir = path.join(this.notesDir, 'scoreboards');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${this.getSessionId()}-${Date.now()}.png`);
      await screenshot({ filename: file });
      if (this.onCaptured) this.onCaptured(file);
    } catch (err) {
      console.error('tab-capture: screenshot failed:', err.message);
    }
  }
}

module.exports = { TabCapture };
