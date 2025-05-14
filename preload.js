// Preload script for the terminal window
const { contextBridge, ipcRenderer } = require('electron');

// Expose API to the renderer process
contextBridge.exposeInMainWorld('api', {
  // Terminal management
  createTerminal: () => {
    return ipcRenderer.invoke('terminal:create');
  },
  sendTerminalInput: (sessionId, data) => {
    if (!sessionId) return;
    ipcRenderer.send('pty-input', { sessionId, data });
  },
  resizeTerminal: (sessionId, cols, rows) => {
    if (!sessionId) return;
    ipcRenderer.send('terminal-resize', { sessionId, cols, rows });
  },
  closeTerminal: (sessionId) => {
    if (!sessionId) return;
    ipcRenderer.send('terminal:close', { sessionId });
  },
  sendCurrentOutput: (sessionId, output) => {
    if (!sessionId) return;
    ipcRenderer.send('terminal-send-current-output', { sessionId, output });
  },
  
  // Window management
  createWindow: () => {
    ipcRenderer.send('window:new');
  },
  closeWindow: () => {
    ipcRenderer.send('window:close');
  },
  minimizeWindow: () => {
    ipcRenderer.send('window:minimize');
  },
  maximizeWindow: () => {
    ipcRenderer.send('window:maximize');
  },
  toggleFullscreen: () => {
    ipcRenderer.send('window:toggle-fullscreen');
  },
  
  // Developer tools
  toggleDevTools: () => {
    ipcRenderer.send('dev:toggle-tools');
  },
  reloadWindow: () => {
    ipcRenderer.send('dev:reload');
  },
  forceReload: () => {
    ipcRenderer.send('dev:force-reload');
  },
  
  // App control
  quit: () => {
    ipcRenderer.send('app:quit');
  },
  
  // Settings
  getSettings: () => {
    return ipcRenderer.invoke('settings:get');
  },
  setSettings: (settings) => {
    ipcRenderer.send('settings:set', settings);
  },
  
  // Events from main process
  onTerminalData: (callback) => {
    ipcRenderer.on('pty-output', (event, data) => callback(data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal-exit', (event, data) => callback(data));
  },
  onSessionId: (callback) => {
    ipcRenderer.on('session-id', (event, sessionId) => callback(sessionId));
  },
  onTerminalCloseResponse: (callback) => {
    ipcRenderer.on('terminal:close-response', (event, data) => callback(data));
  },
  
  // Custom menu handling
  onAltKeyPressed: (callback) => {
    ipcRenderer.on('alt-key-pressed', () => callback());
  }
});
