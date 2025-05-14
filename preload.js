// Preload script for the terminal window
const { contextBridge, ipcRenderer } = require('electron');

// Expose API to the renderer process
contextBridge.exposeInMainWorld('api', {
  // Terminal control
  sendTerminalInput: (sessionId, data) => {
    ipcRenderer.send('pty-input', { sessionId, data });
  },
  resizeTerminal: (sessionId, cols, rows) => {
    ipcRenderer.send('terminal-resize', { sessionId, cols, rows });
  },
  closeTerminal: (sessionId) => {
    ipcRenderer.send('close-window', sessionId);
  },
  sendCurrentOutput: (sessionId, output) => {
    ipcRenderer.send('terminal-send-current-output', { sessionId, output });
  },
  
  // Settings
  getSettings: () => {
    // Default settings if not available from main process
    return {
      appearance: {
        fontFamily: 'Consolas, monospace',
        fontSize: 14,
        cursorStyle: 'block',
        cursorBlink: true,
        theme: 'dark'
      },
      terminal: {
        scrollback: 1000,
        autoLineHeight: true,
        enableBell: false
      }
    };
  },
  
  // Window control
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
  
  // Events from main process
  onTerminalData: (callback) => {
    ipcRenderer.on('pty-output', (event, data) => callback(data));
  },
  onTerminalExit: (callback) => {
    ipcRenderer.on('terminal-exit', (event, exitCode) => callback(exitCode));
  },
  onSessionId: (callback) => {
    ipcRenderer.on('session-id', (event, sessionId) => callback(sessionId));
  }
});
