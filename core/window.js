const { BrowserWindow, screen } = require('electron');

// Creates a frameless, transparent, always-on-top overlay window. Same
// shape used for every window in this app (notepad, toolbar, scratch
// notepad, session browser) -- only the HTML/preload and size differ.
function createFloatingWindow({ width, height, x, y, preload, htmlFile, resizable = true, minWidth = 200, minHeight = 120 }) {
  const win = new BrowserWindow({
    width, height, x, y,
    minWidth, minHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload,
      contextIsolation: true
    }
  });

  // 'screen-saver' level lets it draw over a fullscreen game on
  // Windows/macOS. Game must run in Borderless/Windowed Fullscreen -- true
  // exclusive fullscreen hides all overlays at the OS level, not specific
  // to this app.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(htmlFile);
  return win;
}

// Computes x/y for a named position preset given a window size, anchored
// to the primary display's work area (excludes the taskbar).
function defaultPositionFor(preset, size) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const margin = 20;
  const positions = {
    'top-left': { x: margin, y: margin },
    'top-right': { x: sw - size.width - margin, y: margin },
    'bottom-left': { x: margin, y: sh - size.height - margin },
    'bottom-right': { x: sw - size.width - margin, y: sh - size.height - margin },
    center: { x: Math.round((sw - size.width) / 2), y: Math.round((sh - size.height) / 2) }
  };
  return positions[preset] || positions['top-right'];
}

// Pulls a window's position back inside the screen's work area if it
// would otherwise hang off an edge -- e.g. a window custom-positioned
// near the bottom-right, then resized to a bigger preset, would
// otherwise extend past the edge since only its size changed, not its
// x/y. Clamps size too, as a safety net in case a custom width/height
// is somehow bigger than the actual screen.
// TO REUSE THIS PATTERN LATER: any time you compute a final {x, y} for
// a window right before creating/moving it, wrap it in this call.
function clampToScreen(pos, size) {
  const { x: dx, y: dy, width: dw, height: dh } = screen.getPrimaryDisplay().workArea;
  const width = Math.min(size.width, dw);
  const height = Math.min(size.height, dh);
  const maxX = dx + dw - width;
  const maxY = dy + dh - height;
  return {
    x: Math.min(Math.max(pos.x, dx), maxX),
    y: Math.min(Math.max(pos.y, dy), maxY)
  };
}

module.exports = { createFloatingWindow, defaultPositionFor, clampToScreen };