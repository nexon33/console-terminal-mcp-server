import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import stripAnsi from 'strip-ansi';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import * as lockfile from 'lockfile'; // Changed import
import logger from './logger.js'; // Assuming logger.js is in the same directory

// console.log = (...args) => logger.info(...args);
// console.error = (...args) => logger.error(...args);
// console.warn = (...args) => logger.warn(...args);
// console.info = (...args) => logger.info(...args);
// console.debug = (...args) => logger.debug(...args); // Winston's default level is 'info', so 'debug' won't show unless level is changed.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to format errors
function formatErrorResponse(error, sessionId = null) {
  let errorMessage = 'An unknown error occurred.';
  let errorSessionId = sessionId;

  if (axios.isAxiosError(error)) {
    if (error.response) {
      errorMessage = `API Error: ${error.response.status} - ${error.response.data?.error || error.response.statusText}`;
      errorSessionId = error.response.data?.sessionId || errorSessionId;
    } else if (error.request) {
      errorMessage = `API Request Error: No response received. ${error.message}`;
    } else {
      errorMessage = `API Setup Error: ${error.message}`;
    }
  } else {
    errorMessage = `Internal Server Error: ${error.message}`;
  }

  return {
    content: [{
      type: "text", text: `Session ID: ${errorSessionId}\n\n ${errorMessage}`,
      exitCode: 1
    }]
  };
}


// Create MCP server
let apiBaseUrl = 'http://localhost';

// Get port from environment variable or use default
const port = process.env.PORT || 3000;
apiBaseUrl += `:${port}`;

// Mutex file path
const MUTEX_FILE = path.join(os.tmpdir(), 'electron-mcp-mutex.lock');

// Function to check if server is running
async function isServerRunning() {
  try {
    await axios.get(`${apiBaseUrl}/health`);
    return true;
  } catch (error) {
    return false;
  }
}

// Promisify lockfile methods
const lock = promisify(lockfile.lock);
const unlock = promisify(lockfile.unlock);

// Function to acquire mutex
async function acquireMutex() {
  try {
    logger.info(`Attempting to acquire mutex for file: ${MUTEX_FILE}`);
    // Options for lockfile:
    // wait: time to wait for lock (ms) - e.g., 10 seconds total
    // stale: time lock is considered stale (ms) - e.g., 5 seconds
    // retries: number of retries
    // retryWait: time between retries (ms)
    const lockOptions = {
      wait: 10 * 1000,   // Max wait time 10s
      pollPeriod: 100, // Check every 100ms
      stale: 5 * 1000,   // Stale after 5s
      retries: 100,      // Number of retries (100 * 100ms = 10s)
      retryWait: 100   // Wait 100ms between retries (used if retries is an object, but pollPeriod covers this for simple retries)
    };
    await lock(MUTEX_FILE, lockOptions);
    logger.info('Mutex acquired successfully.');
    return true;
  } catch (error) {
    logger.error('Failed to acquire mutex:', error.message);
    if (error.code === 'EEXIST') {
      logger.error('Lock file already exists.');
    }
    return false;
  }
}

// Function to release mutex
async function releaseMutex() {
  try {
    // lockfile.unlock will throw if the file doesn't exist or isn't a lock file.
    // It's generally better to just attempt unlock and catch errors.
    // However, to maintain similar logging:
    if (fs.existsSync(MUTEX_FILE)) {
      logger.info(`Attempting to release mutex for file: ${MUTEX_FILE}`);
      await unlock(MUTEX_FILE);
      logger.info('Mutex released successfully.');
    } else {
      // This case might not be strictly necessary if acquireMutex always creates one.
      // And if it doesn't exist, unlock would fail anyway.
      logger.info(`Mutex file ${MUTEX_FILE} not found, no release needed or already released.`);
    }
  } catch (error) {
    logger.error('Error releasing mutex:', error.message);
    // Common errors: ENOENT (file not found), EPERM (not owner)
  }
}


// Function to start the Electron process
async function startElectronProcess() {
  try {
    // Try to acquire mutex
    if (!(await acquireMutex())) {
      logger.error('Electron process is already running or failed to acquire mutex.');
      return;
    }

    // Get the path to electron from node_modules
    const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
    const electronPath = path.join(__dirname, 'node_modules', '.bin', electronExecutable);

    // Set up environment variables
    const env = {
      ...process.env,
      ELECTRON_START_URL: 'http://localhost:3000',
      ELECTRON_ENABLE_LOGGING: 'true',
      ELECTRON_ENABLE_STACK_DUMPING: 'true',
      NODE_ENV: 'development'
    };

    logger.error('Starting Electron process');

    // Use npx to run electron, hiding the window with windowsHide and shell: true
    // Corrected spawn call: path.resolve(__dirname) is now an argument to electronPath
    //const electronProcess = spawn("cmd.exe", ['/c','/s', electronPath, path.resolve(__dirname)], {
      const electronProcess = spawn(electronPath, [path.resolve(__dirname)], {
    detached: true,
      stdio: ['ignore', 'pipe', 'pipe'], // Keep stdio pipes for logging
      cwd: process.cwd(),
      env: env,
      windowsHide: true, // Ensure the window is hidden
      shell: true // Use shell to execute npx correctly
    });

    // Log any output from the electron process
    electronProcess.stdout.on('data', (data) => {
      logger.error('Electron stdout:', data.toString());
    });

    electronProcess.stderr.on('data', (data) => {
      logger.error('Electron stderr:', data.toString());
    });

    electronProcess.on('error', async (error) => {
      logger.error('Failed to start Electron:', error);
      await releaseMutex();
    });

    electronProcess.on('exit', async (code, signal) => {
      logger.error(`Electron process exited with code ${code} and signal ${signal}`);
      await releaseMutex();
    });

    // Don't unref the process immediately to ensure it starts properly
    setTimeout(() => {
      electronProcess.unref();
    }, 1000);

    // Wait for server to be ready
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60;

      const checkServer = async () => {
        try {
          if (await isServerRunning()) {
            logger.error('Server is now running');
            resolve();
          } else {
            attempts++;
            logger.error(`Waiting for server to start... (attempt ${attempts}/${maxAttempts})`);
            if (attempts >= maxAttempts) {
              await releaseMutex();
              reject(new Error('Server failed to start within timeout period'));
              return;
            }
            setTimeout(checkServer, 1000);
          }
        } catch (error) {
          logger.error('Error checking server status:', error);
          attempts++;
          if (attempts >= maxAttempts) {
            await releaseMutex();
            reject(new Error('Server failed to start within timeout period'));
            return;
          }
          setTimeout(checkServer, 1000);
        }
      };
      checkServer();
    });
  } catch (error) {
    logger.error('Failed to start Electron process:', error);
    await releaseMutex();
    throw error;
  }
}

