import logger from './logger.js';
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import os from 'os';
import { spawn as ptySpawn } from 'node-pty';
import { fileURLToPath } from 'url';
import mcpServerSingleton from './mcp-server.js';

// Get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBUG = true;

// Store active terminal sessions
const terminals = new Map();
let windowCounter = 0;
const pendingCompletionSignals = new Map(); // New map for early resolution

// Constants for exit codes
const EXIT_CODES = {
  SUCCESS: 0,
  TIMEOUT: -1,
  MANUAL_TERMINATION: -2
};

// Initialize Express server for API
const apiServer = express();
const PORT = 3000;

// Basic security middleware
const securityMiddleware = (req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

apiServer.use(cors());
apiServer.use(bodyParser.json());
apiServer.use(securityMiddleware);

// Add health check endpoint
apiServer.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Create a 1x1 transparent PNG for the tray icon
const emptyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9p6Q2wAAAABJRU5ErkJggg==',
  'base64'
);
const emptyIcon = nativeImage.createFromBuffer(emptyPng);
let tray = null;
let mcpServer = null;

// Initialize Electron app
app.whenReady().then(() => {
  logger.info('Electron app is ready');

  // Start the MCP server
  mcpServer = mcpServerSingleton.start();
  logger.info(`MCP Server started on port ${mcpServerSingleton.getPort()}`);

  // Start the API server
  apiServer.listen(PORT, () => {
    logger.info(`API server listening on port ${PORT}`);
  });

  // Create tray icon using the transparent icon
  tray = new Tray(emptyIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'New Terminal',
      click: () => {
        const sessionId = `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        createTerminalWindow('echo Welcome to the new terminal!', sessionId);
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('MCP Terminal');
  tray.setContextMenu(contextMenu);
});

// Create a new terminal window for a command
function createTerminalWindow(command, sessionId) {
  if (DEBUG) {
    logger.info(`Creating new terminal window for session ${sessionId} with command: ${command}`);
  }
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: `Terminal - ${command}`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1e1e1e',
    show: false,
    frame: true
  });

  // Register the session immediately with a placeholder
  terminals.set(sessionId, {
    process: null,
    window: win,
    buffer: '',
    command: command,
    startTime: new Date(),
    status: 'initializing',
    sessionId: sessionId,
    exitCode: null,
    lastUnblockedOutput: null,
    lastUnblockedOutputTimestamp: null
  });

  // Load the terminal UI
  win.loadFile('terminal.html');

  // Once window is ready, create a terminal process
  win.webContents.on('did-finish-load', () => {
    let shell, shellArgs;
    if (os.platform() === 'win32') {
      shell = 'powershell.exe';
      shellArgs = ['-NoLogo', '-NoProfile']; // Interactive session
    } else {
      shell = 'bash';
      shellArgs = [];
    }

    try {
      // Prepare options object
      const options = {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env
      };

      // Start the terminal process
      const term = ptySpawn(shell, shellArgs, options);

      // Update the session with the process and running status
      const session = terminals.get(sessionId);
      if (session) {
        session.process = term;
        session.status = 'running';
      }

      // Buffer for output lines
      let outputBuffer = '';

      // Handle terminal output
      term.onData(data => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('pty-output', data);
        }
        const session = terminals.get(sessionId);
        if (session) {
          session.buffer += data;
          outputBuffer += data;

          // Check for our exit code marker
          const markerMatch = outputBuffer.match(/__EXITCODE_MARK__:(-?\\d+)/);
          if (markerMatch) {
            session.exitCode = parseInt(markerMatch[1], 10);
            // Remove everything up to and including the marker from the buffer
            outputBuffer = outputBuffer.slice(outputBuffer.indexOf(markerMatch[0]) + markerMatch[0].length);
          }
        }
      });

      // Handle terminal exit
      term.onExit(({ exitCode }) => {
        const session = terminals.get(sessionId);
        if (session) {
          // Don't set status to 'completed' if the terminal exits
          // Just record the exit code
          session.exitCode = session.exitCode !== null ? session.exitCode : exitCode;
          logger.info(`Terminal process exited for session ${sessionId} with code ${session.exitCode}`);
        }
        if (win && !win.isDestroyed()) {
          win.webContents.send('terminal-exit', session.exitCode);
        }
      });

      // Send the command and marker to get the exit code
      if (os.platform() === 'win32') {
        // Define the __exitmark function at the start of the session
        term.write("function __exitmark { $code = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }; echo __EXITCODE_MARK__:$code }\r");
        term.write("clear\r");
        term.write(`${command}\r`);
        term.write("__exitmark\r");
      } else {
        term.write(`${command}\r`);
        term.write("echo __EXITCODE_MARK__:$?\r"); // Unix equivalent
      }

      // Tell window which session it's connected to
      win.webContents.send('session-id', sessionId);
      
      // Show the window now that it's ready
      win.show();
    } catch (error) {
      logger.error('Failed to create terminal:', error);
      win.webContents.send('terminal-error', error.message);
      const session = terminals.get(sessionId);
      if (session) {
        session.status = 'error';
        session.exitCode = 2; // General error
      }
    }
  });

  // Handle window close
  win.on('closed', () => {
    const session = terminals.get(sessionId);
    if (session && session.process) {
      session.process.kill();
      session.status = 'terminated';
      session.exitCode = EXIT_CODES.MANUAL_TERMINATION;
      terminals.delete(sessionId);
    }
  });

  // Prevent window close from quitting the app
  win.on('close', (event) => {
    // Only prevent default if this is a user-initiated close
    if (!win.isDestroyed()) {
      event.preventDefault();
      win.destroy();
    }
  });

  return win;
}

// Helper function to wait for command completion
async function waitForCommandCompletion(sessionId) {
  return new Promise((resolve, reject) => {
    pendingCompletionSignals.set(sessionId, { resolve, reject }); // Store signals

    const session = terminals.get(sessionId);
    if (!session) {
      // Add a small delay to allow session initialization
      setTimeout(() => {
        const retrySession = terminals.get(sessionId);
        if (!retrySession) {
          if (pendingCompletionSignals.has(sessionId)) { // Check if still pending
            pendingCompletionSignals.get(sessionId).reject(new Error('Session not found after retry'));
            pendingCompletionSignals.delete(sessionId);
          }
          return;
        }
        startCompletionCheck(retrySession, sessionId); // Pass sessionId
      }, 500);
      return;
    }
    startCompletionCheck(session, sessionId); // Pass sessionId
  });
}

// Helper function to check command completion
function startCompletionCheck(session, sessionId) { // Added sessionId parameter
  const checkInterval = setInterval(() => {
    // Check if the command's exit code has been determined
    if (session.exitCode !== null) {
      clearInterval(checkInterval);
      if (pendingCompletionSignals.has(sessionId)) {
        const { resolve } = pendingCompletionSignals.get(sessionId);
        const finalStatus = (session.status === 'terminated') ? 'terminated' : 'completed';
        if (session.status === 'running') {
          session.status = finalStatus;
        }
        resolve({
          sessionId: session.sessionId,
          command: session.command,
          output: session.buffer, // Full buffer on normal completion
          status: finalStatus,
          startTime: session.startTime,
          exitCode: session.exitCode,
          lastUnblockedOutput: session.lastUnblockedOutput,
          lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
        });
        pendingCompletionSignals.delete(sessionId);
      }
      return;
    }

    // Safety check: if the session disappears from the map unexpectedly
    if (!terminals.has(session.sessionId)) {
      clearInterval(checkInterval);
      if (pendingCompletionSignals.has(sessionId)) {
        const { reject } = pendingCompletionSignals.get(sessionId);
        reject(new Error(`Session ${session.sessionId} disappeared unexpectedly during completion check.`));
        pendingCompletionSignals.delete(sessionId);
      }
      return;
    }

    // If the promise was already resolved by unblock, clear interval and stop
    if (!pendingCompletionSignals.has(sessionId) && session.status === 'unblocked_output_sent') {
       clearInterval(checkInterval);
       return;
    }

  }, 100);
}

// API endpoint to execute command
apiServer.post('/execute', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || command.trim().length === 0) {
      return res.status(400).json({ error: 'Command is required and cannot be empty' });
    }

    // Basic command validation
    if (command.includes('&&') || command.includes('||') || command.includes(';')) {
      return res.status(400).json({ error: 'Command chaining is not allowed' });
    }

    // Generate unique session ID
    const sessionId = `session_${Date.now()}_${windowCounter++}`;

    // Create a new terminal window for this command
    const win = createTerminalWindow(command, sessionId);

    // Wait for command completion and get output
    try {
      const result = await waitForCommandCompletion(sessionId);
      res.json(result);
    } catch (error) {
      // If we get a timeout or other error, still return the session info
      const session = terminals.get(sessionId);
      if (session) {
        res.status(500).json({
          sessionId,
          command: session.command,
          output: session.buffer,
          status: session.status,
          startTime: session.startTime,
          exitCode: session.exitCode,
          error: error.message
        });
      } else {
        logger.error('Error executing command:', error);
        res.status(500).json({ error: error.message || 'Failed to execute command' });
      }
    }
  } catch (error) {
    logger.error('Error executing command:', error);
    res.status(500).json({ error: error.message || 'Failed to execute command' });
  }
});

// API endpoint to execute command in existing session
apiServer.post('/execute/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { command } = req.body;
    
    if (!command || command.trim().length === 0) {
      return res.status(400).json({ error: 'Command is required and cannot be empty', sessionId });
    }

    if (!terminals.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found', sessionId });
    }

    const session = terminals.get(sessionId);

    if (session.process === null) {
      return res.status(400).json({ error: 'Session is not active', sessionId });
    }
    
    // Clear the buffer for the new command
    session.buffer = '';
    session.exitCode = null;
    
    // Make sure the session is marked as running
    session.status = 'running';
    
    // Execute the command in the existing terminal
    if (os.platform() === 'win32') {
      session.process.write(`${command}\r`);
      session.process.write("__exitmark\r");
    } else {
      session.process.write(`${command}\r`);
      session.process.write("echo __EXITCODE_MARK__:$?\r"); // Unix equivalent
    }
    
    // Update session command history
    session.command = command;
    session.startTime = new Date();
    
    // Wait for command completion and get output
    try {
      const result = await waitForCommandCompletion(sessionId);
      res.json(result);
    } catch (error) {
      // If we get a timeout or other error, still return the session info
      const currentSession = terminals.get(sessionId);
      if (currentSession) {
        res.status(500).json({
          sessionId,
          command: currentSession.command,
          output: currentSession.buffer,
          status: currentSession.status,
          startTime: currentSession.startTime,
          exitCode: currentSession.exitCode,
          error: error.message
        });
      } else {
        logger.error('Error executing command in session:', error);
        res.status(500).json({ error: error.message || 'Failed to execute command in session', sessionId });
      }
    }
  } catch (error) {
    logger.error('Error executing command in session:', error);
    res.status(500).json({ error: error.message || 'Failed to execute command in session' });
  }
});

// API endpoint to list active sessions
apiServer.get('/sessions', (req, res) => {
  try {
    const sessions = Array.from(terminals.entries()).map(([id, session]) => ({
      sessionId: id,
      command: session.command,
      status: session.status,
      startTime: session.startTime,
      exitCode: session.exitCode,
      lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
    }));

    res.json({ sessions });
  } catch (error) {
    logger.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// API endpoint to get command output
apiServer.get('/output/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!terminals.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found', sessionId });
    }

    const session = terminals.get(sessionId);
    res.json({
      sessionId,
      command: session.command,
      output: session.buffer,
      status: session.status,
      startTime: session.startTime,
      exitCode: session.exitCode,
      lastUnblockedOutput: session.lastUnblockedOutput,
      lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
    });
  } catch (error) {
    logger.error('Error getting output:', error);
    res.status(500).json({ error: 'Failed to get command output' });
  }
});

// API endpoint to stop command
apiServer.post('/stop/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!terminals.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found', sessionId });
    }

    const session = terminals.get(sessionId);
    if (session.process) {
      session.process.kill();
      session.status = 'terminated';
      session.exitCode = -2;  // Use -2 to indicate manual termination
      res.json({ success: true, message: 'Command terminated', exitCode: session.exitCode ? session.exitCode : -2 });
    } else {
      res.status(400).json({ error: 'Process already terminated' });
    }
  } catch (error) {
    logger.error('Error stopping command:', error);
    res.status(500).json({ error: 'Failed to stop command' });
  }
});

// Handle IPC messages from renderer
ipcMain.on('pty-input', (event, { sessionId, data }) => {
  try {
    if (terminals.has(sessionId)) {
      terminals.get(sessionId).process.write(data);
    }
  } catch (error) {
    logger.error('Error handling terminal input:', error);
  }
});

// Handle unblocked terminal output
ipcMain.on('terminal-send-current-output', (event, { sessionId, output }) => {
 if (DEBUG) {
   logger.info(`Received unblocked output for session ${sessionId}. Output length: ${output.length}`);
 }
 try {
   const session = terminals.get(sessionId);
   if (session) {
     session.lastUnblockedOutput = output;
     session.lastUnblockedOutputTimestamp = new Date();
     logger.info(`[Session ${sessionId}] Unblocked output received. Length: ${output.length}`);
 
     // Check if there's a pending completion promise for this session
     if (pendingCompletionSignals.has(sessionId)) {
       const { resolve } = pendingCompletionSignals.get(sessionId);
       session.status = 'unblocked_output_sent'; // Set a new status
       resolve({
         sessionId: session.sessionId,
         command: session.command,
         output: session.lastUnblockedOutput, // Send only the unblocked output
         status: session.status,
         startTime: session.startTime,
         exitCode: null, // Exit code is not yet known
         lastUnblockedOutput: session.lastUnblockedOutput,
         lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
       });
       pendingCompletionSignals.delete(sessionId); // Clean up
       logger.info(`[Session ${sessionId}] Early resolve triggered by unblock.`);
     }
   } else {
     logger.warn(`Session ${sessionId} not found for unblocked output.`);
   }
 } catch (error) {
   logger.error(`Error handling unblocked output for session ${sessionId}:`, error);
 }
});

// Terminal resize events
ipcMain.on('terminal-resize', (event, { sessionId, cols, rows }) => {
  try {
    if (terminals.has(sessionId)) {
      const session = terminals.get(sessionId);
      if (session.process) {
        session.process.resize(cols, rows);
      }
    }
  } catch (error) {
    logger.error('Error handling terminal resize:', error);
  }
});

// Window control events
ipcMain.on('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.close();
  }
});

ipcMain.on('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.minimize();
  }
});

ipcMain.on('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('window:toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setFullScreen(!win.isFullScreen());
  }
});

// Close specific windows
ipcMain.on('close-window', (event, sessionId) => {
  try {
    const session = terminals.get(sessionId);
    if (session && session.window) {
      session.window.destroy();
    }
  } catch (error) {
    logger.error('Error closing window:', error);
  }
});

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', (e) => {
  // Do nothing, keep the app running
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const sessionId = `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    createTerminalWindow('echo Welcome back!', sessionId);
  }
});

// Prevent Node.js from exiting by keeping the event loop busy
setInterval(() => { }, 1000);

// Add app quit handler to clean up all terminal sessions
app.on('before-quit', () => {
  logger.info('Application shutting down, cleaning up resources...');

  // Clean up all terminal sessions
  for (const [sessionId, session] of terminals.entries()) {
    if (session.process) {
      try {
        session.process.kill();
      } catch (e) {
        logger.error(`Error killing process for session ${sessionId}:`, e);
      }
    }
    terminals.delete(sessionId);
  }
  
  // Stop the MCP server
  if (mcpServer) {
    mcpServerSingleton.stop();
  }
});