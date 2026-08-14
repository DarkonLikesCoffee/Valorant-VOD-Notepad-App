const screenshot = require("screenshot-desktop");
const Jimp = require("jimp");
const { createWorker } = require("tesseract.js");
const psList = require("ps-list");
const { windowManager } = require("node-window-manager");
const config = require("./config");

// Matches things like "3-2", "13-8", "0-0" from the OCR text.
const SCORE_PATTERN = /(\d{1,2})\s*\d:\d{2}\s*(\d{1,2})/;

// Valorant's actual game process names on Windows. Checking the OS
// process list is the same category of "safe" as everything else here —
// it's the same info Task Manager shows, not something read from inside
// the game's memory.
const GAME_PROCESS_NAMES = ["valorant-win64-shipping.exe", "valorant.exe"];

// If the game is running but we haven't successfully read a score in
// this long, drop from 'in-match' down to 'waiting' rather than staying
// stuck on a stale state (e.g. you tabbed out to the menu mid-session).
const WAITING_TIMEOUT_MS = 8000;

/**
 * Watches the configured screen region for the match score and calls
 * onRoundChange(roundNumber, meta) whenever the round changes, and
 * onStateChange(state) whenever the game's state changes between
 * 'not-running' | 'waiting' | 'in-match'.
 *
 * Round number = (score A) + (score B) + 1 — i.e. "how many rounds have
 * finished, plus the one currently being played." The left number in the
 * score readout is always treated as the player's own score (it never
 * flips with attack/defense side), so win/loss can be derived directly:
 * if the left number went up since the last read, the round that just
 * ended was won; if the right number went up, it was lost.
 *
 * `meta` is `{ concludedRound, outcome }` describing the round that just
 * finished (outcome is 'won' | 'lost'), or `null` on the very first
 * successful read of a session (nothing concluded yet).
 *
 * Nothing here touches the game process — it checks the OS process list
 * (same as Task Manager) and reads a screenshot of a tiny screen region
 * with OCR (same category as any screen capture tool). No memory reads,
 * no injection, no simulated input.
 */
class RoundWatcher {
  constructor({ onRoundChange, onStateChange }) {
    this.onRoundChange = onRoundChange;
    this.onStateChange = onStateChange;
    this.lastRound = 0;
    this.lastMy = null;
    this.lastEnemy = null;
    this.lastScoreReadAt = 0;
    this.state = "not-running";
    this.worker = null;
    this.timer = null;
  }

