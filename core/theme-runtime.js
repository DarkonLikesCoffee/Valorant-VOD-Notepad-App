// // Shared by every renderer window. Swaps the `theme-dark` / `theme-light`
// // class on <html>, which is all theme.css needs to repaint every CSS
// // variable at once.
// function applyTheme(theme) {
//   document.documentElement.classList.remove('theme-dark', 'theme-light');
//   document.documentElement.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
// }

// Shared by every renderer window. Swaps the `theme-<name>` class on
// <html>, which is all theme.css needs to repaint every CSS variable at
// once. Generalized to any theme name theme.css defines a block for
// (dark, light, cyan, amber, ...) -- previously this only knew about
// 'light' vs 'dark' and silently collapsed every other name to 'dark',
// which is why new themes used to render identically to dark mode.
const KNOWN_THEMES = ['dark', 'light', 'cyan', 'amber'];

function applyTheme(theme) {
  const name = KNOWN_THEMES.includes(theme) ? theme : 'dark';
  KNOWN_THEMES.forEach((t) => document.documentElement.classList.remove(`theme-${t}`));
  document.documentElement.classList.add(`theme-${name}`);
}