import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import os from 'os';
import { spawn as ptySpawn } from 'node-pty'; // Import only the spawn function
import { fileURLToPath } from 'url';
// Removed MCP server import: import mcpServerSingleton from './mcp-server.js';

// Get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBUG = true;


// Store active terminal sessions
const terminals = new Map();
let windowCounter = 0;

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
  // Add rate limiting headers
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
// Removed: let mcpServer = null;

// Initialize Electron app
app.whenReady().then(() => {
  //console.log('Electron app is ready');

  // Start the API server
  apiServer.listen(PORT, () => {
    //console.log(`API server listening on port ${PORT}`);

    // MCP Server is no longer started here. It runs standalone.
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
  tray.setToolTip('Command Terminal Electron');
  tray.setContextMenu(contextMenu);
});

// Create a new terminal window for a command
function createTerminalWindow(command, sessionId) {
  if (DEBUG) {
    console.log(`Creating new terminal window for session ${sessionId} with command: ${command}`);
  }
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: `Terminal - ${command}`,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js') // Uses the __dirname defined above
    }
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
    exitCode: null
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

      // --- Runtime Type Validation ---
      if (typeof shell !== 'string') {
        throw new Error(`ptySpawn Pre-check Failed: 'shell' must be a string, got ${typeof shell}`);
      }
      // node-pty allows args to be string or string[], we expect array here based on prior logic
      if (!Array.isArray(shellArgs)) {
         console.warn(`ptySpawn Pre-check Warning: 'shellArgs' was expected to be an array, but got ${typeof shellArgs}. Proceeding cautiously.`);
         // If it MUST be an array based on your logic, throw here instead:
         // throw new Error(`ptySpawn Pre-check Failed: 'shellArgs' must be an array, got ${typeof shellArgs}`);
      }
      if (typeof options !== 'object' || options === null || Array.isArray(options)) {
         // This is the core check for the error message we are seeing
        throw new Error(`ptySpawn Pre-check Failed: 'options' must be an object, got ${typeof options}${Array.isArray(options) ? ' (Array)' : ''}`);
      }
      // --- End Validation ---

      console.log(`DEBUG: About to call ptySpawn with shell='${shell}', args=${JSON.stringify(shellArgs)}, options=${JSON.stringify(options)}`); // Single log line before call

      // Start the terminal process using the imported spawn function
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
          win.webContents.send('terminal-output', data);
        }
        const session = terminals.get(sessionId);
        if (session) {
          session.buffer += data;
          outputBuffer += data;

          // Check for our exit code marker
          const markerMatch = outputBuffer.match(/__EXITCODE_MARK__:(-?\d+)/);
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
          console.log(`Terminal process exited for session ${sessionId} with code ${session.exitCode}`);
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
    } catch (error) {
      console.error('Failed to create terminal:', error);
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
async function waitForCommandCompletion(sessionId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const session = terminals.get(sessionId);
    if (!session) {
      // Add a small delay to allow session initialization
      setTimeout(() => {
        const retrySession = terminals.get(sessionId);
        if (!retrySession) {
          reject(new Error('Session not found'));
          return;
        }
        startCompletionCheck(retrySession, resolve, reject, timeout);
      }, 500);
      return;
    }
    startCompletionCheck(session, resolve, reject, timeout);
  });
}

