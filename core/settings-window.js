const { BrowserWindow } = require('electron');
const path = require('path');

function createSettingsWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    minWidth: 340,
    minHeight: 400,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'settings.html'));
  return win;
}

module.exports = { createSettingsWindow };
