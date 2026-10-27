"use strict";

/**
 * Creates the system-tray icon and menu. Electron-specific dependencies
 * are injected so this module can be tested without launching Electron.
 */
function createTray({ Tray, Menu, nativeImage, showMainApp, quitApp }) {
  const tray = new Tray(createTrayIcon(nativeImage));
  tray.setToolTip("Valorant VOD Notepad");

  const menu = Menu.buildFromTemplate([
    { label: "Open App", click: () => showMainApp() },
    { type: "separator" },
    { label: "Quit", click: () => quitApp() },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => showMainApp());
  return tray;
}

function createTrayIcon(nativeImage) {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const radius = size / 2 - 1.5;
  const color = [255, 70, 85];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const index = (y * size + x) * 4;
      if (distance <= radius) {
        buffer[index] = color[0];
        buffer[index + 1] = color[1];
        buffer[index + 2] = color[2];
        buffer[index + 3] = 255;
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

module.exports = { createTray, createTrayIcon };
