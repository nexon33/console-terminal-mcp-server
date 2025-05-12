import net from 'net';
import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
const MCP_PORT = process.env.MCP_PORT || 0; // 0 means random available port
const ELECTRON_API_URL = 'http://localhost:3000'; // Electron app's API server
const HEALTH_CHECK_URL = `${ELECTRON_API_URL}/health`;
const ELECTRON_START_COMMAND = 'npm'; // Command to start electron
const ELECTRON_START_ARGS = ['start']; // Args for the command (e.g., ['run', 'start'] or ['start'])
const HEALTH_CHECK_TIMEOUT = 500; // ms between health checks
const HEALTH_CHECK_MAX_ATTEMPTS = 20; // Max attempts (e.g., 20 * 500ms = 10 seconds)

// Get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let electronAppProcess = null;
let isElectronAppStarting = false;
let serverActualPort = null;

// --- Helper Functions ---

/**
 * Checks if the Electron app's API server is responsive.
 */
async function isElectronAppReady() {
  try {
    const response = await axios.get(HEALTH_CHECK_URL, { timeout: HEALTH_CHECK_TIMEOUT });
    return response.status === 200;
  } catch (error) {
    // Network errors (ECONNREFUSED) mean it's not ready
    return false;
  }
}

/**
 * Starts the Electron application using child_process.spawn.
 */
function startElectronApp() {
  if (electronAppProcess && electronAppProcess.pid && !electronAppProcess.killed) {
    console.log(`[Launcher] Electron app already running with PID: ${electronAppProcess.pid}.`);
    return;
  }
  if (isElectronAppStarting) {
    console.log('[Launcher] Electron app is already in the process of starting.');
    return;
  }

  console.log('[Launcher] Attempting to start Electron application...');
  isElectronAppStarting = true;

  try {
    console.log(`[Launcher] Spawning: ${ELECTRON_START_COMMAND} ${ELECTRON_START_ARGS.join(' ')} in ${__dirname}`);
    electronAppProcess = spawn([ELECTRON_START_COMMAND].concat(ELECTRON_START_ARGS), {
      cwd: __dirname,
      detached: true,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    console.log(`[Launcher] Electron app spawned with PID: ${electronAppProcess.pid}`);
    electronAppProcess.unref();

    electronAppProcess.on('error', (err) => {
      console.error(`[Launcher] Failed to start Electron app (PID: ${electronAppProcess ? electronAppProcess.pid : 'N/A'}):`, err);
      electronAppProcess = null;
      isElectronAppStarting = false;
    });

    electronAppProcess.on('exit', (code, signal) => {
      console.log(`[Launcher] Electron app process (PID: ${electronAppProcess ? electronAppProcess.pid : 'N/A'}) exited with code ${code} and signal ${signal}`);
      electronAppProcess = null;
      isElectronAppStarting = false;
    });

  } catch (error) {
      console.error('[Launcher] Error spawning Electron app:', error);
      isElectronAppStarting = false;
      electronAppProcess = null;
  }
}

/**
 * Waits for the Electron app to become ready.
 */
async function ensureElectronAppReady() {
  console.log('[Launcher] Checking Electron app readiness...');
  if (await isElectronAppReady()) {
    console.log('[Launcher] Electron app reported as ready (pre-check).');
    isElectronAppStarting = false;
    return true;
  }
  console.log('[Launcher] Electron app not ready (pre-check).');

  // Check if it's already running or starting due to a concurrent request
  if ((electronAppProcess && electronAppProcess.pid && !electronAppProcess.killed) || isElectronAppStarting) {
     console.log('[Launcher] Electron app process exists or is starting, proceeding to wait loop.');
  } else {
      console.log('[Launcher] No existing Electron process found, calling startElectronApp().');
      startElectronApp();
  }

  // Wait for the app to start
  console.log('[Launcher] Entering wait loop for Electron app readiness...');
  let attempts = 0;
  while (attempts < HEALTH_CHECK_MAX_ATTEMPTS) {
    console.log(`[Launcher] Health check attempt ${attempts + 1}/${HEALTH_CHECK_MAX_ATTEMPTS}...`);
    if (await isElectronAppReady()) {
      console.log('[Launcher] Electron app is ready.');
      isElectronAppStarting = false;
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_TIMEOUT));
    attempts++;
  }

  console.error('[Launcher] Electron app failed to start/become ready within the timeout.');
  isElectronAppStarting = false;
  if (electronAppProcess && electronAppProcess.pid && !electronAppProcess.killed) {
      console.log(`[Launcher] Killing potentially stuck Electron process (PID: ${electronAppProcess.pid}).`);
      try {
          // Use taskkill on Windows, kill otherwise
          if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', electronAppProcess.pid.toString(), '/f', '/t']);
          } else {
              process.kill(-electronAppProcess.pid, 'SIGKILL'); // Kill process group
          }
      } catch (killError) {
          console.error('Failed to kill Electron process:', killError);
      }
      electronAppProcess = null;
  }
  return false;
}

// --- MCP Message Handling ---

