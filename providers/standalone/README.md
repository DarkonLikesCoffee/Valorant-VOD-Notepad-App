# Standalone provider

Notepad overlay that detects the round automatically by reading the
on-screen match score (OCR) — no keypress needed most of the time, with a
manual hotkey as backup for whenever it misses.

## Why it's safe
It never touches the Valorant process — no memory reading, no injection,
no input automation. It's a screenshot of a small screen region, cropped,
and read with OCR. Same category as a screen recorder.

## Setup
Requires **Node 18–24**. Node 25+ is known to hang silently during
`npm start` the first time Electron's binary needs to extract (no error,
just never finishes) — if you have `nvm`, running `nvm use` in this
folder will pick up the pinned version automatically from `.nvmrc`.

```
npm install
```

The `active-win` package (used only by the optional Tab-capture feature
below) is a native module and is marked optional — if your machine
doesn't have a C++ build toolchain, npm will skip it rather than fail
the whole install; everything except Tab-capture still works.

### 1. Calibrate (do this once)
```
npm run calibrate
```
This saves a full screenshot as `calibrate.png` next to this file. Open it
in an image viewer that shows pixel coordinates (Paint, Preview, GIMP,
etc), find the top-left corner of the match score readout and its
width/height, and update `scoreRegion` in `config.js` with those numbers.

Run this again any time you change resolution, UI scale, or HUD layout.

### 2. Run it
```
npm start
```
Run Valorant in **Borderless / Windowed Fullscreen**, not exclusive
fullscreen — exclusive fullscreen hides all overlays at the OS level.

## Hotkeys
All customizable in Settings (gear icon, or open it with the `settings`
hotkey). Defaults:
- **Alt+N** — open/close the VOD notepad. Opening it locks onto whatever
  round is live right now, cursor ready to type. If a new round starts
  while you're writing, the notepad stays put on the round you opened it
  on — it re-syncs to the live round the next time you open it.
- **Alt+R** — manually bump the live round by one (fallback for when OCR
  misses a change).
- **Alt+Shift+R** — start a brand new session for a new match.
- **Alt+Left / Alt+Right** — browse to the previous/next round's notes.
  Opens the notepad first if it isn't already open.
- **Alt+S** — open settings.
- **Alt+T** — open/close the toolbar.
- **Alt+M** — open the scratch notepad (freeform, not tied to any round).
- **Alt+H** — open session history (browse and reopen past sessions).
- **Ctrl+B / Ctrl+I** (while typing) — wrap the selected text in markdown
  bold/italic. Toolbar buttons in the notepad do the same, plus heading
  shortcuts.
- **Esc** (while a window is focused) — save and close it.

Hotkeys are captured by pressing the actual key combo in Settings (click
the field, then press it) rather than typed as text — this also means an
invalid combo can't be saved in the first place.

## Windows
Every window (notepad, toolbar, scratch notepad, session browser) is
independent and remembers its own size and position between launches.
Position presets: top-left, top-right, bottom-left, bottom-right, center
— or drag it anywhere and it switches to a remembered custom spot
automatically. Clicking a window, or opening/reopening one, always
brings it to the front of the stack.

The toolbar (Alt+T) has quick-access buttons for: VOD notepad, scratch
notepad, session history, manual round bump, pin/unpin (locks the
notepad and toolbar in place so they can't be accidentally dragged),
dark/light theme toggle, settings, and quit.

## Round outcomes
Each round's win/loss is tracked automatically from the score (your
score is always the left number, regardless of attack/defense side) and
written into the exported doc, along with a running score tally at the
top.

## The status banner
The notepad shows a small banner at the top based on whether Valorant is
detected running (via the OS process list — nothing read from inside the
game):
- **"Start a game to begin your live VOD review"** — Valorant isn't running.
- **"Waiting for match to start..."** — Valorant is running but no score
  has been read yet (menu, loading screen, etc).
- No banner — a score was just read successfully.

This is informational only — the textarea is never locked, so you can
always type regardless of what state it's in.

## Optional: Tab-triggered scoreboard capture
Off by default — toggle it on in Settings. When enabled, pressing Tab
**while Valorant is the focused window** takes a screenshot of the
scoreboard and attaches its file path to the current round's entry in
the exported doc. The Tab hotkey is only ever registered while Valorant
has focus (checked once a second) and is released the instant it
doesn't, so Tab behaves completely normally in every other app. This
uses the `active-win` package, a native module — if `npm install`
doesn't rebuild it correctly for Electron, run
`npx electron-rebuild -f -w active-win` manually.

## Where notes go
`Documents/ValorantVODNotes/session-<timestamp>.md` — one section per
round, ready to read alongside your VOD. Scratch notes live in
`Documents/ValorantVODNotes/scratchpad.md`. Scoreboard screenshots (if
enabled) go in `Documents/ValorantVODNotes/scoreboards/`. Settings are
saved separately in your Electron user-data folder and persist across
restarts.

## If OCR isn't picking up the score reliably
- Re-run calibration — this is almost always a region-coordinates issue.
- Try nudging `scoreRegion` a few pixels in `config.js` and testing again.
- Increase `pollIntervalMs` in `config.js` if you want less frequent
  checks (lighter, but slower to notice a change).
