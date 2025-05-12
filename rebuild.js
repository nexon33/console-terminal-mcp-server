import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to read JSON file
const readJsonFile = (filePath) => {
  const absolutePath = path.resolve(__dirname, filePath);
  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(fileContent);
};

// Get electron version
const electronPackageJson = readJsonFile('./node_modules/electron/package.json');
const electronVersion = process.env.ELECTRON_VERSION || electronPackageJson.version;

console.log(`Rebuilding native modules for Electron ${electronVersion}...`);

// Run electron rebuild
try {
  // Use npx to reliably execute the electron-rebuild command
  const command = `npx electron-rebuild -f -v ${electronVersion}`;

  console.log(`Running: ${command}`);
  // Execute the command using npx
  execSync(command, { stdio: 'inherit' });
  console.log('Rebuild complete!');
} catch (error) {
  console.error('Failed to rebuild:', error);
  process.exit(1);
}