async function handleMcpMessage(message, socket) {
  console.log('[MCP] Received message:', JSON.stringify(message));
  let responsePayload = { jsonrpc: "2.0", id: message.id };

  try {
    // Ensure Electron app is running before handling commands that need it
    if (message.method.startsWith('terminal/')) {
      const ready = await ensureElectronAppReady();
      if (!ready) {
        throw new Error('Electron application failed to start or become ready.');
      }
    }

    switch (message.method) {
      case 'initialize':
        responsePayload.result = {
          serverInfo: { name: "standalone-mcp-terminal-server", version: "1.0.0" },
          capabilities: {
            terminal: { execute: true, output: true, stop: true }
          }
        };
        break;

      case 'terminal/execute':
        const { command, sessionId } = message.params || {};
        if (!command) throw new Error("Missing 'command' parameter");

        let apiUrl = `${ELECTRON_API_URL}/execute`;
        if (sessionId) {
            apiUrl += `/${sessionId}`; // Append sessionId if provided
        }
        console.log(`[MCP] Forwarding execute request to ${apiUrl}`);
        const apiResponse = await axios.post(apiUrl, { command });
        responsePayload.result = apiResponse.data; // Forward the API response directly
        break;

      case 'terminal/output':
        const { sessionId: outputSessionId } = message.params || {};
        if (!outputSessionId) throw new Error("Missing 'sessionId' parameter");
        console.log(`[MCP] Forwarding output request for ${outputSessionId}`);
        const outputResponse = await axios.get(`${ELECTRON_API_URL}/output/${outputSessionId}`);
        responsePayload.result = outputResponse.data;
        break;

      case 'terminal/stop':
        const { sessionId: stopSessionId } = message.params || {};
        if (!stopSessionId) throw new Error("Missing 'sessionId' parameter");
         console.log(`[MCP] Forwarding stop request for ${stopSessionId}`);
        const stopResponse = await axios.post(`${ELECTRON_API_URL}/stop/${stopSessionId}`);
        responsePayload.result = stopResponse.data;
        break;

      default:
        responsePayload.error = { code: -32601, message: `Method not found: ${message.method}` };
    }
  } catch (error) {
    console.error(`[MCP] Error handling method ${message.method}:`, error.message);
    // Check if error is from Axios (API call failed)
    if (error.response) {
        console.error('[MCP] API Error Response:', error.response.data);
         responsePayload.error = { code: -32000, message: `API Error: ${error.response.data?.error || error.message}` };
    } else {
         responsePayload.error = { code: -32000, message: `Internal Server Error: ${error.message}` };
    }
  }

  // Send response back to MCP client
  const responseStr = JSON.stringify(responsePayload) + '\n';
  console.log('[MCP] Sending response:', responseStr);
  // Use LSP Content-Length framing
  const jsonBuffer = Buffer.from(responseStr, 'utf8');
  const header = `Content-Length: ${jsonBuffer.length}\r\n\r\n`;
  socket.write(header, 'utf8');
  socket.write(jsonBuffer);
}


// --- MCP Server Setup ---
const mcpServer = net.createServer((socket) => {
  console.log('[MCP] Client connected');
  let buffer = '';

  socket.on('data', (data) => {
    buffer += data.toString();
    let boundary = buffer.indexOf('\r\n\r\n'); // Find LSP header end

    while(boundary !== -1) {
        const headerPart = buffer.substring(0, boundary);
        const headers = headerPart.split('\r\n');
        let contentLength = -1;

        headers.forEach(header => {
            if (header.toLowerCase().startsWith('content-length:')) {
                contentLength = parseInt(header.split(':')[1].trim(), 10);
            }
        });

        if (contentLength === -1) {
            console.error('[MCP] Error: Missing Content-Length header.');
            // Consider closing the socket or sending an error
            socket.end(); // Or send error response
            return;
        }

        const messageStart = boundary + 4; // Start of JSON message
        const messageEnd = messageStart + contentLength;

        if (buffer.length >= messageEnd) {
            const messageJson = buffer.substring(messageStart, messageEnd);
            buffer = buffer.substring(messageEnd); // Remove processed message from buffer

            try {
                const message = JSON.parse(messageJson);
                handleMcpMessage(message, socket); // Process async
            } catch (e) {
                console.error('[MCP] Error parsing JSON:', e.message);
                // Send JSON-RPC Parse error
                 const errorResponse = { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null };
                 const errorStr = JSON.stringify(errorResponse) + '\n';
                 const errBuffer = Buffer.from(errorStr, 'utf8');
                 const errHeader = `Content-Length: ${errBuffer.length}\r\n\r\n`;
                 socket.write(errHeader, 'utf8');
                 socket.write(errBuffer);
            }

            // Check for next message in buffer
            boundary = buffer.indexOf('\r\n\r\n');
        } else {
            // Not enough data for the full message yet, wait for more
            break;
        }
    }
  });

  socket.on('end', () => {
    console.log('[MCP] Client disconnected');
  });

  socket.on('error', (err) => {
    console.error('[MCP] Socket error:', err.message);
  });
});

mcpServer.listen(MCP_PORT, () => {
  serverActualPort = mcpServer.address().port;
  console.log(`[MCP] Standalone Server listening on port ${serverActualPort}`);
  // TODO: Maybe write this port to a file if clients need to discover it?
});

mcpServer.on('error', (err) => {
  console.error('[MCP] Server error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[MCP] Shutting down server...');
  mcpServer.close();
  if (electronAppProcess) {
    console.log('[MCP] Stopping Electron app process...');
     try {
          // Use taskkill on Windows, kill otherwise
          if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', electronAppProcess.pid.toString(), '/f', '/t']);
          } else {
              process.kill(-electronAppProcess.pid, 'SIGKILL'); // Kill process group
          }
      } catch (killError) {
          console.error('Failed to kill Electron process during shutdown:', killError);
      }
  }
  process.exit(0);
});