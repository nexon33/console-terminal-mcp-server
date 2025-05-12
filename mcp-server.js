const net = require('net');
const MCPHandler = require('./mcp-handler');

let instance = null;

class MCPServer {
  constructor() {
    if (instance) {
      return instance;
    }
    this.mcpHandler = new MCPHandler();
    this.server = null;
    this.connections = new Set();
    this.port = null;
    instance = this;
  }

  start(port) {
    if (this.server) {
      console.log('MCP server already running');
      return this.server;
    }

    // Allow port override via env or CLI, or use random port if not specified
    let chosenPort = port || process.env.MCP_PORT || 0;
    this.server = net.createServer((socket) => {
      console.log('MCP client connected');
      this.connections.add(socket);

      let buffer = '';

      socket.on('data', async (data) => {
        const raw = data.toString();
        console.log('[MCP DEBUG] Raw data received:', JSON.stringify(raw));
        buffer += raw;

        // Process complete JSON messages (newline-delimited)
        let jsonEndPos = 0;
        let parsePos = 0;

        while ((jsonEndPos = buffer.indexOf('\n', parsePos)) !== -1) {
          // Extract a complete line which should contain a JSON message
          const jsonString = buffer.substring(parsePos, jsonEndPos).trim();
          parsePos = jsonEndPos + 1;

          if (!jsonString) continue; // Ignore empty lines

          try {
            // Defensive: Only parse if it looks like JSON
            if (!jsonString.startsWith('{') || !jsonString.endsWith('}')) {
              console.warn('[MCP DEBUG] Skipping non-JSON line:', jsonString);
              continue;
            }
            const message = JSON.parse(jsonString);
            console.log('MCP received message type:', message.method);

            // Process the message
            const response = await this.mcpHandler.handleMessage(message);

            // Send the response
            if (response) {
              const responseStr = JSON.stringify(response) + '\n';
              console.log('[MCP DEBUG] Sending response:', responseStr);
              // Send as LSP Content-Length header framing for maximum compatibility
              const jsonBuffer = Buffer.from(responseStr, 'utf8');
              const header = `Content-Length: ${jsonBuffer.length}\r\n\r\n`;
              socket.write(header, 'utf8');
              socket.write(jsonBuffer);
            }
          } catch (error) {
            console.error('Error processing MCP message:', error.message);

            // Send error response
            const errorResponse = {
              jsonrpc: "2.0",
              error: { code: -32700, message: "Parse error" },
              id: null
            };
            const errorStr = JSON.stringify(errorResponse) + '\n';
            console.log('[MCP DEBUG] Sending error response:', errorStr);
            // Send as LSP Content-Length header framing for maximum compatibility
            const errBuffer = Buffer.from(errorStr, 'utf8');
            const errHeader = `Content-Length: ${errBuffer.length}\r\n\r\n`;
            socket.write(errHeader, 'utf8');
            socket.write(errBuffer);
          }
        }

        // Keep any remaining incomplete data
        buffer = buffer.substring(parsePos);
      });

      socket.on('end', () => {
        console.log('MCP client disconnected');
        this.connections.delete(socket);
      });

      socket.on('error', (err) => {
        console.error('MCP socket error:', err.message);
        this.connections.delete(socket);
      });
    });

    this.server.listen(chosenPort, () => {
      this.port = this.server.address().port;
      //console.log(`MCP Server listening on port ${this.port}`);
      // Optionally write port to a file or env for test clients
    });

    this.server.on('error', (err) => {
      console.error('MCP server error:', err.message);
    });

    return this.server;
  }

  getPort() {
    return this.port;
  }

  stop() {
    if (this.server) {
      // Close all active connections
      for (const socket of this.connections) {
        socket.destroy();
      }
      this.connections.clear();

      // Close the server
      this.server.close();
      this.server = null;
      this.port = null;
      console.log('MCP server stopped');
    }
  }
}

module.exports = new MCPServer();