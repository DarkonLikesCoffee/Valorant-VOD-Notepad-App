// Runs as postinstall. active-win and node-window-manager are optional
// (see package.json) — on a machine without a C++ build toolchain, npm
// may skip installing them entirely rather than fail. If that happened,
// there's nothing to rebuild, and that's fine: the features they power
// just won't be available, everything else in the app still works.
//
// This script NEVER exits non-zero — a broken/missing optional native
// module must not block `npm install` for the rest of the app.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');

function rebuildOptionalModule(moduleName, featureDescription) {
  const modulePath = path.join(rootDir, 'node_modules', moduleName);

  if (!fs.existsSync(modulePath)) {
    console.log(`[postinstall] ${moduleName} not installed (optional) — skipping rebuild.`);
    console.log(`[postinstall] ${featureDescription} will be unavailable; everything else works fine.`);
    return;
  }

  try {
    execSync(`npx electron-rebuild -f -w ${moduleName}`, { stdio: 'inherit', cwd: rootDir });
    console.log(`[postinstall] ${moduleName} rebuilt successfully.`);
  } catch (err) {
    console.warn(`[postinstall] ${moduleName} rebuild failed — ${featureDescription} will be unavailable.`);
    console.warn('[postinstall] Everything else in the app is unaffected. Original error:');
    console.warn(err.message);
  }
}

rebuildOptionalModule('active-win', 'Tab-triggered scoreboard capture');
rebuildOptionalModule('node-window-manager', 'Window detection/focus features');

process.exit(0);