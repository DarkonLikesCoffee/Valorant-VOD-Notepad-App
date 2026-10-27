"use strict";

/**
 * Registers IPC handlers for the optional embedded browser panel.
 * The window is resolved at event time because it is created lazily.
 */
function registerBrowserIpc({ ipcMain, getBrowserWindow }) {
  ipcMain.on("browser-go-back", () => {
    const browserWin = getBrowserWindow();
    if (!browserWin) return;
    const webView = browserWin.browserWebView;
    if (webView && webView.webContents.canGoBack()) webView.webContents.goBack();
  });

  ipcMain.on("browser-go-forward", () => {
    const browserWin = getBrowserWindow();
    if (!browserWin) return;
    const webView = browserWin.browserWebView;
    if (webView && webView.webContents.canGoForward()) webView.webContents.goForward();
  });

  ipcMain.on("browser-reload", () => {
    const browserWin = getBrowserWindow();
    if (!browserWin) return;
    const webView = browserWin.browserWebView;
    if (webView) webView.webContents.reload();
  });

  ipcMain.on("browser-navigate", (_event, url) => {
    const browserWin = getBrowserWindow();
    if (!browserWin) return;
    const webView = browserWin.browserWebView;
    if (webView) webView.webContents.loadURL(url);
  });

  ipcMain.on("browser-close", () => {
    const browserWin = getBrowserWindow();
    if (browserWin) browserWin.hide();
  });
}

module.exports = { registerBrowserIpc };
