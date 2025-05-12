import pkg from 'electron';
const { app, BrowserWindow, Tray, Menu, nativeImage } = pkg;
import { WebSocketServer } from 'ws';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import pty from 'node-pty';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let tray, wss, guiPort, mainWindow;

// Only initialize once app is ready
const LOCK_FILE = path.join(process.env.APPDATA || process.env.HOME, '.electron-gui-port.lock');

// Helper functions
function getRandomPort(cb) {
  const srv = net.createServer();
  srv.listen(0, () => {
    const port = srv.address().port;
    srv.close(() => cb(port));
  });
}

function writeLockFile(port) {
  fs.writeFileSync(LOCK_FILE, String(port), { flag: "w" });
}

function readLockFile() {
  try { return parseInt(fs.readFileSync(LOCK_FILE, "utf8"), 10); } catch { return null; }
}

app.whenReady().then(() => {
  // Mutex: only one GUI instance
  if (fs.existsSync(LOCK_FILE)) {
    console.log('Electron GUI already running, exiting...');
    app.quit();
    return;
  }

  getRandomPort((port) => {
    guiPort = port;
    console.log(`Starting WebSocket server on port ${guiPort}`);
    
    wss = new WebSocketServer({ port: guiPort });
    
    // Only write lock file after server is listening
    wss.on('listening', () => {
      writeLockFile(guiPort);
      console.log(`Lock file created at: ${LOCK_FILE}`);
    });
    // Store WebSocket connections by session
    const wsConnections = new Map();

    wss.on("connection", (ws) => {
      console.log('New WebSocket connection');
      ws.on("message", (msg) => {
        try {
          const { command, sessionId } = JSON.parse(msg.toString());
          console.log(`Creating terminal for command: ${command}, session: ${sessionId}`);
          wsConnections.set(sessionId, ws);
          createTerminalWindow(command, sessionId, ws);
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
          ws.send(JSON.stringify({
            type: 'error',
            error: err.message
          }));
        }
      });
    });

    // Create tray icon with a minimal 16x16 transparent PNG
    const iconData = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAATSURBVDhPYxgFo2AUjAIwYGAAAAQQAAGnRHxjAAAAAElFTkSuQmCC',
      'base64'
    );
    const icon = nativeImage.createFromBuffer(iconData);
    tray = new Tray(icon);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Port: ${guiPort}`, enabled: false },
      { type: 'separator' },
      { label: "Quit", click: () => app.quit() }
    ]));
    tray.setToolTip('Electron Terminal Server');
  });
}).catch(err => {
  console.error('Failed to initialize app:', err);
  app.quit();
});

function createTerminalWindow(command, sessionId, ws) {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: `Terminal - ${sessionId}`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Add to terminal sessions map
  const term = {
    window: win,
    process: null,
    sessionId: sessionId
  };

  win.loadFile(path.join(__dirname, "terminal.html"));
  
  win.webContents.on("did-finish-load", () => {
    // Send session ID first
    win.webContents.send("session-id", sessionId);
    
    // Create terminal process
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs = process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : [];
    
    term.process = pty.spawn(shell, shellArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    });

    // Handle terminal output
    term.process.onData(data => {
      if (!win.isDestroyed()) {
        win.webContents.send('terminal-output', data);
      }
    });

    // Execute the initial command and notify client
    term.process.write(`${command}\r`);
    ws.send(JSON.stringify({
      type: 'terminal-created',
      sessionId: sessionId
    }));
  });

  // Error handling
  win.webContents.on('did-fail-load', () => {
    ws.send(JSON.stringify({
      type: 'error',
      sessionId: sessionId,
      error: 'Failed to load terminal window'
    }));
  });

  // Handle window close
  win.on('closed', () => {
    if (term.process) {
      term.process.kill();
      ws.send(JSON.stringify({
        type: 'terminal-closed',
        sessionId: sessionId
      }));
    }
  });

  return term;
}

// Handle cleanup
app.on("will-quit", () => {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      fs.unlinkSync(LOCK_FILE);
      console.log('Removed lock file');
    } catch (err) {
      console.error('Error removing lock file:', err);
    }
  }
  if (wss) {
    wss.close();
    console.log('Closed WebSocket server');
  }
});

// When all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault(); // Prevent app from quitting
});

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
