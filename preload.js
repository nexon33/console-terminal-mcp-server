// preload.js
const { ipcRenderer } = require('electron');

// Expose IPC renderer to window
window.ipcRenderer = ipcRenderer;
