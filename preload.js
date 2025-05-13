// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Securely expose specific IPC functionality to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    // Whitelist channels
    const validChannels = ['pty-input', 'terminal-resize', 'terminal-send-current-output'];
    if (validChannels.includes(channel)) {
      // Validate data for 'pty-input'
      if (channel === 'pty-input') {
        if (data && typeof data.input === 'string') {
          ipcRenderer.send(channel, data);
        } else {
          console.error('Invalid data for pty-input:', data);
        }
      } else {
        ipcRenderer.send(channel, data);
      }
    } else {
      console.error(`Attempted to send on invalid channel: ${channel}`);
    }
  },
  on: (channel, func) => {
    const validChannels = ['pty-output', 'terminal-output', 'terminal-exit', 'session-id', 'terminal-error']; // Added other channels used in main.js
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    } else {
      console.error(`Attempted to listen on invalid channel: ${channel}`);
    }
  },
  // It's good practice to also provide a way to remove listeners
  removeListener: (channel, func) => {
    const validChannels = ['pty-output', 'terminal-output', 'terminal-exit', 'session-id', 'terminal-error'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    } else {
      console.error(`Attempted to remove listener on invalid channel: ${channel}`);
    }
  },
  removeAllListeners: (channel) => {
    const validChannels = ['pty-output', 'terminal-output', 'terminal-exit', 'session-id', 'terminal-error'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    } else {
      console.error(`Attempted to remove all listeners on invalid channel: ${channel}`);
    }
  }
});
