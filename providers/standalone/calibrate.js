// Run with: npm run calibrate
// Takes one full screenshot and saves it next to this file as
// calibrate.png. Open it in any image viewer/editor that shows pixel
// coordinates (Paint, Preview, GIMP, etc), hover over the top-left and
// bottom-right corners of the match score, and write those numbers into
// config.js's scoreRegion.
//
// Best run WHILE Valorant is open in-game (not the menu) so the score HUD
// is actually visible in the screenshot.
const screenshot = require('screenshot-desktop');
const path = require('path');

(async () => {
  const outPath = path.join(__dirname, 'calibrate.png');
  await screenshot({ filename: outPath });
  console.log(`Saved a full screenshot to ${outPath}`);
  console.log('Open it and find the pixel coordinates of the match score,');
  console.log('then update scoreRegion in config.js.');
})();