// Ensure mutex is released on process exit
process.on('exit', async () => {
  await releaseMutex();
});

process.on('SIGINT', async () => {
  await releaseMutex();
  process.exit();
});

process.on('SIGTERM', async () => {
  await releaseMutex();
  process.exit();
});

process.on('uncaughtException', async (err) => {
  logger.error('Uncaught exception:', err);
  await releaseMutex();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await releaseMutex();
  process.exit(1);
});

// Create MCP server
const server = new McpServer({
  name: "Electron Terminal",
  description: "Open a terminal window and execute commands via Electron",
  version: "1.0.0"
});

// Tool: terminal/initialize
server.tool(
  "terminal_start",
  {
    command: z.string()
  },
  async ({ command }) => {
    try {
      // Check if server is running, start if not
      if (!(await isServerRunning())) {
        await startElectronProcess();
      }
      // Create a new session
      const response = await axios.post(`${apiBaseUrl}/execute`, { command });
      const result = response.data;
      // Clean up terminal output using strip-ansi
      const cleanOutput = stripAnsi(result.output);
      return {
        content: [{
          type: "text",
          text: `Session ID: ${result.sessionId}\n\n ${cleanOutput}`,
          exitCode: result.exitCode
        }],
        //sessionId: result.sessionId
      };
    } catch (error) {
      return formatErrorResponse(error);
    }
  }
);
// Tool: terminal/execute
server.tool(
  "terminal_execute",
  {
    command: z.string(),
    sessionId: z.string()
  },
  async ({ command, sessionId }) => {
    try {
      // Check if server is running, start if not
      if (!(await isServerRunning())) {
        await startElectronProcess();
      }

      let response;
      //if (sessionId) {
      // Execute in existing session
      response = await axios.post(`${apiBaseUrl}/execute/${sessionId}`, { command });
      //} else {
      // Create new session
      //  response = await axios.post(`${apiBaseUrl}/execute`, { command });
      //}

      const result = response.data;
      // Clean up terminal output using strip-ansi
      const cleanOutput = stripAnsi(result.output);
      return {
        content: [{
          type: "text",
          text: `Session ID: ${result.sessionId}\n\n ${cleanOutput}`,
          exitCode: result.exitCode
        }],

      };
    } catch (error) {
      return formatErrorResponse(error, sessionId);
    }
  }
);

// Tool: terminal/output
server.tool(
  "terminal_get_output",
  {
    sessionId: z.string()
  },
  async ({ sessionId }) => {
    try {
      // Check if server is running, start if not
      if (!(await isServerRunning())) {
        await startElectronProcess();
      }

      const response = await axios.get(`${apiBaseUrl}/output/${sessionId}`);
      const result = response.data;
      // Clean up terminal output using strip-ansi
      const cleanOutput = stripAnsi(result.output);
      return {
        content: [{
          type: "text", text: `Session ID: ${result.sessionId}\n\n ${cleanOutput}`,
          exitCode: result.exitCode
        }]
      };
    } catch (error) {
      return formatErrorResponse(error, sessionId);
    }
  }
);

// Tool: terminal/stop
server.tool(
  "terminal_stop",
  {
    sessionId: z.string()
  },
  async ({ sessionId }) => {
    try {
      // Check if server is running, start if not
      if (!(await isServerRunning())) {
        await startElectronProcess();
      }

      const response = await axios.post(`${apiBaseUrl}/stop/${sessionId}`);
      const result = response.data;
      return {
        content: [{
          type: "text", text: `Session ID: ${result.sessionId}\n\n ${result.message}`,
          exitCode: result.exitCode
        }]
      };
    } catch (error) {
      return formatErrorResponse(error, sessionId);
    }
  }
);

// Tool: terminal/get_sessions

server.tool(
  "terminal_get_sessions",
  {},
  async () => {
    try {
      // Check if server is running, start if not
      if (!(await isServerRunning())) {
        await startElectronProcess();
      }

      const response = await axios.get(`${apiBaseUrl}/sessions`);
      const result = response.data;
      return {
        content: [{
          type: "text", text: `Active sessions:\n\n ${JSON.stringify(result, null, 2)}`,
          exitCode: 0
        }]
      };
    } catch (error) {
      return formatErrorResponse(error);
    }
  }
);

// Start server on stdio
const transport = new StdioServerTransport();
await server.connect(transport);