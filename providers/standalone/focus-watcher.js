let activeWin;
try {
  activeWin = require('active-win');
} catch (err) {
  activeWin = null;
}

const GAME_WINDOW_HINTS = ['chrome'];

// Watches the foreground window (same technique as tab-capture.js) and
// calls onFocusChange(isValorantFocused) only when the REAL external
// focus state changes.
//
// Critical detail: this deliberately ignores focus landing on any of our
// OWN windows (notepad/toolbar/scratch/sessions/backdrop). Those are all
// owned by this same Electron process, so we can recognize them by
// comparing owner.processId to our own process.pid. Without this check,
// opening the overlay while Valorant is focused would immediately steal
// OS focus to the notepad/toolbar, which this watcher would see as
// "Valorant lost focus" and hide the overlay again a moment later --
// which in turn returns focus to Valorant, which re-opens the overlay,
// which steals focus again... an infinite open/close flicker loop. This
// is exactly the "everything glitches" bug: ignoring our own windows'
// focus breaks that loop entirely.
class FocusWatcher {
  constructor(onFocusChange) {
    this.onFocusChange = onFocusChange;
    this.lastState = null;
    this.timer = null;
  }

  start() {
    if (!activeWin) {
      console.error('focus-watcher: "active-win" unavailable — overlay will stay visible regardless of focus.');
      return;
    }
    this.timer = setInterval(() => this._poll(), 500);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async _poll() {
    try {
      const focused = await activeWin();
      const ownerPid = focused && focused.owner && focused.owner.processId;

      // Focus landed on one of our own windows -- not a real focus
      // change from the user's perspective, so ignore this tick entirely
      // and keep whatever the last real external state was.
      if (ownerPid === process.pid) return;

      const title = ((focused && focused.title) || '').toLowerCase();
      const owner = ((focused && focused.owner && focused.owner.name) || '').toLowerCase();

      // DEBUG: shows exactly what Windows reports as the focused window,
      // every 500ms. Use this to find the real title/owner text for
      // whatever app you're testing with, then put the right word into
      // GAME_WINDOW_HINTS above. Comment this line back out once you've
      // found it -- it's noisy every tick, forever, otherwise.
      // console.log(`[focus-watcher] title="${title}" owner="${owner}"`);

      const isValorantFocused = GAME_WINDOW_HINTS.some((h) => title.includes(h) || owner.includes(h));

      if (isValorantFocused !== this.lastState) {
        this.lastState = isValorantFocused;
        // This one only fires on an actual transition, so it's fine to
        // leave in permanently -- it's your "did it recognize open/close"
        // signal.
        // console.log(`[focus-watcher] ${isValorantFocused ? 'GAME FOCUSED (opened / tabbed in)' : 'GAME LOST FOCUS (tabbed out / closed)'}`);
        this.onFocusChange(isValorantFocused);
      }
    } catch (err) {
      console.error('focus-watcher: foreground window check failed:', err.message);
    }
  }
}

module.exports = { FocusWatcher };