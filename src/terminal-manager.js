import { spawn as ptySpawn } from '../pty-wrapper.js'; // Adjusted path
import os from 'os';
import logger from '../logger.js'; // Assuming logger is in the root
import * as IpcConstants from './ipc-constants.js';
import { EXIT_CODES, TERMINAL_MARKERS, SHELL_COMMANDS } from './constants.js';
import { getShellConfig, killProcess } from './process-utils.js';

const DEBUG = true; // Or get from an environment variable/config

class TerminalManager {
  constructor(ipcMain, getMainWindow) {
    this.ipcMain = ipcMain;
    this.getMainWindow = getMainWindow; // Function to get the main window instance
    this.terminals = new Map();
    this.pendingCompletionSignals = new Map();
    this.windowCounter = 0; // If session ID generation stays here

    this._registerIpcHandlers();
  }

  generateSessionId() {
    return `session_${Date.now()}_${this.windowCounter++}`;
  }

  _registerIpcHandlers() {
    this.ipcMain.handle(IpcConstants.TERMINAL_CREATE, async (event) => {
      const sessionId = this.generateSessionId();
      try {
        // We don't pass a command here, as this is for creating a generic terminal for the UI
        await this.createTerminalProcess(sessionId, null); 
        return { sessionId }; // Return object for handle
      } catch (error) {
        logger.error(`[TM] IPC Error creating terminal ${sessionId}:`, error);
        return { error: true, message: error.message || 'Failed to create terminal', sessionId };
      }
    });

    this.ipcMain.on(IpcConstants.TERMINAL_CLOSE, (event, { sessionId }) => {
      try {
        if (!sessionId) {
          logger.warn('[TM] IPC Attempted to close terminal with undefined sessionId');
          // For .on, we reply if a response is needed. This one might not need a direct reply
          // if the UI just fires and forgets, or listens for a separate event.
          // Original used event.reply, so we keep that pattern.
          event.reply(IpcConstants.TERMINAL_CLOSE_RESPONSE, { 
            sessionId, 
            success: false, 
            error: 'Invalid session ID'
          });
          return;
        }
        
        let success = false;
        if (this.terminals.has(sessionId)) {
          success = this.cleanupTerminalSession(sessionId);
          logger.info(`[TM] IPC Terminal session ${sessionId} closed by renderer request: ${success ? 'success' : 'failed'}`);
        } else {
          logger.warn(`[TM] IPC Attempted to close non-existent terminal session: ${sessionId}`);
          success = true; // Consider it a success if it doesn't exist (already closed)
        }
        
        event.reply(IpcConstants.TERMINAL_CLOSE_RESPONSE, { 
          sessionId, 
          success, 
          error: success ? null : 'Failed to clean up terminal session'
        });
      } catch (error) {
        logger.error(`[TM] IPC Error closing terminal ${sessionId}:`, error);
        event.reply(IpcConstants.TERMINAL_CLOSE_RESPONSE, { 
          sessionId, 
          success: false, 
          error: error.message || 'Unknown error closing terminal'
        });
      }
    });

    this.ipcMain.on(IpcConstants.PTY_INPUT, (event, { sessionId, data }) => {
      try {
        if (!sessionId) {
          logger.warn('[TM] IPC Received terminal input with undefined sessionId');
          return;
        }
        const session = this.terminals.get(sessionId);
        if (session && session.process) {
          session.process.write(data);
        } else if (session) {
          logger.warn(`[TM] IPC Cannot write to null process for session ${sessionId}`);
        } else {
          logger.warn(`[TM] IPC Attempted to write to non-existent terminal session: ${sessionId}`);
        }
      } catch (error) {
        logger.error(`[TM] IPC Error handling terminal input for session ${sessionId}:`, error);
      }
    });

    this.ipcMain.on(IpcConstants.TERMINAL_SEND_CURRENT_OUTPUT, (event, { sessionId, output }) => {
      if (DEBUG) {
        logger.info(`[TM] IPC Received unblocked output for session ${sessionId}. Output length: ${output ? output.length : 'N/A'}`);
      }
      try {
        if (!sessionId) {
          logger.warn('[TM] IPC Received unblocked output with undefined sessionId');
          return;
        }
        
        const session = this.terminals.get(sessionId);
        if (session) {
          session.lastUnblockedOutput = output;
          session.lastUnblockedOutputTimestamp = new Date();
          logger.info(`[TM Session ${sessionId}] IPC Unblocked output received. Length: ${output ? output.length : 'N/A'}`);
      
          if (this.pendingCompletionSignals.has(sessionId)) {
            const { resolve } = this.pendingCompletionSignals.get(sessionId);
            // Update status before resolving
            session.status = 'unblocked_output_sent'; 
            
            // Format the unblocked output similar to final output
            const mcpEarlyOutput = this.formatOutputWithExitCode(session.lastUnblockedOutput, session.exitCode);
            
            resolve({
              sessionId: session.sessionId,
              command: session.command,
              output: mcpEarlyOutput, // Send only the unblocked part as main output for this resolution
              status: session.status,
              startTime: session.startTime,
              exitCode: session.exitCode, // Might be null
              lastUnblockedOutput: session.lastUnblockedOutput,
              lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
            });
            this.pendingCompletionSignals.delete(sessionId);
            logger.info(`[TM Session ${sessionId}] IPC Early resolve triggered by unblock.`);
          }
        } else {
          logger.warn(`[TM] IPC Session ${sessionId} not found for unblocked output.`);
        }
      } catch (error) {
        logger.error(`[TM] IPC Error handling unblocked output for session ${sessionId}:`, error);
      }
    });

    this.ipcMain.on(IpcConstants.TERMINAL_RESIZE, (event, { sessionId, cols, rows }) => {
      try {
        if (!sessionId) {
          logger.warn('[TM] IPC Received terminal resize with undefined sessionId');
          return;
        }
        const session = this.terminals.get(sessionId);
        if (session && session.process) {
          session.process.resize(cols, rows);
        } else if (session) {
          logger.warn(`[TM] IPC Cannot resize null process for session ${sessionId}`);
        } else {
          logger.warn(`[TM] IPC Attempted to resize non-existent terminal session: ${sessionId}`);
        }
      } catch (error) {
        logger.error(`[TM] IPC Error handling terminal resize for session ${sessionId}:`, error);
      }
    });
  }
  
