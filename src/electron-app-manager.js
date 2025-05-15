import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.js'; // Assuming logger is in the root
import * as IpcConstants from './ipc-constants.js';

// Get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ElectronAppManager {
  constructor(terminalManagerInstance) {
    this.mainWindow = null;
    this.tray = null;
    this.terminalManager = terminalManagerInstance; // To call cleanup methods
    this.appIsQuitting = false;

    this._registerAppEventListeners();
    this._registerIpcHandlers();
  }

  _createMainWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      return this.mainWindow;
    }

    this.mainWindow = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 640,
      minHeight: 480,
      title: 'MCP Terminal',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'preload.js') // Adjusted path to root
      },
      backgroundColor: '#1e1e1e',
      show: false,
      autoHideMenuBar: false,
      frame: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: false
    });

    this.mainWindow.removeMenu(); // Remove default menu bar

    // Windows-specific handling for Alt key (from main.js)
    if (process.platform === 'win32') {
      this.mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Alt' || (input.alt && !input.control && !input.meta && !input.shift)) {
          event.preventDefault();
          if (input.type === 'keyDown' && input.key === 'Alt') {
            this.mainWindow.webContents.send(IpcConstants.ALT_KEY_PRESSED);
          }
        }
      });
    }

    this.mainWindow.loadFile('terminal.html'); // Assuming terminal.html is in root

    this.mainWindow.once('ready-to-show', () => {
      setTimeout(() => {
        this.mainWindow.show();
        if (process.platform === 'win32') {
          this.mainWindow.setMenuBarVisibility(false); // Ensure menu bar is hidden
        }
        this.mainWindow.webContents.send(IpcConstants.WINDOW_READY);
      }, 100);
    });

    this.mainWindow.on('closed', () => {
      logger.info('[EAM] Main window closed.');
      // Windows-specific aggressive cleanup (original logic from main.js window close)
      // This should now be primarily handled by terminalManager's cleanupAllTerminals
      // or specific session cleanups triggered by UI.
      // The app quit handler is the main place for overall cleanup.
      if (process.platform === 'win32' && !this.appIsQuitting) {
         logger.info('[EAM] Performing Windows-specific terminal cleanup on window close.');
         // This might be too aggressive if other windows could exist or if user expects sessions to persist
         // For a single-window app where closing means quitting, this is okay.
         // this.terminalManager.cleanupAllTerminals(); 
         // Let's rely on will-quit for full cleanup for now to avoid double cleanup or unexpected session termination.
      }
      this.mainWindow = null;
    });
    return this.mainWindow;
  }
  
  getMainWindowInstance() {
      return this.mainWindow;
  }

  _setupTray() {
    // Create a 1x1 transparent PNG for the tray icon (from main.js)
    const emptyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9p6Q2wAAAABJRU5ErkJggg==',
      'base64'
    );
    const emptyIcon = nativeImage.createFromBuffer(emptyPng);
    this.tray = new Tray(emptyIcon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'New Terminal',
        click: () => {
          this._createMainWindow();
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => { this.appIsQuitting = true; app.quit(); } }
    ]);
    this.tray.setToolTip('MCP Terminal');
    this.tray.setContextMenu(contextMenu);
    Menu.setApplicationMenu(null); // Remove default main menu for the application
  }

  _handleUncaughtExceptions() {
    // General uncaught exception handler (from main.js)
    process.on('uncaughtException', (error) => {
      logger.error('[EAM] Uncaught exception in main process:', error);
      // Decide if to quit or try to keep app alive
      // Original: Don't exit - keep the app running despite the error
    });

    // Handle ConPTY assertion errors (from main.js app.whenReady)
    if (process.platform === 'win32') {
      process.on('uncaughtException', (err) => {
        if (err.message && (
            err.message.includes('Assertion failed') ||
            err.message.includes('status == napi_ok') ||
            (err.name === 'AssertionError' && err.message.includes('napi'))
        )) {
          logger.error('[EAM] Caught ConPTY assertion error (safe to ignore):', err);
          return; // Don't crash
        }
        // For other errors, let the general handler above catch it or add more specific handling.
        // logger.error('[EAM] Uncaught Windows exception:', err); // Avoid double logging
      });
    }
  }

  _registerAppEventListeners() {
    app.on('ready', async () => { // Changed to 'ready' from 'whenReady().then()'
      logger.info('[EAM] Electron app is ready.');
      this._handleUncaughtExceptions();
      this._setupTray();
      this._createMainWindow();
      // MCP Server and API server start will be handled in main.js after managers are created.
    });

    app.on('will-quit', (e) => {
      logger.info('[EAM] App is quitting - performing terminal cleanup.');
      this.appIsQuitting = true;
      // Ensure all listeners are removed to prevent errors during shutdown
      process.removeAllListeners('uncaughtException');
      process.on('uncaughtException', (err) => {
        logger.error('[EAM] Ignored error during app quit:', err);
      });
      this.terminalManager.cleanupAllTerminals();
      logger.info('[EAM] Terminal cleanup on quit completed.');
    });

    app.on('window-all-closed', () => {
      // Standard macOS behavior: quit if not on macOS, otherwise do nothing (dock icon stays active)
      if (process.platform !== 'darwin') {
        logger.info('[EAM] All windows closed on non-Darwin platform. Quitting app.');
        this.appIsQuitting = true;
        app.quit();
      } else {
        logger.info('[EAM] All windows closed on Darwin. App remains active.');
      }
    });

    app.on('activate', () => {
      // On macOS, re-create a window when the dock icon is clicked and no other windows are open.
      if (BrowserWindow.getAllWindows().length === 0) {
         logger.info('[EAM] App activated (e.g., dock click) and no windows open. Creating new window.');
        this._createMainWindow();
      }
    });
  }

  _registerIpcHandlers() {
    ipcMain.on(IpcConstants.WINDOW_NEW, () => {
      this._createMainWindow();
    });

    const getWindowFromEvent = (event) => BrowserWindow.fromWebContents(event.sender);

    ipcMain.on(IpcConstants.WINDOW_CLOSE, (event) => {
      const win = getWindowFromEvent(event);
      if (win) win.close();
    });

    ipcMain.on(IpcConstants.WINDOW_MINIMIZE, (event) => {
      const win = getWindowFromEvent(event);
      if (win) win.minimize();
    });

    ipcMain.on(IpcConstants.WINDOW_MAXIMIZE, (event) => {
      const win = getWindowFromEvent(event);
      if (win) {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      }
    });

    ipcMain.on(IpcConstants.WINDOW_TOGGLE_FULLSCREEN, (event) => {
      const win = getWindowFromEvent(event);
      if (win) {
        win.setFullScreen(!win.isFullScreen());
      }
    });

    ipcMain.on(IpcConstants.DEV_TOGGLE_TOOLS, (event) => {
      const win = getWindowFromEvent(event);
      if (win) win.webContents.toggleDevTools();
    });

    ipcMain.on(IpcConstants.DEV_RELOAD, (event) => {
      const win = getWindowFromEvent(event);
      if (win) win.webContents.reload();
    });

    ipcMain.on(IpcConstants.DEV_FORCE_RELOAD, (event) => {
      const win = getWindowFromEvent(event);
      if (win) win.webContents.reloadIgnoringCache();
    });

    ipcMain.on(IpcConstants.APP_QUIT, () => {
      this.appIsQuitting = true;
      app.quit();
    });
  }

  start() {
    // app.whenReady() is handled by the event listener. 
    // This method is mostly to signify the manager is constructed and ready.
    // Actual app start is triggered by Electron itself.
    logger.info('[EAM] ElectronAppManager initialized.');
  }
}

export default ElectronAppManager; 