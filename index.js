import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create MCP server
let apiBaseUrl = 'http://localhost';

// Get port from environment variable or use default
const port = process.env.PORT || 3000;
apiBaseUrl += `:${port}`;

// Mutex file path
const MUTEX_FILE = path.join(os.tmpdir(), 'electron-mcp-mutex');

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
function acquireMutex() {
  try {
    // Try to create the mutex file
    fs.writeFileSync(MUTEX_FILE, process.pid.toString(), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      // Mutex exists, check if process is still running
      try {
        const pid = parseInt(fs.readFileSync(MUTEX_FILE, 'utf8'));
        try {
          // Try to send signal 0 to check if process exists
          process.kill(pid, 0);
          return false; // Process is still running
        } catch (e) {
          // Process doesn't exist, we can take the mutex
          fs.unlinkSync(MUTEX_FILE);
          return acquireMutex();
        }
      } catch (e) {
        // Can't read mutex file, try to remove it
        try {
          fs.unlinkSync(MUTEX_FILE);
          return acquireMutex();
        } catch (e) {
          return false;
        }
      }
    }
    return false;
  }
}

// Function to release mutex
function releaseMutex() {
  try {
    if (fs.existsSync(MUTEX_FILE)) {
      fs.unlinkSync(MUTEX_FILE);
    }
  } catch (error) {
    console.error('Error releasing mutex:', error);
  }
}

// Function to check if Electron is already running
async function isElectronRunning() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq electron.exe"');
      return stdout.toLowerCase().includes('electron.exe');
    } else {
      const { stdout } = await execAsync('ps aux | grep electron');
      return stdout.toLowerCase().includes('electron') && !stdout.toLowerCase().includes('grep');
    }
  } catch (error) {
    console.error('Error checking if Electron is running:', error);
    return false;
  }
}

// Function to start the Electron process
async function startElectronProcess() {
  try {
    // Try to acquire mutex
    if (!acquireMutex()) {
      console.error('Electron process is already running');
      return;
    }

    // Get the path to electron from node_modules
    const electronPath = path.join(process.cwd(), 'node_modules', '.bin', 'electron.cmd');

    // Set up environment variables
    const env = {
      ...process.env,
      ELECTRON_START_URL: 'http://localhost:3000',
      ELECTRON_ENABLE_LOGGING: 'true',
      ELECTRON_ENABLE_STACK_DUMPING: 'true',
      NODE_ENV: 'development'
    };

    console.error('Starting Electron process');

    // Use cmd.exe to run electron on Windows
    const electronProcess = spawn('npx', ['electron', 'C:\\Users\\adria\\Documents\\ClaudeSandbox\\mcp-server'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: env,
      windowsHide: true,
      shell: true
    });

    // Log any output from the electron process
    electronProcess.stdout.on('data', (data) => {
      console.error('Electron stdout:', data.toString());
    });

    electronProcess.stderr.on('data', (data) => {
      console.error('Electron stderr:', data.toString());
    });

    electronProcess.on('error', (error) => {
      console.error('Failed to start Electron:', error);
      releaseMutex();
    });

    electronProcess.on('exit', (code, signal) => {
      console.error(`Electron process exited with code ${code} and signal ${signal}`);
      releaseMutex();
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
              releaseMutex();
              reject(new Error('Server failed to start within timeout period'));
              return;
            }
            setTimeout(checkServer, 1000);
          }
        } catch (error) {
          console.error('Error checking server status:', error);
          attempts++;
          if (attempts >= maxAttempts) {
            releaseMutex();
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
    releaseMutex();
    throw error;
  }
}

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
      // Clean up terminal output by removing ANSI escape sequences
      const cleanOutput = result.output.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
      return {
        content: [{
          type: "text",
          text: `Session ID: ${result.sessionId}\n\n ${cleanOutput}`,
          exitCode: result.exitCode
        }],
        sessionId: result.sessionId
      };
    } catch (error) {
      const errorSessionId = error.response?.data?.sessionId || null;
      return {
        content: [{
          type: "text", text: `Session ID: ${errorSessionId}\n\n ${error.response?.data?.error || error.message}`,
          exitCode: 1
        }]
      };
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
      // Clean up terminal output by removing ANSI escape sequences
      const cleanOutput = result.output.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
      return {
        content: [{
          type: "text",
          text: `Session ID: ${result.sessionId}\n\n ${cleanOutput}`,
          exitCode: result.exitCode
        }],

      };
    } catch (error) {
      const errorSessionId = error.response?.data?.sessionId || sessionId || null;
      return {
        content: [{
          type: "text", text: `Session ID: ${result.sessionId}\n\n ${error.response?.data?.error || error.message}`,
          exitCode: 1
        }]
      };
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
      // Clean up terminal output by removing ANSI escape sequences
      const cleanOutput = result.output.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
      return {
        content: [{
          type: "text", text: `Session ID: ${result.sessionId}\n\n ${cleanOutput}`,
          exitCode: result.exitCode
        }]
      };
    } catch (error) {
      const errorSessionId = error.response?.data?.sessionId || sessionId;
      return {
        content: [{
          type: "text", text: `Session ID: ${result.sessionId}\n\n ${error.response?.data?.error || error.message}`,
          exitCode: 1
        }]
      };
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
      const errorSessionId = error.response?.data?.sessionId || sessionId;
      return {
        content: [{
          type: "text", text: `Session ID: ${result.sessionId}\n\n ${error.response?.data?.error || error.message}`,
          exitCode: 1
        }]
      };
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
      return {
        content: [{
          type: "text", text: `Error fetching sessions: ${error.message}`,
          exitCode: 1
        }]
      };
    }
  }
);

// Start server on stdio
const transport = new StdioServerTransport();
await server.connect(transport);