  async createTerminalProcess(sessionId, command = null) {
    if (DEBUG) {
      logger.info(`[TM] Creating new terminal process for session ${sessionId}`);
    }

    const { shell, args: shellArgs, isWindows } = getShellConfig();

    try {
      const ptyOptions = {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env,
        useConpty: isWindows, // Force ConPTY use on Windows by default
        conptyInheritCursor: false, // Avoid cursor inheritance issues
      };

      let term;
      try {
        term = ptySpawn(shell, shellArgs, ptyOptions);
      } catch (ptyError) {
        logger.error(`[TM] Error spawning PTY process for session ${sessionId}:`, ptyError);
        if (isWindows) {
          logger.info(`[TM] Attempting fallback PTY creation for session ${sessionId} (disabling ConPTY)`);
          ptyOptions.useConpty = false;
          term = ptySpawn(shell, shellArgs, ptyOptions);
        } else {
          throw ptyError;
        }
      }

      this.terminals.set(sessionId, {
        process: term,
        buffer: '',
        command: command || shell,
        startTime: new Date(),
        status: 'running',
        sessionId: sessionId,
        exitCode: null,
        lastUnblockedOutput: null,
        lastUnblockedOutputTimestamp: null,
        isWindows: isWindows
      });

      term.onData(data => {
        const session = this.terminals.get(sessionId);
        if (session) {
          session.buffer += data;

          // Minimal logging in production, more if DEBUG is true
          if (DEBUG && data.includes(TERMINAL_MARKERS.EXIT_CODE)) {
            logger.info(`[TM Session ${sessionId}] Data chunk contains exit code marker.`);
          }

          const markerMatch = data.match(new RegExp(`${TERMINAL_MARKERS.EXIT_CODE}:(-?\\d+)`));
          if (markerMatch) {
            const exitCode = parseInt(markerMatch[1], 10);
            if (DEBUG) {
                logger.info(`[TM Session ${sessionId}] Exit code marker found: ${exitCode} (matched: ${markerMatch[0]})`);
            }
            session.exitCode = exitCode;
            if (DEBUG) {
                logger.info(`[TM Session ${sessionId}] Updated exitCode to: ${session.exitCode}`);
            }
          }
        }

        const mainWindow = this.getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          let dataForUi = data;

          if (data.includes(TERMINAL_MARKERS.EXIT_MARK_PS) || data.includes(TERMINAL_MARKERS.EXIT_CODE)) {
            const lines = data.split(/\\r\\n|\\r|\\n/);
            const filteredLines = lines.filter(line => {
              const trimmedLine = line.trim();
              const isExitMarkPsLine = trimmedLine === TERMINAL_MARKERS.EXIT_MARK_PS;
              const isExitCodeLine = trimmedLine.startsWith(TERMINAL_MARKERS.EXIT_CODE + ':');
              return !isExitMarkPsLine && !isExitCodeLine;
            });

            if (filteredLines.length > 0) {
              dataForUi = filteredLines.join('\\r\\n');
              if (dataForUi.trim() === '' && data.includes('PS ') && data.includes('>')) {
                  const match = data.match(/PS [^>]*>/);
                  if (match) dataForUi = match[0];
              }
            } else {
              if (data.includes('PS ') && data.includes('>')) {
                const match = data.match(/PS [^>]*>/);
                dataForUi = match ? match[0] : '';
              } else {
                dataForUi = '';
              }
            }
          }
          
          if (dataForUi && dataForUi.length > 0) {
              mainWindow.webContents.send(IpcConstants.PTY_OUTPUT, { sessionId, data: dataForUi });
          }
        }
      });

      term.onExit(({ exitCode, signal }) => {
        try {
          const session = this.terminals.get(sessionId);
          if (session) {
            session.exitCode = session.exitCode !== null ? session.exitCode : exitCode;
            if (session.status !== 'terminated') { // Don't override if manually terminated
              session.status = 'exited';
            }
            logger.info(`[TM] Terminal process exited for session ${sessionId} with code ${session.exitCode}${signal ? ` (signal: ${signal})` : ''}`);
          }
          const mainWindow = this.getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IpcConstants.TERMINAL_EXIT, { sessionId, exitCode: session ? session.exitCode : exitCode });
          }
        } catch (exitHandlerError) {
          logger.error(`[TM] Error in terminal exit handler for session ${sessionId}:`, exitHandlerError);
        }
      });

      if (command) {
        try {
          if (isWindows) {
            term.write(SHELL_COMMANDS.WIN32_EXIT_MARK_FUNCTION);
            term.write(SHELL_COMMANDS.WIN32_CLEAR);
            term.write(`${command}\\r`);
            term.write(SHELL_COMMANDS.WIN32_EMIT_EXIT_MARK);
          } else {
            term.write(`${command}\\r`);
            term.write(SHELL_COMMANDS.UNIX_EMIT_EXIT_CODE);
          }
        } catch (writeError) {
          logger.error(`[TM] Error writing command to terminal for session ${sessionId}:`, writeError);
          const session = this.terminals.get(sessionId);
          if (session) {
            session.status = 'error';
            session.exitCode = EXIT_CODES.GENERAL_ERROR;
          }
        }
      }
      
      // Notify the renderer about the new session, if a command is being run (implies it's for main window)
      // If command is null, it might be a generic terminal for the UI.
      // The original /execute endpoint did this.
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()){
          mainWindow.webContents.send(IpcConstants.SESSION_ID, sessionId);
      }


      return sessionId;
    } catch (error) {
      logger.error(`[TM] Failed to create terminal process for session ${sessionId}:`, error);
      // Ensure session is marked as error if partially created
      if (this.terminals.has(sessionId)) {
        const session = this.terminals.get(sessionId);
        session.status = 'error';
        session.exitCode = EXIT_CODES.PTY_SPAWN_ERROR;
      }
      throw error; // Propagate for API/IPC callers to handle
    }
  }

  cleanupTerminalSession(sessionId) {
    if (!sessionId) {
      logger.warn('[TM] Attempted to clean up session with undefined sessionId');
      return false;
    }

    try {
      if (!this.terminals.has(sessionId)) {
        logger.warn(`[TM] Attempted to clean up non-existent session: ${sessionId}`);
        return false; // Or true if non-existent means already cleaned
      }

      const session = this.terminals.get(sessionId);
      const wasProcessActive = session.process;

      if (session.process) {
        session.isBeingKilled = true; // Mark before attempting to kill
        const tempProcess = session.process;
        session.process = null; // Detach from session object
        killProcess(tempProcess, sessionId, logger, session.isWindows);
      }

      session.status = 'terminated';
      // If exitCode is not already set by the process exit or marker, set to manual termination.
      if (session.exitCode === null) {
        session.exitCode = EXIT_CODES.MANUAL_TERMINATION;
      }
      
      // Clean up any pending completion signals
      if (this.pendingCompletionSignals.has(sessionId)) {
        try {
          const { resolve } = this.pendingCompletionSignals.get(sessionId);
          // Resolve with current session state reflecting termination
          resolve({
            sessionId: session.sessionId,
            command: session.command,
            output: this.formatOutputWithExitCode(session.buffer, session.exitCode),
            status: session.status, // should be 'terminated'
            startTime: session.startTime,
            exitCode: session.exitCode,
            lastUnblockedOutput: session.lastUnblockedOutput,
            lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
          });
        } catch (signalError) {
          logger.error(`[TM] Error resolving pending signals during cleanup for session ${sessionId}:`, signalError);
        }
        this.pendingCompletionSignals.delete(sessionId);
      }

      this.terminals.delete(sessionId);
      logger.info(`[TM] Successfully cleaned up terminal session: ${sessionId}. Process was ${wasProcessActive ? 'active' : 'inactive'}.`);
      return true;
    } catch (error) {
      logger.error(`[TM] Error cleaning up terminal session ${sessionId}:`, error);
      // Attempt forced removal from maps in case of error during cleanup
      if (this.terminals.has(sessionId)) {
        this.terminals.delete(sessionId);
      }
      if (this.pendingCompletionSignals.has(sessionId)) {
        this.pendingCompletionSignals.delete(sessionId);
      }
      return false;
    }
  }

  cleanupAllTerminals() {
    logger.info('[TM] Cleaning up all terminal sessions.');
    // Create a copy of keys to avoid modification issues while iterating
    const sessionIds = Array.from(this.terminals.keys());
    sessionIds.forEach(sessionId => {
      const session = this.terminals.get(sessionId);
      if (session && session.process) { // Check if session still exists and has a process
        logger.info(`[TM] Cleaning up session ${sessionId} during global cleanup.`);
        // Use the more detailed cleanupTerminalSession for each
        // This ensures pending signals are handled, etc.
        // However, cleanupTerminalSession already logs success/failure.
        // Direct kill and removal might be faster if not waiting for promises etc.
        // For consistency and proper state update, using cleanupTerminalSession is better.
        this.cleanupTerminalSession(sessionId);
      } else if (session) {
        // If no process, but session exists, still remove it from the map
        this.terminals.delete(sessionId);
        if (this.pendingCompletionSignals.has(sessionId)) {
            this.pendingCompletionSignals.delete(sessionId); // Also clear any pending promises
        }
        logger.info(`[TM] Removed session ${sessionId} (no active process) during global cleanup.`);
      }
    });
    // This check is mostly for sanity, cleanupTerminalSession should clear them
    if (this.terminals.size > 0) {
        logger.warn(`[TM] Some terminals might not have been fully cleaned. Remaining: ${this.terminals.size}`);
        this.terminals.clear(); // Force clear any stragglers
    }
    if (this.pendingCompletionSignals.size > 0) {
        logger.warn(`[TM] Some pending signals might not have been resolved. Remaining: ${this.pendingCompletionSignals.size}`);
        this.pendingCompletionSignals.clear();
    }
    logger.info('[TM] Finished cleaning up all terminal sessions.');
  }

  async waitForCommandCompletion(sessionId) {
    const session = this.terminals.get(sessionId);

    // If session already has an exit code (e.g. command failed fast, or was synchronous-like)
    if (session && session.exitCode !== null) {
      logger.info(`[TM] Command for session ${sessionId} already completed with exit code ${session.exitCode}.`);
      const finalStatus = (session.status === 'terminated') ? 'terminated' : 'completed';
      if (session.status === 'running') {
        session.status = finalStatus;
      }
      return {
        sessionId: session.sessionId,
        command: session.command,
        output: this.formatOutputWithExitCode(session.buffer, session.exitCode),
        status: finalStatus,
        startTime: session.startTime,
        exitCode: session.exitCode,
        lastUnblockedOutput: session.lastUnblockedOutput,
        lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
      };
    }

    // If session doesn't exist or no process, and not already completed.
    if (!session || !session.process) {
        // Check if there is a pending signal, maybe it was resolved by unblock or cleanup.
        if(this.pendingCompletionSignals.has(sessionId)) {
            // It is already being handled, or will be shortly. Let the promise in the map resolve/reject.
        } else {
            // No session, no process, not completed, and no pending signal. This is an error state.
            const errorMessage = `Session ${sessionId} not found, or process not active, and no prior completion.`;
            logger.error(`[TM] waitForCommandCompletion: ${errorMessage}`);
            throw new Error(errorMessage);
        }
    }

    return new Promise((resolve, reject) => {
      // Store resolve/reject for this sessionId
      this.pendingCompletionSignals.set(sessionId, { resolve, reject });

      // Double check if session still exists after promise setup, it might have been cleaned up.
      const currentSession = this.terminals.get(sessionId);
      if (!currentSession) {
        logger.warn(`[TM] Session ${sessionId} disappeared before completion check could start.`);
        if (this.pendingCompletionSignals.has(sessionId)) {
            this.pendingCompletionSignals.get(sessionId).reject(new Error('Session disappeared before completion check'));
            this.pendingCompletionSignals.delete(sessionId);
        }
        return; // Avoid starting check if session is gone
      }
      this._startCompletionCheck(currentSession, sessionId); 
    });
  }

  _startCompletionCheck(session, sessionId) { // Made private and takes session to avoid repeated lookups
    const checkInterval = setInterval(() => {
      // If the promise for this sessionId was removed (e.g. by early resolve/cleanup), stop checking.
      if (!this.pendingCompletionSignals.has(sessionId)) {
        clearInterval(checkInterval);
        return;
      }

      // Check if the command's exit code has been determined
      if (session.exitCode !== null) {
        clearInterval(checkInterval);
        if (this.pendingCompletionSignals.has(sessionId)) {
          const { resolve } = this.pendingCompletionSignals.get(sessionId);
          const finalStatus = (session.status === 'terminated') ? 'terminated' : 'completed';
          // Ensure status is updated if it was still 'running'
          if (session.status === 'running') {
            session.status = finalStatus;
          }
          
          const mcpOutput = this.formatOutputWithExitCode(session.buffer, session.exitCode);
          
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
          this.pendingCompletionSignals.delete(sessionId);
        }
        return;
      }

      // Safety check: if the session disappears from the map unexpectedly
      // This might be redundant if cleanupTerminalSession correctly clears pendingCompletionSignals
      if (!this.terminals.has(sessionId)) {
        clearInterval(checkInterval);
        if (this.pendingCompletionSignals.has(sessionId)) {
          const { reject } = this.pendingCompletionSignals.get(sessionId);
          reject(new Error(`[TM] Session ${sessionId} disappeared unexpectedly during completion check.`));
          this.pendingCompletionSignals.delete(sessionId);
        }
        return;
      }

      // If the promise was resolved by unblock logic (which removes it from pendingCompletionSignals)
      // and status indicates it was unblocked, stop the interval.
      if (session.status === 'unblocked_output_sent' && !this.pendingCompletionSignals.has(sessionId)) {
         clearInterval(checkInterval);
         logger.info(`[TM] Completion check for ${sessionId} stopped as it was resolved by unblock.`);
         return;
      }

      // TODO: Add timeout logic here if required, to prevent hanging indefinitely
      // Example: if (new Date() - session.startTime > MAX_COMMAND_DURATION) ... reject ...

    }, 100); // Check every 100ms
  }

  formatOutputWithExitCode(outputBuffer, exitCode) {
    // Moved from main.js
    let cleanedBuffer = outputBuffer || '';
    const lines = cleanedBuffer.split(/\r\n|\r/);
    const filteredLines = lines.filter(
      line => !line.includes(TERMINAL_MARKERS.EXIT_MARK_PS) && 
              !line.includes(TERMINAL_MARKERS.EXIT_CODE)
    );
    let mcpOutput = filteredLines.join('\r\n');

    if (exitCode !== null && exitCode !== undefined) {
      if (mcpOutput.length > 0 && !mcpOutput.endsWith('\n') && !mcpOutput.endsWith('\r')) {
        mcpOutput += '\r\n';
      }
      mcpOutput += `Exit Code: ${exitCode}\r\n`;
    }
    return mcpOutput;
  }
}

export default TerminalManager; 