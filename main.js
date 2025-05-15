import logger from './logger.js';
import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import os from 'os';
import { spawn as ptySpawn } from './pty-wrapper.js';
import { fileURLToPath } from 'url';
import mcpServerSingleton from './mcp-server.js';

// Get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBUG = true;

// Store active terminal sessions
const terminals = new Map();
let mainWindow = null;
let windowCounter = 0;
const pendingCompletionSignals = new Map(); // Map for early resolution

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

  // Handle ConPTY assertion errors in Windows
  // This is a workaround for issues in node-pty with ConPTY on Windows
  if (process.platform === 'win32') {
    // Patch Windows specific errors that might crash the app
    process.on('uncaughtException', (err) => {
      if (err.message && (
          err.message.includes('Assertion failed') ||
          err.message.includes('status == napi_ok') ||
          (err.name === 'AssertionError' && err.message.includes('napi'))
      )) {
        logger.error('Caught ConPTY assertion error (safe to ignore):', err);
        // Don't crash, continue running
        return;
      }
      
      // For other errors, log but don't crash
      logger.error('Uncaught exception:', err);
    });
  }

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
        createOrShowMainWindow();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('MCP Terminal');
  tray.setContextMenu(contextMenu);
  
  // Remove default menu - IMPORTANT: this must be done before creating the window
  Menu.setApplicationMenu(null);
  
  // Create the main window
  createOrShowMainWindow();
});

// Handle app will quit - ensure proper terminal cleanup
app.on('will-quit', (e) => {
  logger.info('App is quitting - performing terminal cleanup');
  
  try {
    // Set a flag to indicate app is closing
    global.appIsQuitting = true;
    
    // Remove existing error handlers
    process.removeAllListeners('uncaughtException');
    
    // Add a permissive error handler during shutdown
    process.on('uncaughtException', (err) => {
      logger.error('Ignored error during app quit:', err);
      // Don't let any errors stop the quit process
    });
    
    // Windows-specific handling
    if (process.platform === 'win32') {
      try {
        // Use the same aggressive cleanup approach as in window close
        for (const [sessionId, session] of terminals.entries()) {
          try {
            // Disconnect from process before attempting to kill
            if (session.process) {
              const tempProcess = session.process;
              session.process = null;
              
              try {
                tempProcess.kill();
              } catch (killError) {
                logger.warn(`Suppressed kill error for session ${sessionId} during app quit`);
              }
            }
          } catch (sessionError) {
            // Just log and continue with other sessions
            logger.error(`Error cleaning session ${sessionId} during app quit:`, sessionError);
          }
        }
        
        // Clear all terminals after the individual cleanup
        terminals.clear();
        logger.info('Aggressive Windows terminal cleanup completed');
      } catch (cleanupError) {
        logger.error('Error during Windows cleanup on quit:', cleanupError);
      }
    } else {
      // Non-Windows platforms can use the normal cleanup
      cleanupAllTerminals();
    }
    
    logger.info('Terminal cleanup completed successfully');
  } catch (error) {
    logger.error('Error during terminal cleanup on quit:', error);
    // Continue with quit even if there was an error
  }
});

// Handle app 'before-quit' event to clean up resources
app.on('before-quit', (e) => {
  logger.info('App is about to quit - preparing for shutdown');
  
  // Set global flag
  global.appIsQuitting = true;
  
  // Make sure error handler is in place
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', (err) => {
    logger.error('Ignored error during shutdown:', err);
    // Don't let any errors stop the quit process
  });
});

