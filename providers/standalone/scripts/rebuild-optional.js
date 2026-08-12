// Runs as postinstall. active-win is optional (see package.json) — on a
// machine without a C++ build toolchain, npm may skip installing it
// entirely rather than fail. If that happened, there's nothing to
// rebuild, and that's fine: the Tab-triggered scoreboard capture feature
// just won't be available, everything else in the app still works.
//
// This script NEVER exits non-zero — a broken/missing optional native
// module must not block `npm install` for the rest of the app.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const activeWinPath = path.join(__dirname, '..', 'node_modules', 'active-win');

if (!fs.existsSync(activeWinPath)) {
  console.log('[postinstall] active-win not installed (optional) — skipping rebuild.');
  console.log('[postinstall] Tab-triggered scoreboard capture will be unavailable; everything else works fine.');
  process.exit(0);
}

try {
  execSync('npx electron-rebuild -f -w active-win', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  console.log('[postinstall] active-win rebuilt successfully.');
} catch (err) {
  console.warn('[postinstall] active-win rebuild failed — Tab-triggered scoreboard capture will be unavailable.');
  console.warn('[postinstall] Everything else in the app is unaffected. Original error:');
  console.warn(err.message);
}

process.exit(0);
