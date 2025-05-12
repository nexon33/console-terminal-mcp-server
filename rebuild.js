const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

// Get electron version
const electronVersion = process.env.ELECTRON_VERSION || 
                        require('./node_modules/electron/package.json').version;

console.log(`Rebuilding native modules for Electron ${electronVersion}...`);

// Run electron rebuild
try {
  let command = '';
  if (os.platform() === 'win32') {
    command = `node_modules\\.bin\\electron-rebuild.cmd -f -v ${electronVersion}`;
  } else {
    command = `./node_modules/.bin/electron-rebuild -f -v ${electronVersion}`;
  }
  
  console.log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit' });
  console.log('Rebuild complete!');
} catch (error) {
  console.error('Failed to rebuild:', error);
  process.exit(1);
}