// Create or show the main window
function createOrShowMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // If window exists, show it
    mainWindow.show();
    return mainWindow;
  }
  
  // DEBUG: Run a test command with non-zero exit code
  setTimeout(() => {
    logger.info('Running test command with non-zero exit code...');
    const testSessionId = `test_session_${Date.now()}`;
    createTerminalProcess(testSessionId, "powershell -Command 'Write-Host \"This should fail\"; exit 123'");
    
    setTimeout(() => {
      const session = terminals.get(testSessionId);
      if (session) {
        logger.info(`Test session exitCode: ${session.exitCode}`);
        logger.info(`Test session buffer: ${JSON.stringify(session.buffer)}`);
      } else {
        logger.info('Test session not found');
      }
    }, 3000); // Check after 3 seconds
  }, 5000); // Wait 5 seconds after window creation
  
  // Create the main window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    title: 'MCP Terminal',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1e1e1e',
    show: false,
    autoHideMenuBar: false, // Changed to false since we'll handle this differently
    frame: false, // Use frameless window
    titleBarStyle: 'hidden', // Hide the title bar
    titleBarOverlay: false  // Disable title bar overlay
  });
  
  // Completely remove menu bar
  mainWindow.removeMenu();
  
  // Windows-specific handling for menu bar
  if (process.platform === 'win32') {
    // No need for setMenuBarVisibility with frameless window
    
    // Intercept keyboard shortcuts that might show the menu bar
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // Prevent Alt key from showing the menu bar
      if (input.key === 'Alt' || 
          (input.alt && !input.control && !input.meta && !input.shift)) {
        // Prevent default behavior that shows menu bar
        event.preventDefault();
        
        // If this is an Alt keydown event, send it to the renderer for custom menu handling
        if (input.type === 'keyDown' && input.key === 'Alt') {
          // Send to renderer process for custom menu handling
          mainWindow.webContents.send('alt-key-pressed');
        }
      }
    });
  }
  
  // Load the terminal UI
  mainWindow.loadFile('terminal.html');
  
  // Show window when ready to avoid flashing
  mainWindow.once('ready-to-show', () => {
    // Slight delay before showing window to ensure complete initialization
    setTimeout(() => {
      mainWindow.show();
      // Additional check to ensure menu is hidden on Windows
      if (process.platform === 'win32') {
        mainWindow.setMenuBarVisibility(false);
      }
      
      // Send window-ready event to renderer
      mainWindow.webContents.send('window-ready');
    }, 100);
  });
  
  // Handle window close
  mainWindow.on('closed', () => {
    try {
      // Set a flag to indicate window is closing - helps avoid race conditions
      global.windowIsClosing = true;
      
      // Windows-specific handling for terminal cleanup
      if (process.platform === 'win32') {
        try {
          // Patch the error handler one more time to be extra safe during window close
          process.removeAllListeners('uncaughtException');
          process.on('uncaughtException', (err) => {
            // Just log and continue during window close, don't let any error stop us
            logger.error('Ignored error during window close:', err);
          });
          
          // Use a more aggressive terminal cleanup approach on Windows
          for (const [sessionId, session] of terminals.entries()) {
            try {
              // Remove all event listeners and disconnect from process before killing
              if (session.process) {
                // Remove any process references that might try to use it after close
                const tempProcess = session.process;
                session.process = null;
                
                // Kill the process as a last step
                try {
                  tempProcess.kill();
                } catch (killError) {
                  logger.warn(`Suppressed kill error for session ${sessionId} during window close`);
                }
              }
            } catch (sessionError) {
              // Just log and continue - don't let any single terminal error stop the cleanup
              logger.error(`Error cleaning session ${sessionId} during window close:`, sessionError);
            }
          }
          
          // Clear all terminals after the individual cleanup
          terminals.clear();
        } catch (cleanupError) {
          logger.error('Error during aggressive Windows cleanup:', cleanupError);
        }
      } else {
        // Non-Windows platforms can use the normal cleanup
        cleanupAllTerminals();
      }
      
      // Clear the reference
      mainWindow = null;
    } catch (closeError) {
      logger.error('Error during window close:', closeError);
      mainWindow = null;
    }
  });
  
  return mainWindow;
}

