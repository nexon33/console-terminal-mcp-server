import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

// Create MCP server
let apiBaseUrl = 'http://localhost';

// Get port from environment variable or use default
const port = process.env.PORT || 3000;
apiBaseUrl += `:${port}`;

// Create MCP server
const server = new McpServer({
  name: "Electron Terminal",
  description: "Open a terminal window and execute commands via Electron",
  version: "1.0.0"
});

// Tool: terminal/execute
server.tool(
  "terminal_execute",
  {
    command: z.string(),
    sessionId: z.string().optional()
  },
  async ({ command, sessionId }) => {
    try {
      let response;
      if (sessionId) {
        // Execute in existing session
        response = await axios.post(`${apiBaseUrl}/execute/${sessionId}`, { command });
      } else {
        // Create new session
        response = await axios.post(`${apiBaseUrl}/execute`, { command });
      }
      
      const result = response.data;
      return {
        content: [{ type: "text", text: result.output }],
        sessionId: result.sessionId,
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.response?.data?.error || error.message }],
        sessionId: sessionId || null,
        exitCode: 1
      };
    }
  }
);

// Tool: terminal/output
server.tool(
  "terminal_output",
  {
    sessionId: z.string()
  },
  async ({ sessionId }) => {
    try {
      const response = await axios.get(`${apiBaseUrl}/output/${sessionId}`);
      const result = response.data;
      return {
        content: [{ type: "text", text: result.output }],
        sessionId: result.sessionId,
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.response?.data?.error || error.message }],
        sessionId: sessionId,
        exitCode: 1
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
      const response = await axios.post(`${apiBaseUrl}/stop/${sessionId}`);
      const result = response.data;
      return {
        content: [{ type: "text", text: result.message }],
        sessionId: sessionId,
        exitCode: result.exitCode
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: error.response?.data?.error || error.message }],
        sessionId: sessionId,
        exitCode: 1
      };
    }
  }
);

// Start server on stdio
const transport = new StdioServerTransport();
await server.connect(transport);