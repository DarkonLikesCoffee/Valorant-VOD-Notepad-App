// These pixel coordinates point at the "3-2" style match score at the top
// of the Valorant HUD. THE DEFAULTS BELOW ARE A GUESS — they depend on your
// resolution and UI scale, so you need to calibrate them for your own
// screen. See providers/standalone/README.md for how.
module.exports = {
  scoreRegion: {
    x: 890,   // left edge of the crop box, in screen pixels
    y: 15,    // top edge of the crop box
    width: 140,
    height: 40
  },
  // How often to check the screen. 1500ms is a good default: fast enough
  // to catch a round change quickly, slow enough to be effectively free.
  pollIntervalMs: 1500
};