// Create a new terminal process
function createTerminalProcess(sessionId, command = null) {
  if (DEBUG) {
    logger.info(`Creating new terminal process for session ${sessionId}`);
  }
  
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
      env: process.env,
      // Add ConPTY specific options to help avoid assertion errors
      useConpty: true, // Force ConPTY use on Windows
      conptyInheritCursor: false // Avoid cursor inheritance which can cause issues
    };
    
    // Start the terminal process with additional validation
    let term;
    try {
      term = ptySpawn(shell, shellArgs, options);
    } catch (ptyError) {
      logger.error(`Error spawning PTY process for session ${sessionId}:`, ptyError);
      
      // Try fallback approach with different options
      logger.info(`Attempting fallback PTY creation for session ${sessionId}`);
      options.useConpty = false; // Try with winpty instead
      options.windowsEnableConsoleTitleChange = false; // Disable title changes
      term = ptySpawn(shell, shellArgs, options);
    }
    
    // Create a session for this terminal
    terminals.set(sessionId, {
      process: term,
      buffer: '',
      command: command || shell,
      startTime: new Date(),
      status: 'running',
      sessionId: sessionId,
      exitCode: null,
      lastUnblockedOutput: null,
      lastUnblockedOutputTimestamp: null
    });
    
    // Buffer for output lines
    let outputBuffer = '';
    
    // Handle terminal output
    term.onData(data => {
      // Add to session buffer first to ensure exit code is captured in MCP output
      const session = terminals.get(sessionId);
      if (session) {
        session.buffer += data;
        outputBuffer += data;
        
        // Check for our exit code marker with enhanced logging
        logger.info(`[Session ${sessionId}] Processing data chunk: ${data.includes('__EXITCODE_MARK__') ? 'Contains marker' : 'No marker'}`);
        
        // Log the full outputBuffer for debugging
        if (data.includes('__EXITCODE_MARK__')) {
          logger.info(`[Session ${sessionId}] Raw data with marker: "${data.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
        }
        
        const markerMatch = data.match(/__EXITCODE_MARK__:(-?\d+)/);
        if (markerMatch) {
          const exitCode = parseInt(markerMatch[1], 10);
          logger.info(`[Session ${sessionId}] Exit code marker found: ${exitCode} (matched: ${markerMatch[0]})`);
          session.exitCode = exitCode;
          // Remove everything up to and including the marker from the buffer
          outputBuffer = outputBuffer.slice(outputBuffer.indexOf(markerMatch[0]) + markerMatch[0].length);
          
          logger.info(`[Session ${sessionId}] Updated exitCode to: ${session.exitCode}`);
        }
      }
      
      // Check for exitmark output and filter it before sending to UI
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Filter out exit marker lines but keep everything else
        if (data.includes('__exitmark') || data.includes('__EXITCODE_MARK__:')) {
          // Split by lines to preserve other content like prompts
          // PowerShell can use \r\n or just \r for line endings
          const lines = data.split(/\r\n|\r/);
          const filteredLines = lines.filter(line => {
            // More precise filtering: check if line contains EXACTLY "__exitmark" or starts with "__EXITCODE_MARK__:"
            const isExitMarkLine = line.trim() === '__exitmark';
            const isExitCodeLine = line.trim().startsWith('__EXITCODE_MARK__:');
            const result = !isExitMarkLine && !isExitCodeLine;
            return result;
          });
          
          // Only send filtered content if there's anything left
          if (filteredLines.length > 0) {
            const filteredData = filteredLines.join('\r\n');
            mainWindow.webContents.send('pty-output', { sessionId, data: filteredData });
          } else if (data.includes('PS ') && data.includes('>')) {
            // This might be just the PS prompt, we should preserve it
            // Extract the prompt part from the data
            const match = data.match(/PS [^>]*>/);
            if (match) {
              mainWindow.webContents.send('pty-output', { sessionId, data: match[0] });
            }
          }
        } else {
          // If no exit markers, send as is
          mainWindow.webContents.send('pty-output', { sessionId, data });
        }
      }
    });
    
    // Handle terminal exit with additional error handling
    term.onExit(({ exitCode }) => {
      try {
        const session = terminals.get(sessionId);
        if (session) {
          // Don't set status to 'completed' if the terminal exits
          // Just record the exit code
          session.exitCode = session.exitCode !== null ? session.exitCode : exitCode;
          logger.info(`Terminal process exited for session ${sessionId} with code ${session.exitCode}`);
        }
        
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-exit', { sessionId, exitCode: session ? session.exitCode : exitCode });
        }
      } catch (exitHandlerError) {
        logger.error(`Error in terminal exit handler for session ${sessionId}:`, exitHandlerError);
      }
    });
    
    // If a command was provided, execute it
    if (command) {
      // Execute the command and get the exit code
      if (os.platform() === 'win32') {
        try {
          // Define the __exitmark function at the start of the session
          term.write("function __exitmark { $code = if ($LASTEXITCODE -ne $null) { Write-Host \"DEBUG: LASTEXITCODE=$LASTEXITCODE\" -ForegroundColor Yellow; $LASTEXITCODE } elseif ($?) { Write-Host \"DEBUG: Command succeeded ($$=true), using code 0\" -ForegroundColor Yellow; 0 } else { Write-Host \"DEBUG: Command failed ($$=false), using code 1\" -ForegroundColor Yellow; 1 }; Write-Host \"__EXITCODE_MARK__:$code\" }\r");
          term.write("clear\r");
          term.write(`${command}\r`);
          term.write("__exitmark\r");
        } catch (writeError) {
          logger.error(`Error writing command to terminal for session ${sessionId}:`, writeError);
          // If we can't write, mark the session as error
          const session = terminals.get(sessionId);
          if (session) {
            session.status = 'error';
            session.exitCode = 1;
          }
        }
      } else {
        try {
          term.write(`${command}\r`);
          term.write("echo __EXITCODE_MARK__:$?\r"); // Unix equivalent
        } catch (writeError) {
          logger.error(`Error writing command to terminal for session ${sessionId}:`, writeError);
          // If we can't write, mark the session as error
          const session = terminals.get(sessionId);
          if (session) {
            session.status = 'error';
            session.exitCode = 1;
          }
        }
      }
    }
    
    return sessionId;
  } catch (error) {
    logger.error('Failed to create terminal process:', error);
    
    // Clean up if session was partially created
    if (terminals.has(sessionId)) {
      terminals.get(sessionId).status = 'error';
      terminals.get(sessionId).exitCode = 2; // General error
    }
    
    throw error;
  }
}

// Clean up all terminal sessions
function cleanupAllTerminals() {
  for (const [sessionId, session] of terminals.entries()) {
    if (session.process) {
      try {
        // Set a "being killed" flag to prevent further operations on this process
        session.isBeingKilled = true;
        
        // On Windows, handle potential ConPTY errors
        if (process.platform === 'win32') {
          try {
            session.process.kill();
          } catch (processKillError) {
            // Specifically catch and handle ConPTY errors
            if (processKillError.message && (
                processKillError.message.includes('Assertion failed') ||
                processKillError.message.includes('status == napi_ok')
            )) {
              logger.warn(`Caught ConPTY assertion error during cleanup for session ${sessionId} (safe to ignore)`);
            } else {
              // Log other errors but continue with cleanup
              logger.error(`Error killing process for session ${sessionId}:`, processKillError);
            }
          }
        } else {
          // Non-Windows platforms
          session.process.kill();
        }
      } catch (e) {
        logger.error(`Error killing process for session ${sessionId}:`, e);
      }
    }
  }
  
  terminals.clear();
}

// Helper function to safely clean up a terminal session
function cleanupTerminalSession(sessionId) {
  if (!sessionId) {
    logger.warn('Attempted to clean up session with undefined sessionId');
    return false;
  }
  
  try {
    // Check if session exists
    if (!terminals.has(sessionId)) {
      logger.warn(`Attempted to clean up non-existent session: ${sessionId}`);
      return false;
    }
    
    const session = terminals.get(sessionId);
    
    // On Windows, use a more aggressive cleanup approach
    if (process.platform === 'win32') {
      try {
        // Safely handle process cleanup
        if (session.process) {
          // First mark as being killed to prevent any new operations
          session.isBeingKilled = true;
          
          // Store process reference and remove from session to break any circular references
          const tempProcess = session.process;
          session.process = null;
          
          // Now attempt to kill the detached process
          try {
            tempProcess.kill();
          } catch (killError) {
            // Just log kill errors but don't stop cleanup
            logger.warn(`Suppressed kill error for session ${sessionId}: ${killError.message}`);
          }
        }
      } catch (windowsError) {
        logger.error(`Windows-specific cleanup error for session ${sessionId}:`, windowsError);
        // Continue with cleanup despite error
      }
    } else {
      // Non-Windows process cleanup
      if (session.process) {
        try {
          session.isBeingKilled = true;
          session.process.kill();
        } catch (processError) {
          logger.error(`Error killing process for session ${sessionId}:`, processError);
          // Continue with cleanup despite process kill error
        }
      }
    }
    
    // Update session status
    session.status = 'terminated';
    session.exitCode = EXIT_CODES.MANUAL_TERMINATION;
    
    // Clean up any pending completion signals
    if (pendingCompletionSignals.has(sessionId)) {
      try {
        // Resolve with terminated status if there's a pending promise
        const { resolve } = pendingCompletionSignals.get(sessionId);
        resolve({
          sessionId: session.sessionId,
          command: session.command,
          output: session.buffer, 
          status: 'terminated',
          startTime: session.startTime,
          exitCode: EXIT_CODES.MANUAL_TERMINATION,
          lastUnblockedOutput: session.lastUnblockedOutput,
          lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
        });
      } catch (signalError) {
        logger.error(`Error resolving pending signals for session ${sessionId}:`, signalError);
      }
      pendingCompletionSignals.delete(sessionId);
    }
    
    // Remove from terminals map
    terminals.delete(sessionId);
    logger.info(`Successfully cleaned up terminal session: ${sessionId}`);
    return true;
  } catch (error) {
    logger.error(`Error cleaning up terminal session ${sessionId}:`, error);
    
    // Attempt forced cleanup in case of error
    try {
      if (terminals.has(sessionId)) {
        terminals.delete(sessionId);
      }
      if (pendingCompletionSignals.has(sessionId)) {
        pendingCompletionSignals.delete(sessionId);
      }
    } catch (forcedCleanupError) {
      logger.error(`Error during forced cleanup for session ${sessionId}:`, forcedCleanupError);
    }
    
    return false;
  }
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

// Helper function to format output with exit code
function formatOutputWithExitCode(outputBuffer, exitCode) {
  let cleanedBuffer = outputBuffer || ''; // Ensure buffer is not null or undefined
  const lines = cleanedBuffer.split(/\r\n|\r/);
  const filteredLines = lines.filter(line =>
    !line.includes('__exitmark') && !line.includes('__EXITCODE_MARK__:')
  );
  let mcpOutput = filteredLines.join('\r\n');

  if (exitCode !== null && exitCode !== undefined) {
    // Ensure the Exit Code is on a new line
    if (mcpOutput.length > 0 && !mcpOutput.endsWith('\n') && !mcpOutput.endsWith('\r')) {
      mcpOutput += '\r\n'; // Add a newline if the cleaned output isn't empty and doesn't end with one
    } else if (mcpOutput.length === 0) {
      // If output is empty, no preceding newline is needed
    }
    mcpOutput += `Exit Code: ${exitCode}\r\n`;
  }
  return mcpOutput;
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
        
        const mcpOutput = formatOutputWithExitCode(session.buffer, session.exitCode);
        
        resolve({
          sessionId: session.sessionId,
          command: session.command,
          output: mcpOutput,
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

    // Create or show the main window
    createOrShowMainWindow();

    // Create a new terminal process
    createTerminalProcess(sessionId, command);
    
    // Tell the renderer about this new session
    mainWindow.webContents.send('session-id', sessionId);

    // Wait for command completion and get output
    try {
      logger.info(`Before waitForCommandCompletion for session ${sessionId}`);
      const result = await waitForCommandCompletion(sessionId);
      logger.info(`After waitForCommandCompletion for session ${sessionId}, exitCode=${result.exitCode}`);
      
      const session = terminals.get(sessionId);
      const exitCodeValue = result.exitCode !== null && result.exitCode !== undefined 
        ? result.exitCode 
        : (session && session.exitCode !== null && session.exitCode !== undefined 
            ? session.exitCode 
            : 0);
      
      const mcpOutput = formatOutputWithExitCode(result.output, exitCodeValue);
      
      const modifiedResult = {
        ...result,
        output: mcpOutput,
        exitCode: exitCodeValue
      };
      
      logger.info(`About to send response for session ${sessionId}, exitCode=${exitCodeValue}`);
      res.json(modifiedResult);
    } catch (error) {
      logger.error(`Error in /execute for session ${sessionId}:`, error);
      const session = terminals.get(sessionId);
      if (session) {
        logger.info(`Error handler for session ${sessionId}, exitCode=${session.exitCode}`);
        
        const exitCodeValue = session.exitCode !== null && session.exitCode !== undefined 
          ? session.exitCode 
          : 0;
        
        const mcpOutput = formatOutputWithExitCode(session.buffer, exitCodeValue);
        
        const errorResult = {
          sessionId,
          command: session.command,
          output: mcpOutput,
          status: session.status,
          startTime: session.startTime,
          exitCode: exitCodeValue,
          error: error.message
        };
        
        res.status(500).json(errorResult);
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
      session.process.write("echo -e \"\\e[49m\\e[39m__EXITCODE_MARK__:$?\\e[0m\"\r"); // Unix equivalent with invisible output
    }
    
    // Update session command history
    session.command = command;
    session.startTime = new Date();
    
    // Wait for command completion and get output
    try {
      logger.info(`Before waitForCommandCompletion for session ${sessionId} (execute/:sessionId)`);
      const result = await waitForCommandCompletion(sessionId);
      logger.info(`After waitForCommandCompletion for session ${sessionId}, exitCode=${result.exitCode} (execute/:sessionId)`);
      
      const currentSession = terminals.get(sessionId);
      const exitCodeValue = result.exitCode !== null && result.exitCode !== undefined 
        ? result.exitCode 
        : (currentSession && currentSession.exitCode !== null && currentSession.exitCode !== undefined 
            ? currentSession.exitCode 
            : 0);
      
      const mcpOutput = formatOutputWithExitCode(result.output, exitCodeValue);
      
      const modifiedResult = {
        ...result,
        output: mcpOutput,
        exitCode: exitCodeValue
      };
      
      logger.info(`About to send response for session ${sessionId}, exitCode=${exitCodeValue} (execute/:sessionId)`);
      res.json(modifiedResult);
    } catch (error) {
      logger.error(`Error in /execute/${sessionId}:`, error);
      const currentSession = terminals.get(sessionId);
      if (currentSession) {
        logger.info(`Error handler for session ${sessionId}, exitCode=${currentSession.exitCode} (execute/:sessionId)`);
        
        const exitCodeValue = currentSession.exitCode !== null && currentSession.exitCode !== undefined 
          ? currentSession.exitCode 
          : 0;
        
        const mcpOutput = formatOutputWithExitCode(currentSession.buffer, exitCodeValue);
        
        const errorResult = {
          sessionId,
          command: currentSession.command,
          output: mcpOutput,
          status: currentSession.status,
          startTime: currentSession.startTime,
          exitCode: exitCodeValue,
          error: error.message
        };
        
        res.status(500).json(errorResult);
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
    
    const mcpOutput = formatOutputWithExitCode(session.buffer, session.exitCode);
    
    res.json({
      sessionId,
      command: session.command,
      output: mcpOutput,
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

// Handle terminal creation request from renderer
ipcMain.handle('terminal:create', async () => {
  const sessionId = `session_${Date.now()}_${windowCounter++}`;
  try {
    createTerminalProcess(sessionId);
    return sessionId;
  } catch (error) {
    logger.error('Error creating terminal:', error);
    // Instead of throwing an error which would crash the IPC bridge,
    // return an error object that the renderer can handle
    return { error: true, message: error.message || 'Failed to create terminal', sessionId };
  }
});

// Handle terminal closure request from renderer
ipcMain.on('terminal:close', (event, { sessionId }) => {
  try {
    if (!sessionId) {
      logger.warn('Attempted to close terminal with undefined sessionId');
      event.reply('terminal:close-response', { 
        sessionId, 
        success: false, 
        error: 'Invalid session ID'
      });
      return;
    }
    
    let success = false;
    if (terminals.has(sessionId)) {
      success = cleanupTerminalSession(sessionId);
      logger.info(`Terminal session ${sessionId} closed by renderer request: ${success ? 'success' : 'failed'}`);
    } else {
      logger.warn(`Attempted to close non-existent terminal session: ${sessionId}`);
      success = true; // Consider it a success if it doesn't exist (already closed)
    }
    
    // Send response back to renderer
    event.reply('terminal:close-response', { 
      sessionId, 
      success, 
      error: success ? null : 'Failed to clean up terminal session'
    });
  } catch (error) {
    logger.error(`Error closing terminal ${sessionId}:`, error);
    // Send error response
    event.reply('terminal:close-response', { 
      sessionId, 
      success: false, 
      error: error.message || 'Unknown error closing terminal'
    });
  }
});

// Handle terminal input from renderer
ipcMain.on('pty-input', (event, { sessionId, data }) => {
  try {
    if (!sessionId) {
      logger.warn('Received terminal input with undefined sessionId');
      return;
    }
    
    if (terminals.has(sessionId)) {
      const session = terminals.get(sessionId);
      if (session.process) {
        session.process.write(data);
      } else {
        logger.warn(`Cannot write to null process for session ${sessionId}`);
      }
    } else {
      logger.warn(`Attempted to write to non-existent terminal session: ${sessionId}`);
    }
  } catch (error) {
    logger.error(`Error handling terminal input for session ${sessionId}:`, error);
  }
});

// Handle unblocked terminal output
ipcMain.on('terminal-send-current-output', (event, { sessionId, output }) => {
 if (DEBUG) {
   logger.info(`Received unblocked output for session ${sessionId}. Output length: ${output.length}`);
 }
 try {
   if (!sessionId) {
     logger.warn('Received unblocked output with undefined sessionId');
     return;
   }
   
   const session = terminals.get(sessionId);
   if (session) {
     session.lastUnblockedOutput = output;
     session.lastUnblockedOutputTimestamp = new Date();
     logger.info(`[Session ${sessionId}] Unblocked output received. Length: ${output.length}`);
 
     if (pendingCompletionSignals.has(sessionId)) {
       const { resolve } = pendingCompletionSignals.get(sessionId);
       session.status = 'unblocked_output_sent'; 
       
       const mcpEarlyOutput = formatOutputWithExitCode(session.lastUnblockedOutput, session.exitCode);
       
       resolve({
         sessionId: session.sessionId,
         command: session.command,
         output: mcpEarlyOutput,
         status: session.status,
         startTime: session.startTime,
         exitCode: session.exitCode,
         lastUnblockedOutput: session.lastUnblockedOutput,
         lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
       });
       pendingCompletionSignals.delete(sessionId);
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
    if (!sessionId) {
      logger.warn('Received terminal resize with undefined sessionId');
      return;
    }
    
    if (terminals.has(sessionId)) {
      const session = terminals.get(sessionId);
      if (session.process) {
        session.process.resize(cols, rows);
      } else {
        logger.warn(`Cannot resize null process for session ${sessionId}`);
      }
    } else {
      logger.warn(`Attempted to resize non-existent terminal session: ${sessionId}`);
    }
  } catch (error) {
    logger.error(`Error handling terminal resize for session ${sessionId}:`, error);
  }
});

// Window management events
ipcMain.on('window:new', () => {
  createOrShowMainWindow();
});

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

// Developer tool events
ipcMain.on('dev:toggle-tools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools();
    }
  }
});

ipcMain.on('dev:reload', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.reload();
  }
});

ipcMain.on('dev:force-reload', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.webContents.reloadIgnoringCache();
  }
});

// Application control
ipcMain.on('app:quit', () => {
  app.quit();
});

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', (e) => {
  // Don't quit on all windows closed (macOS behavior)
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  if (mainWindow === null) {
    createOrShowMainWindow();
  }
});

// Global error handler to prevent crashes from terminal operations
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in main process:', error);
  // Don't exit - keep the app running despite the error
});