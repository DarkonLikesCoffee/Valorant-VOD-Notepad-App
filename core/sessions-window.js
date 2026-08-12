const path = require('path');
const { createFloatingWindow } = require('./window');

function createSessionsWindow(size, position) {
  return createFloatingWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    preload: path.join(__dirname, 'sessions-preload.js'),
    htmlFile: path.join(__dirname, 'sessions.html'),
    resizable: true,
    minWidth: 260,
    minHeight: 200
  });
}

module.exports = { createSessionsWindow };
