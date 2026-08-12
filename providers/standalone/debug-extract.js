console.log('typeof extractZip:', typeof require('extract-zip'));

const extractZip = require('extract-zip');
const path = require('path');

process.on('exit', (code) => console.log('>>> PROCESS EXIT, code:', code));
process.on('unhandledRejection', (reason) => console.log('>>> UNHANDLED REJECTION:', reason));
process.on('uncaughtException', (err) => console.log('>>> UNCAUGHT EXCEPTION:', err));

const cachePath = path.join(
  process.env.LOCALAPPDATA,
  'electron', 'Cache',
  'c94f2fc32e1fb05767f75322ea533eeb9828155f017ec184140930a3ec825e81',
  'electron-v31.7.7-win32-x64.zip'
);
const dest = path.join(__dirname, 'node_modules', 'electron', 'dist');

console.log('Zip:', cachePath);
console.log('Dest:', dest);
console.log('Starting extraction...');

const p = extractZip(cachePath, { dir: dest });
console.log('extractZip() returned:', p);

p.then(() => console.log('EXTRACTION FINISHED OK'))
 .catch(err => console.log('EXTRACT ERROR:', err));