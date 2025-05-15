import { DEFAULT_SHELL, DEFAULT_SHELL_ARGS } from './constants.js';
import os from 'os';

export function getShellConfig() {
  const platform = os.platform();
  if (platform === 'win32') {
    return {
      shell: DEFAULT_SHELL.WIN32,
      args: DEFAULT_SHELL_ARGS.POWERSHELL,
      isWindows: true
    };
  } else if (platform === 'linux') {
    return {
      shell: DEFAULT_SHELL.LINUX,
      args: DEFAULT_SHELL_ARGS.BASH,
      isWindows: false
    };
  } else if (platform === 'darwin') {
    return {
      shell: DEFAULT_SHELL.DARWIN,
      args: DEFAULT_SHELL_ARGS.BASH, // or zsh, might need more sophisticated detection
      isWindows: false
    };
  } else { // Fallback for other Unix-like systems
    return {
      shell: 'sh',
      args: [],
      isWindows: false
    };
  }
}

export function killProcessWindows(process, sessionId, logger) {
  if (!process) {
    logger.warn(`[ProcessUtils] Attempted to kill null process for session ${sessionId}`);
    return;
  }

  logger.info(`[ProcessUtils] Attempting aggressive Windows kill for process associated with session ${sessionId}`);
  try {
    // Detach and kill, similar to the original aggressive cleanup
    const tempProcess = process;
    // In the refactored TerminalManager, the session.process will be set to null by the caller
    // process = null; // This line would have no effect here as 'process' is a local copy

    tempProcess.kill();
    logger.info(`[ProcessUtils] Successfully sent kill signal to process for session ${sessionId} on Windows.`);
  } catch (killError) {
    if (killError.message && (
        killError.message.includes('Assertion failed') ||
        killError.message.includes('status == napi_ok')
    )) {
      logger.warn(`[ProcessUtils] Caught ConPTY assertion error during Windows kill for session ${sessionId} (safe to ignore): ${killError.message}`);
    } else {
      logger.warn(`[ProcessUtils] Suppressed kill error for session ${sessionId} on Windows: ${killError.message}`);
    }
  }
}

// General purpose kill, can be enhanced later if needed
export function killProcess(process, sessionId, logger, isWindows) {
  if (!process) {
    logger.warn(`[ProcessUtils] Attempted to kill null process for session ${sessionId}`);
    return;
  }
  if (isWindows) {
    killProcessWindows(process, sessionId, logger);
  } else {
    try {
      process.kill();
      logger.info(`[ProcessUtils] Successfully sent kill signal to process for session ${sessionId}.`);
    } catch (e) {
      logger.error(`[ProcessUtils] Error killing process for session ${sessionId}:`, e);
    }
  }
} 