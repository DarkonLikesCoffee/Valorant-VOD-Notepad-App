const path = require('path');
const { createFloatingWindow } = require('./window');

function createToolbarWindow(size, position) {
  return createFloatingWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    preload: path.join(__dirname, 'toolbar-preload.js'),
    htmlFile: path.join(__dirname, 'toolbar.html'),
    resizable: true,
    minWidth: 220,
    minHeight: 44
  });
}

module.exports = { createToolbarWindow };
