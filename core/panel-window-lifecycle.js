"use strict";

/**
 * Overlay windows are long-lived singletons owned by the main process.
 * Treat a user close (including Alt+F4) as a hide action so callers never
 * retain a destroyed BrowserWindow and the overlay controller can update state.
 */
function keepPanelWindowAlive(win, { isQuitting, onClose }) {
  win.on("close", (event) => {
    if (isQuitting()) return;
    event.preventDefault();
    onClose();
  });
}

module.exports = { keepPanelWindowAlive };
