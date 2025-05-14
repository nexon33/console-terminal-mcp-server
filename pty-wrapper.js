// pty-wrapper.js
// Wrapper for node-pty to handle ConPTY errors on Windows
import { spawn as originalPtySpawn } from 'node-pty';
import os from 'os';
import path from 'path';
import logger from './logger.js';

/**
 * Enhanced PTY spawn with better error handling for ConPTY issues
 * Wraps node-pty to catch and handle Windows-specific errors
 */
export function spawn(file, args, options = {}) {
  // Default options
  const defaultOptions = {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || process.env.USERPROFILE,
    env: process.env
  };
  
  // Merge options with defaults
  const mergedOptions = { ...defaultOptions, ...options };
  
  // Windows-specific handling
  if (os.platform() === 'win32') {
    try {
      // Try with ConPTY first
      mergedOptions.useConpty = true;
      mergedOptions.conptyInheritCursor = false;
      return originalPtySpawn(file, args, mergedOptions);
    } catch (conptyError) {
      logger.error('ConPTY initialization failed, falling back to WinPTY:', conptyError);
      
      // Fall back to WinPTY
      mergedOptions.useConpty = false;
      mergedOptions.windowsEnableConsoleTitleChange = false;
      
      try {
        return originalPtySpawn(file, args, mergedOptions);
      } catch (winptyError) {
        logger.error('WinPTY initialization also failed:', winptyError);
        
        // Last resort - basic options only
        const basicOptions = {
          name: 'xterm-color',
          cols: mergedOptions.cols,
          rows: mergedOptions.rows,
          cwd: mergedOptions.cwd,
          env: mergedOptions.env
        };
        
        return originalPtySpawn(file, args, basicOptions);
      }
    }
  } else {
    // Non-Windows platforms
    return originalPtySpawn(file, args, mergedOptions);
  }
}

// Export the original module as well
export { originalPtySpawn as originalSpawn };

export default { 
  spawn,
  originalSpawn: originalPtySpawn
}; 