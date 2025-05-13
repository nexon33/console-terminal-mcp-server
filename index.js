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
import lockfile from 'proper-lockfile';

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

// Function to acquire mutex
async function acquireMutex() {
  try {
    await lockfile.lock(MUTEX_FILE, {
      retries: {
        // Retry acquiring the lock for up to 10 seconds
        retries: 10,
        factor: 2,
        minTimeout: 100,
        maxTimeout: 1000,
        randomize: true
      },
      stale: 5000, // Consider lock stale after 5 seconds
      update: 2000, // Update lock file timestamp every 2 seconds
      realpath: false // Do not resolve the real path of the lock file
    });
    console.error('Mutex acquired successfully.');
    return true;
  } catch (error) {
    console.error('Failed to acquire mutex:', error.message);
    return false;
  }
}

// Function to release mutex
async function releaseMutex() {
  try {
    if (fs.existsSync(MUTEX_FILE)) {
      await lockfile.unlock(MUTEX_FILE);
      console.error('Mutex released successfully.');
    }
  } catch (error) {
    console.error('Error releasing mutex:', error.message);
  }
}


// Function to start the Electron process
async function startElectronProcess() {
  try {
    // Try to acquire mutex
    if (!(await acquireMutex())) {
      console.error('Electron process is already running or failed to acquire mutex.');
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

    console.error('Starting Electron process');

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
      console.error('Electron stdout:', data.toString());
    });

    electronProcess.stderr.on('data', (data) => {
      console.error('Electron stderr:', data.toString());
    });

    electronProcess.on('error', async (error) => {
      console.error('Failed to start Electron:', error);
      await releaseMutex();
    });

    electronProcess.on('exit', async (code, signal) => {
      console.error(`Electron process exited with code ${code} and signal ${signal}`);
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
            console.error('Server is now running');
            resolve();
          } else {
            attempts++;
            console.error(`Waiting for server to start... (attempt ${attempts}/${maxAttempts})`);
            if (attempts >= maxAttempts) {
              await releaseMutex();
              reject(new Error('Server failed to start within timeout period'));
              return;
            }
            setTimeout(checkServer, 1000);
          }
        } catch (error) {
          console.error('Error checking server status:', error);
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
    console.error('Failed to start Electron process:', error);
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
  console.error('Uncaught exception:', err);
  await releaseMutex();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
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