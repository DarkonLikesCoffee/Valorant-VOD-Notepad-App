// Tracks every open window in the app and enforces one consistent rule:
// clicking a window, or opening/reopening one, brings it to the front of
// the stack. Without this, overlapping overlay windows (notepad, toolbar,
// settings, etc.) can get stuck behind each other with no way to reorder
// them, since none of them have normal OS title bars to click on.
class WindowManager {
  constructor() {
    this.windows = new Set();
  }

  register(win) {
    if (this.windows.has(win)) return;

    this.windows.add(win);

    win.on("closed", () => {
      this.windows.delete(win);
    });
  }

  bringToFront(win) {
    if (!win || win.isDestroyed()) return;

    if (!win.isVisible()) {
      win.show();
    }

    if (typeof win.moveTop === "function") {
      win.moveTop();
    }
  }

  showAndFocus(win) {
    this.register(win);
    this.bringToFront(win);
  }
}

module.exports = { WindowManager };
