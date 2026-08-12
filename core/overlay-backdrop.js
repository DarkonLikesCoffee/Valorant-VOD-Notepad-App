const { BrowserWindow, screen } = require('electron');
const path = require('path');

// Full-screen, click-capturing, non-content dim layer -- purely the
// "everything behind the overlay panels goes dark" effect, same idea as
// Steam's overlay. Deliberately NOT click-through: while it's showing,
// clicks land on it (which closes the overlay) instead of passing
// through to the game, so the overlay behaves like it "has focus" the
// way Steam's does.
function createBackdropWindow() {
  const { width, height, x, y } = screen.getPrimaryDisplay().bounds;

  const win = new BrowserWindow({
    width, height, x, y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false, // never steals keyboard focus from panels above it
    webPreferences: {
      preload: path.join(__dirname, 'backdrop-preload.js'),
      contextIsolation: true
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(false);
  win.loadFile(path.join(__dirname, 'backdrop.html'));
  return win;
}

module.exports = { createBackdropWindow };
