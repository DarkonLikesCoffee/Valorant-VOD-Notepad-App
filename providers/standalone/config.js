// The match score has a fixed position relative to the Valorant game
// window. These values are percentages of the Valorant window's size,
// not absolute screen pixels.
//
// Example:
//   x: 0.463 means 46.3% of the way across the Valorant window.
//   y: 0.014 means 1.4% of the way down the Valorant window.
//
// This means the score region automatically scales with different
// resolutions and window sizes.
//
// These values are based on the standard Valorant HUD layout.
// If we later discover that Valorant's HUD/UI scale changes the exact
// position, we can account for that separately.

module.exports = {
  scoreRegion: {
    x: 0.415,
    y: 0.03,
    width: 0.17,
    height: 0.03
  },

  // How often to check the screen.
  // 1500ms is intentionally conservative to keep resource usage low.
  pollIntervalMs: 1500
};