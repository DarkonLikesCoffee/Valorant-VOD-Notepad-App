const path = require('path');
const { createFloatingWindow } = require('./window');

function createScratchWindow(size, position) {
  return createFloatingWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    preload: path.join(__dirname, 'scratch-preload.js'),
    htmlFile: path.join(__dirname, 'scratch.html'),
    resizable: true,
    minWidth: 220,
    minHeight: 160
  });
}

module.exports = { createScratchWindow };