  async start() {
    this.worker = await createWorker("eng");
    // Restrict OCR to digits and the dash — much more reliable than
    // letting it guess at arbitrary text.
    await this.worker.setParameters({
      tessedit_char_whitelist: "0123456789:",
      tessedit_pageseg_mode: "7",
    });

    this.timer = setInterval(() => this._tick(), config.pollIntervalMs);
    await this._tick(); // don't wait a full interval before the first check
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.worker) await this.worker.terminate();
  }

  // Called when a new game session starts (Alt+Shift+R) so a leftover
  // round number from the previous match doesn't linger.
  resetRoundTracking() {
    this.lastRound = 0;
    this.lastMy = null;
    this.lastEnemy = null;
    this.lastScoreReadAt = 0;
  }

  _setState(next) {
    if (next !== this.state) {
      this.state = next;
      this.onStateChange(next);
    }
  }

  async _isGameRunning() {
    try {
      const procs = await psList();
      return procs.some((p) =>
        GAME_PROCESS_NAMES.includes((p.name || "").toLowerCase()),
      );
    } catch (err) {
      // If the process check itself fails, don't flip state on bad info —
      // just keep whatever we last knew and try again next tick.
      console.error("round-watcher: process check failed:", err.message);
      return this.state !== "not-running";
    }
  }

  _getValorantWindow() {
    try {
      const windows = windowManager.getWindows();

      return (
        windows.find((win) => {
          const processPath = (win.path || "").toLowerCase();
          const processName = processPath.split("\\").pop();

          return GAME_PROCESS_NAMES.includes(processName);
        }) || null
      );
    } catch (err) {
      console.error(
        "round-watcher: failed to find Valorant window:",
        err.message,
      );
      return null;
    }
  }

  _isValorantFocused(valorantWindow) {
    try {
      if (!valorantWindow) return false;

      const activeWindow = windowManager.getActiveWindow();

      if (!activeWindow) return false;

      return activeWindow.id === valorantWindow.id;
    } catch (err) {
      console.error(
        "round-watcher: failed to check focused window:",
        err.message,
      );
      return false;
    }
  }

  _maybeGoWaiting() {
    const sinceLastRead = Date.now() - this.lastScoreReadAt;
    // Don't flicker to 'waiting' on a single missed read while actively
    // in-match — only drop down if it's been missing for a while, or we
    // never successfully read a score to begin with.
    if (this.state !== "in-match" || sinceLastRead > WAITING_TIMEOUT_MS) {
      this._setState("waiting");
    }
  }

  async _tick() {
    const running = await this._isGameRunning();
    if (!running) {
      this._setState("not-running");
      return; // no point trying OCR if the game isn't even open
    }

    try {
      const valorantWindow = this._getValorantWindow();
      console.log(
        "[OCR] Valorant window:",
        valorantWindow ? "FOUND" : "NOT FOUND",
      );

      if (!valorantWindow) {
        this._setState("waiting");
        return;
      }

      if (!this._isValorantFocused(valorantWindow)) {
        return;
      }

      const bounds = valorantWindow.getBounds();
      console.log("[OCR] Valorant bounds:", bounds);

      const {
        x: relativeX,
        y: relativeY,
        width: relativeWidth,
        height: relativeHeight,
      } = config.scoreRegion;

      // Convert relative coordinates into actual screen coordinates.
      const x = Math.round(bounds.x + bounds.width * relativeX);
      const y = Math.round(bounds.y + bounds.height * relativeY);
      const width = Math.round(bounds.width * relativeWidth);
      const height = Math.round(bounds.height * relativeHeight);

      console.log("[OCR] Capture region:", { x, y, width, height });

      const fullShot = await screenshot({ format: "png" });
      const image = await Jimp.read(fullShot);

      image.crop(x, y, width, height);

// Manually define the three OCR regions.
// All values are relative to the main cropped HUD image.
//
// leftX / leftWidth     = left score
// centerX / centerWidth = timer
// rightX / rightWidth   = right score

const leftX = 0;
const leftWidth = 50;

const centerX = 120;
const centerWidth = 90;

const rightX = 276;
const rightWidth = 50;

const leftImage = image.clone().crop(
  leftX,
  0,
  leftWidth,
  height
);

const centerImage = image.clone().crop(
  centerX,
  0,
  centerWidth,
  height
);

const rightImage = image.clone().crop(
  rightX,
  0,
  rightWidth,
  height
);

      // Save each OCR region so we can visually verify the crops.
      const path = require("path");

      await leftImage.writeAsync(path.join(__dirname, "ocr-left.png"));

      await centerImage.writeAsync(path.join(__dirname, "ocr-timer.png"));

      await rightImage.writeAsync(path.join(__dirname, "ocr-right.png"));

      console.log("[OCR] Saved debug images: left / timer / right");

      // OCR left score.
      await this.worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: "7",
      });

      const leftBuffer = await leftImage.getBufferAsync(Jimp.MIME_PNG);
      const leftResult = await this.worker.recognize(leftBuffer);
      const leftText = leftResult.data.text.trim();

      // OCR timer.
      await this.worker.setParameters({
        tessedit_char_whitelist: "0123456789:",
        tessedit_pageseg_mode: "7",
      });

      const centerBuffer = await centerImage.getBufferAsync(Jimp.MIME_PNG);
      const centerResult = await this.worker.recognize(centerBuffer);
      const centerText = centerResult.data.text.trim();

      // OCR right score.
      await this.worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        tessedit_pageseg_mode: "7",
      });

      const rightBuffer = await rightImage.getBufferAsync(Jimp.MIME_PNG);
      const rightResult = await this.worker.recognize(rightBuffer);
      const rightText = rightResult.data.text.trim();

      console.log("[OCR] Left:", JSON.stringify(leftText));
      console.log("[OCR] Timer:", JSON.stringify(centerText));
      console.log("[OCR] Right:", JSON.stringify(rightText));

      // Convert the three OCR results into score numbers.
      const my = parseInt(leftText, 10);
      const enemy = parseInt(rightText, 10);

      // We need both scores to be valid before using the result.
      if (Number.isNaN(my) || Number.isNaN(enemy)) {
        this._maybeGoWaiting();
        return;
      }

      this.lastScoreReadAt = Date.now();
      this._setState("in-match");

      const round = my + enemy + 1;

      // Only ever move the round FORWARD from OCR.
      if (round > this.lastRound) {
        let meta = null;

        if (this.lastMy !== null) {
          const concludedRound = this.lastMy + this.lastEnemy + 1;

          let outcome = null;

          if (my > this.lastMy) {
            outcome = "won";
          } else if (enemy > this.lastEnemy) {
            outcome = "lost";
          }

          if (outcome) {
            meta = {
              concludedRound,
              outcome,
            };
          }
        }

        this.lastRound = round;
        this.lastMy = my;
        this.lastEnemy = enemy;

        this.onRoundChange(round, meta);
      } else {
        // Same round, or OCR is behind a manual round override.
        this.lastMy = my;
        this.lastEnemy = enemy;
      }
    } catch (err) {
      // Swallow errors from a single bad capture (e.g. game minimized) —
      // the next tick will just try again.
      console.error(
        "round-watcher: capture/OCR failed this tick:",
        err.message,
      );
      this._maybeGoWaiting();
    }
  }
}

module.exports = { RoundWatcher };