// Helper function to check command completion
function startCompletionCheck(session, resolve, reject, timeout) {
  const startTime = Date.now();
  let lastOutputTime = Date.now();
  let lastOutputLength = session.buffer.length;

  const checkInterval = setInterval(() => {
    // Check if command has completed
    if (session.status === 'completed' || session.status === 'terminated') {
      clearInterval(checkInterval);
      resolve({
        sessionId: session.sessionId,
        command: session.command,
        output: session.buffer,
        status: session.status,
        startTime: session.startTime,
        exitCode: session.exitCode
      });
      return;
    }

    // Check if output has stopped changing
    const currentOutputLength = session.buffer.length;
    if (currentOutputLength !== lastOutputLength) {
      lastOutputLength = currentOutputLength;
      lastOutputTime = Date.now();
    } else if (Date.now() - lastOutputTime > 1000) {
      // If no output change for 1 second, consider command complete
      clearInterval(checkInterval);
      // Don't change the session status to 'completed'
      // Just note that the command is complete
      const commandCompleteStatus = 'completed';
      session.exitCode = session.exitCode !== undefined ? session.exitCode : EXIT_CODES.SUCCESS;
      resolve({
        sessionId: session.sessionId,
        command: session.command,
        output: session.buffer,
        status: commandCompleteStatus,  // Return 'completed' for the command, not the session
        startTime: session.startTime,
        exitCode: session.exitCode
      });
      return;
    }

    // Check for timeout
    if (Date.now() - startTime > timeout) {
      clearInterval(checkInterval);
      session.status = 'timeout';
      session.exitCode = EXIT_CODES.TIMEOUT;
      if (session.process) {
        session.process.kill();
      }
      resolve({
        sessionId: session.sessionId,
        command: session.command,
        output: session.buffer,
        status: 'timeout',
        startTime: session.startTime,
        exitCode: EXIT_CODES.TIMEOUT,
        error: 'Command execution timed out'
      });
    }
  }, 100);
}

// API endpoint to execute command
apiServer.post('/execute', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
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
        res.json({
          sessionId,
          command: session.command,
          output: session.buffer,
          status: session.status,
          startTime: session.startTime,
          exitCode: session.exitCode,
          error: error.message
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error executing command:', error);
    res.status(500).json({ error: error.message || 'Failed to execute command' });
  }
});

// API endpoint to execute command in existing session
apiServer.post('/execute/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }
    
    if (!terminals.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = terminals.get(sessionId);
    
    // CHANGE THIS CHECK - a session might have a previous command completed
    // but still be available for more commands as long as the process exists
    if (session.process === null) {
      return res.status(400).json({ error: 'Session is not active' });
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
        res.json({
          sessionId,
          command: currentSession.command,
          output: currentSession.buffer,
          status: currentSession.status,
          startTime: currentSession.startTime,
          exitCode: currentSession.exitCode,
          error: error.message
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error executing command in session:', error);
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
      exitCode: session.exitCode
    }));

    res.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// API endpoint to get command output
apiServer.get('/output/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!terminals.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = terminals.get(sessionId);
    res.json({
      sessionId,
      command: session.command,
      output: session.buffer,
      status: session.status,
      startTime: session.startTime,
      exitCode: session.exitCode
    });
  } catch (error) {
    console.error('Error getting output:', error);
    res.status(500).json({ error: 'Failed to get command output' });
  }
});

// API endpoint to stop command
apiServer.post('/stop/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!terminals.has(sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
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
    console.error('Error stopping command:', error);
    res.status(500).json({ error: 'Failed to stop command' });
  }
});

// Handle IPC messages from renderer
ipcMain.on('terminal-input', (event, { sessionId, input }) => {
  try {
    if (terminals.has(sessionId)) {
      terminals.get(sessionId).process.write(input);
    }
  } catch (error) {
    console.error('Error handling terminal input:', error);
  }
});

ipcMain.on('terminal-resize', (event, { sessionId, cols, rows }) => {
  try {
    if (terminals.has(sessionId)) {
      const session = terminals.get(sessionId);
      if (session.process) {
        session.process.resize(cols, rows);
      }
    }
  } catch (error) {
    console.error('Error handling terminal resize:', error);
  }
});
// Add handler for closing specific windows
ipcMain.on('close-window', (event, sessionId) => {
  try {
    const session = terminals.get(sessionId);
    if (session && session.window) {
      session.window.destroy();
    }
  } catch (error) {
    console.error('Error closing window:', error);
  }
});

// For Electron 25+ (if available)
try {
  app.quitOnWindowAllClosed = false;
} catch (e) {
  // Ignore if not supported
}

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
  console.log('Application shutting down, cleaning up resources...');

  // Clean up all terminal sessions
  for (const [sessionId, session] of terminals.entries()) {
    if (session.process) {
      try {
        session.process.kill();
      } catch (e) {
        console.error(`Error killing process for session ${sessionId}:`, e);
      }
    }
    terminals.delete(sessionId);
  }
});