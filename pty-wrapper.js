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
    // Default to WinPTY on Windows instead of ConPTY to avoid assertion errors
    mergedOptions.useConpty = false;
    mergedOptions.windowsEnableConsoleTitleChange = false;
    
    try {
      const term = originalPtySpawn(file, args, mergedOptions);
      
      // Replace kill method with safer version
      const originalKill = term.kill;
      term.kill = function(signal) {
        try {
          // Set a flag to indicate this process is being killed
          this._isBeingKilled = true;
          
          // Defensively wrap the kill call
          originalKill.call(this, signal);
        } catch (killError) {
          // Log but don't crash on kill errors
          logger.warn('Suppressed error during pty kill:', killError);
          // Don't rethrow
        }
      };
      
      return term;
    } catch (error) {
      logger.error('WinPTY spawn failed, trying with even more basic options:', error);
      
      // Try with minimalist options
      const basicOptions = {
        name: 'xterm-color',
        cols: mergedOptions.cols,
        rows: mergedOptions.rows,
        cwd: mergedOptions.cwd,
        env: mergedOptions.env,
        useConpty: false
      };
      
      return originalPtySpawn(file, args, basicOptions);
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