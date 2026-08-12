const { BrowserWindow } = require('electron');
const path = require('path');

// The one NORMAL window in the app -- has a real title bar, shows in the
// taskbar, isn't pinned above everything else. This is "the app" itself:
// Scratch Pad and Session History live right in it, with a button into
// the shared Settings window. Deliberately does NOT include the live
// VOD-review notepad -- that only makes sense while actually in a round,
// which is what the in-game overlay is for. Works anytime, regardless of
// whether Valorant is even running.
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 600,
    minWidth: 380,
    minHeight: 480,
    show: false,
    frame: false, // was true -- that's what drew the extra native title
                   // bar on top of the custom one main-window.html builds.
                   // Frameless means WE own the whole title bar now, which
                   // is why minimize/maximize/close buttons had to be
                   // added to main-window.html + wired below.
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    title: 'Valorant VOD Notepad',
    webPreferences: {
      preload: path.join(__dirname, 'main-preload.js'),
      contextIsolation: true
    }
  });

  // ---- LESSON: two separate knobs control a window's size ----
  // 1) width/height above -- this is only the window's size in its
  //    "normal" (not maximized, not fullscreen) state. Think of it as
  //    the size it would snap back to if someone hit the restore-down
  //    button. It does NOT control what size the window opens at if you
  //    maximize it.
  // 2) An explicit call like the one below -- this tells the window
  //    what STATE to open in. `.maximize()` makes it fill the screen
  //    (but still show the taskbar and this window's own title bar) --
  //    exactly how double-clicking a normal app's title bar behaves.
  //    That's different from `.setFullScreen(true)`, which hides the
  //    taskbar and title bar entirely (think: a game, or a video player
  //    in fullscreen) -- not appropriate here since this is meant to
  //    look and behave like an ordinary desktop app window.
  //
  // Calling it here, before .show(), means it opens already maximized
  // with no visible "pop in small, then snap big" flicker.
  //
  // TO DO THIS AGAIN LATER: any window in this project follows the same
  // shape -- `new BrowserWindow({ width, height, ... })`. To change a
  // window's default size, edit those numbers directly (e.g. the
  // notepad's are in core/window.js). To make ANY window open maximized
  // instead of at a fixed size, add a `win.maximize();` call right after
  // creating it, same as here.
  win.maximize();

  // Electron attaches a default File/Edit/View/Window/Help menu to any
  // frame:true window automatically -- none of those menus do anything
  // useful here (no menu-driven features exist), so remove it.
  // TO DO THIS AGAIN LATER: this is a per-window call, so it only ever
  // needs to go on windows that have frame: true in the first place --
  // every other window in this app is frame: false and never gets a
  // menu bar to begin with.
  win.removeMenu();

  // TEMP: force DevTools open so we can see the [titlebar] console logs.
  // Remove this line once the button bug is found and fixed.
  // win.webContents.openDevTools({ mode: 'detach' });

  win.loadFile(path.join(__dirname, 'main-window.html'));
  return win;
}

module.exports = { createMainWindow };