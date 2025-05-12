const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const os = require('os');

class SimpleTerminal extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Enhanced with better default shell options
    this.shell = options.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
    this.args = options.args || [];
    this.cwd = options.cwd || process.env.HOME || process.env.USERPROFILE;
    this.env = options.env || process.env;
    this.cols = options.cols || 80;
    this.rows = options.rows || 30;
    
    this.process = null;
    this.buffer = '';
    this.ptyProcess = null;
    this.pid = -1;
  }

  spawn() {
    // Enhanced spawn options for better terminal emulation
    const spawnOptions = {
      cwd: this.cwd,
      env: {
        ...this.env,
        TERM: 'xterm-256color', // Better color support
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'electron-terminal'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      // Windows specific options to improve terminal experience
      windowsHide: false,
      shell: process.platform === 'win32' ? true : false
    };
    
    // Add shell environment size variables
    if (process.platform === 'win32') {
      spawnOptions.env.COLS = this.cols.toString();
      spawnOptions.env.LINES = this.rows.toString();
    } else {
      spawnOptions.env.COLUMNS = this.cols.toString();
      spawnOptions.env.LINES = this.rows.toString();
    }

    try {
      this.process = spawn(this.shell, this.args, spawnOptions);
      this.pid = this.process.pid;

      // Improved stdout/stderr handling
      this.process.stdout.setEncoding('utf8');
      this.process.stderr.setEncoding('utf8');
      
      this.process.stdout.on('data', (data) => {
        const output = data.toString();
        this.buffer += output;
        this.emit('data', output);
      });

      this.process.stderr.on('data', (data) => {
        const output = data.toString();
        this.buffer += output;
        this.emit('data', output);
      });

      this.process.on('exit', (code, signal) => {
        this.emit('exit', { exitCode: code, signal });
      });

      this.process.on('error', (err) => {
        console.error('Process error:', err);
        this.emit('error', err);
      });
      
      // Add SIGINT handler
      process.on('SIGINT', () => {
        if (this.process) {
          this.kill();
        }
      });
      
      return this;
    } catch (error) {
      console.error('Failed to spawn process:', error);
      this.emit('error', error);
      return this;
    }
  }

  write(data) {
    if (this.process && this.process.stdin && this.process.stdin.writable) {
      try {
        const success = this.process.stdin.write(data);
        return success;
      } catch (error) {
        console.error('Error writing to process stdin:', error);
        return false;
      }
    }
    return false;
  }

  resize(cols, rows) {
    // Store new dimensions
    this.cols = cols;
    this.rows = rows;
    
    // Notify the process of the resize via SIGWINCH if not on Windows
    if (this.process && process.platform !== 'win32') {
      try {
        process.kill(this.process.pid, 'SIGWINCH');
      } catch (error) {
        console.error('Error sending SIGWINCH:', error);
      }
    }
    
    // Update environment variables for size
    if (this.process && this.process.stdin && this.process.stdin.writable) {
      // For Windows, we can't send SIGWINCH directly, but we can write an escape sequence
      // that many terminal apps recognize (though it depends on the app)
      if (process.platform === 'win32') {
        try {
          // Update environment variables
          this.process.env = {
            ...this.process.env,
            COLS: cols.toString(),
            LINES: rows.toString()
          };
        } catch (error) {
          console.error('Error updating terminal size:', error);
        }
      }
    }
  }

  kill(signal = 'SIGTERM') {
    if (this.process) {
      try {
        // For Windows, use taskkill to ensure child processes are also terminated
        if (process.platform === 'win32' && this.pid > 0) {
          const { execSync } = require('child_process');
          try {
            execSync(`taskkill /pid ${this.pid} /T /F`);
          } catch (e) {
            // Already terminated or not found, ignore error
          }
        }
        
        return this.process.kill(signal);
      } catch (error) {
        console.error('Error killing process:', error);
        return false;
      }
    }
    return false;
  }

  get pid() {
    return this.process ? this.process.pid : null;
  }

  // Node-pty compatible interface
  onData(callback) {
    this.on('data', callback);
    return this;
  }

  onExit(callback) {
    this.on('exit', callback);
    return this;
  }
}

module.exports = {
  spawn: (shell, args, options = {}) => {
    const term = new SimpleTerminal({
      shell,
      args,
      cwd: options.cwd,
      env: options.env,
      cols: options.cols || 80,
      rows: options.rows || 30
    });
    return term.spawn();
  }
};