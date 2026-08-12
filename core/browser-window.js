const { BrowserWindow, WebContentsView } = require('electron');
const path = require('path');

function createBrowserWindow(size, position) {
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,

    show: false,
    frame: false,
    resizable: true,

    minWidth: 500,
    minHeight: 350,

    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,

    webPreferences: {
    preload: path.join(__dirname, 'browser-preload.js'),
    contextIsolation: true,
    nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });

  const webView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.contentView.addChildView(webView);

  function resizeWebView() {
    const bounds = win.getContentBounds();

    webView.setBounds({
      x: 0,
      y: 46,
      width: bounds.width,
      height: Math.max(0, bounds.height - 46)
    });
  }

  win.on('resize', resizeWebView);

  win.loadFile(path.join(__dirname, 'browser.html'));

  webView.webContents.loadURL('https://www.google.com');

  resizeWebView();

  win.browserWebView = webView;

  return win;
}

module.exports = {
  createBrowserWindow
};