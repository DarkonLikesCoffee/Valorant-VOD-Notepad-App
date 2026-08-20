const { BrowserWindow, screen } = require('electron');
const path = require('path');

// A tiny, click-through overlay used for the End Session hotkey. It stays
// above borderless fullscreen games without stealing focus from the game.
function createEndSessionToastWindow() {
  const { x, y, width } = screen.getPrimaryDisplay().workArea;
  const toastWidth = 370;
  const toastHeight = 82;
  const win = new BrowserWindow({
    width: toastWidth,
    height: toastHeight,
    x: x + Math.round((width - toastWidth) / 2),
    y: y + 36,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'end-session-toast-preload.js'),
      contextIsolation: true
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true);
  win.loadFile(path.join(__dirname, 'end-session-toast.html'));
  return win;
}

module.exports = { createEndSessionToastWindow };
