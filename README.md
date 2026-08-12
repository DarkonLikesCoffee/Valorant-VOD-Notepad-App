# Valorant VOD Notepad

A hotkey-triggered notepad overlay for Valorant. Open it mid-match, get the
current round pre-filled automatically, jot down what just happened, and end
the game with a full round-by-round review doc ready for VOD study.

## How it's built

- `core/` — the notepad itself: window, typing, saving notes, and
  generating the end-of-match review document. Fully open source, no
  dependency on Overwolf.
- `providers/standalone/` — feeds the core a round number automatically by
  reading the on-screen match score (OCR), with a manual hotkey as backup.
  Zero dependencies beyond free/open-source libraries, works anywhere.
- `providers/overwolf/` — feeds the core round number and live combat stats
  automatically via Overwolf's GEP API. Requires running inside Overwolf.
  Not built yet — waiting on app whitelisting.

Both providers plug into the same core, so the notepad works the same way
either way — the only difference is how round data gets filled in.

## Status

Standalone provider: in progress.
Overwolf provider: not started (pending Overwolf app approval).

## Running the standalone version

See `providers/standalone/README.md` for setup, calibration, and hotkeys.

## v5 changes
- **Unified overlay**: `Alt+N` now opens/closes a single Steam-style overlay
  (dimmed backdrop + all panels marked "show when overlay opens" in
  Settings), instead of each window toggling independently. Per-panel
  hotkeys (`Alt+T`/`Alt+M`/`Alt+H`) add/remove that panel from the open
  overlay. Settings (`Alt+S`) stays independent, reachable any time.
- **Auto-hide on tab-out**: the overlay now hides automatically when
  Valorant loses focus (`providers/standalone/focus-watcher.js`, uses
  `active-win`) and restores exactly what was showing when it regains
  focus. Respects the existing pin feature.
- Scratch notepad and Session-history windows now have full size/position
  settings (previously hardcoded), same as the notepad and toolbar.
- Fullscreen note: overlays still cannot draw over Valorant's true
  exclusive fullscreen -- this is an OS/game-mode limitation, not
  something this app can fix. Use Borderless/Windowed Fullscreen in
  Valorant's video settings, or ensure "Disable fullscreen optimizations"
  is unchecked on VALORANT-Win64-Shipping.exe's Properties > Compatibility.
