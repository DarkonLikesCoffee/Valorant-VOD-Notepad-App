const fs = require('fs');

// Defaults for everything persisted between launches: hotkeys, the
// notepad's appearance, and per-window size/position for every
// independent window the app can open.
const DEFAULTS = {
  hotkeys: {
    toggle: 'Alt+N',
    manualRound: 'Alt+R',
    newSession: 'Alt+Shift+R',
    prevRound: 'Alt+Left',
    nextRound: 'Alt+Right',
    settings: 'Alt+S',
    toolbar: 'Alt+T',
    scratch: 'Alt+M',
    sessions: 'Alt+H'
  },
  theme: 'dark', // app-wide -- toggled from the toolbar's sun/moon icon
  notepad: {
    opacity: 0.88,
    textSize: 14,
    showOnOpen: true, // appears automatically when the overlay opens
    size: { mode: 'preset', preset: 'medium', width: 420, height: 360 },
    position: { mode: 'preset', preset: 'top-right', x: null, y: null }
  },
  toolbar: {
    showOnOpen: true,
    size: { mode: 'preset', preset: 'small', width: 320, height: 56 },
    position: { mode: 'preset', preset: 'top-left', x: null, y: null }
  },
  scratch: {
    showOnOpen: false, // off by default -- opt in per its own hotkey
    size: { mode: 'preset', preset: 'medium', width: 360, height: 420 },
    position: { mode: 'preset', preset: 'center', x: null, y: null }
  },
  sessions: {
    showOnOpen: false,
    size: { mode: 'preset', preset: 'medium', width: 380, height: 460 },
    position: { mode: 'preset', preset: 'center', x: null, y: null }
  },
  tabCapture: { enabled: false }
};

// Separate size presets per window type since a toolbar and a notepad
// have very different natural proportions.
const SIZE_PRESETS = {
  notepad: {
    small: { width: 320, height: 260 },
    medium: { width: 420, height: 360 },
    large: { width: 520, height: 460 }
  },
  toolbar: {
    small: { width: 280, height: 52 },
    medium: { width: 360, height: 60 },
    large: { width: 460, height: 72 }
  },
  scratch: {
    small: { width: 300, height: 340 },
    medium: { width: 360, height: 420 },
    large: { width: 440, height: 520 }
  },
  sessions: {
    small: { width: 320, height: 380 },
    medium: { width: 380, height: 460 },
    large: { width: 460, height: 560 }
  }
};

const POSITION_PRESETS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];

function deepMerge(defaults, saved) {
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (saved && typeof saved[key] === 'object' && saved[key] !== null && !Array.isArray(saved[key])
        && typeof defaults[key] === 'object' && defaults[key] !== null) {
      out[key] = deepMerge(defaults[key], saved[key]);
    } else if (saved && saved[key] !== undefined) {
      out[key] = saved[key];
    }
  }
  return out;
}

function load(settingsPath) {
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return deepMerge(DEFAULTS, raw);
    } catch (err) {
      console.error('settings-store: settings.json was unreadable, falling back to defaults:', err.message);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function save(settingsPath, settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// Resolves a window's `size` settings object down to actual pixel
// dimensions, whether it's on a preset or a custom size.
function sizeFor(windowId, sizeSettings) {
  if (sizeSettings.mode === 'custom') {
    const fallback = SIZE_PRESETS[windowId].medium;
    return {
      width: sizeSettings.width || fallback.width,
      height: sizeSettings.height || fallback.height
    };
  }
  const presets = SIZE_PRESETS[windowId] || SIZE_PRESETS.notepad;
  return presets[sizeSettings.preset] || presets.medium;
}

module.exports = { DEFAULTS, SIZE_PRESETS, POSITION_PRESETS, load, save, sizeFor };
