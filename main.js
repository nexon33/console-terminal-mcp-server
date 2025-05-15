import { app, ipcMain } from 'electron';
import logger from './logger.js';
import mcpServerSingleton from './mcp-server.js'; // Assuming this is still used or will be refactored/handled

import TerminalManager from './src/terminal-manager.js';
import ApiServer from './src/api-server.js';
import ElectronAppManager from './src/electron-app-manager.js';

// Optional: Early error handling for critical startup phase
process.on('uncaughtException', (error) => {
  logger.error('[Main] Critical Uncaught Exception during startup phase:', error);
  // In a real app, you might want to exit if error is fatal before managers are up
  // For now, just logging it.
});

logger.info('[Main] Application starting...');

// Initialize the managers
// ElectronAppManager needs access to terminalManager for cleanup on quit.
// TerminalManager needs a way to get the mainWindow to send PTY output to the renderer.

let electronAppManager = null; // Declare electronAppManager to be accessible in getMainWindow

// This function allows TerminalManager to get a reference to the main window
// once ElectronAppManager has created it.
const getMainWindow = () => {
  if (electronAppManager && typeof electronAppManager.getMainWindowInstance === 'function') {
    return electronAppManager.getMainWindowInstance();
  }
  logger.warn('[Main] getMainWindow called before ElectronAppManager is fully initialized or getMainWindowInstance is not available.');
  return null;
};

const terminalManager = new TerminalManager(ipcMain, getMainWindow);

// Pass terminalManager to ElectronAppManager for cleanup tasks
// Also pass ipcMain to ElectronAppManager if it registers its own global handlers (it does for window/app events)
electronAppManager = new ElectronAppManager(terminalManager, ipcMain);

// Pass terminalManager to ApiServer so it can use terminal functionalities
const apiServerManager = new ApiServer(terminalManager);

// Start the main application manager (which handles app.on('ready'))
electronAppManager.start();

// Start the API server
apiServerManager.start();

// Start the MCP server (from original main.js, if still needed)
// Consider if mcpServerSingleton needs to be refactored or integrated similarly.
if (mcpServerSingleton && typeof mcpServerSingleton.start === 'function') {
  try {
    mcpServerSingleton.start();
    logger.info(`[Main] MCP Server started successfully (port: ${mcpServerSingleton.getPort ? mcpServerSingleton.getPort() : 'N/A'}).`);
  } catch (error) {
    logger.error('[Main] Failed to start MCP Server:', error);
  }
} else {
  logger.warn('[Main] mcpServerSingleton or its start method is not available.');
}

logger.info('[Main] All managers initialized and services started/starting.'); 