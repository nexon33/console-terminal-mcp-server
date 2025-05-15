import logger from './logger.js';
import { executeCommand, executeCommandInSession, getCommandOutput, stopCommand } from './llm-client.js'; // Added .js extension

class MCPHandler {
  constructor() {
    this.activeSessions = new Map();
    this.currentSessionId = null;
  }

  // Handle incoming MCP messages
  async handleMessage(message) {
    try {
      logger.info('Handling MCP message:', message);
      
      if (!message.method) {
        return { 
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid request" },
          id: message.id 
        };
      }

      switch (message.method) {
        case 'initialize':
          return this.handleInitialize(message);
        case 'terminal/execute':
          return this.handleExecute(message);
        case 'terminal/output':
          return this.handleGetOutput(message);
        case 'terminal/stop':
          return this.handleStop(message);
        default:
          return {
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method not found: ${message.method}` },
            id: message.id
          };
      }
    } catch (error) {
      logger.error('Error handling MCP message:', error);
      return {
        jsonrpc: "2.0",
        error: { code: -32000, message: `Internal error: ${error.message}` },
        id: message.id
      };
    }
  }

  // Handle initialize request
  handleInitialize(message) {
    logger.info('Initializing MCP connection');
    // Reset session tracking on new client connection
    this.activeSessions = new Map();
    this.currentSessionId = null;
    
    return {
      jsonrpc: "2.0",
      result: {
        serverInfo: {
          name: "command-terminal-electron",
          version: "1.0.0"
        },
        capabilities: {
          terminal: {
            execute: true,
            output: true,
            stop: true
          }
        }
      },
      id: message.id
    };
  }

  // Handle execute command
  async handleExecute(message) {
    const { command, sessionId } = message.params || {};
    if (!command) {
      return {
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params: command is required" },
        id: message.id
      };
    }

    try {
      let result;
      let sid = sessionId;

      // If sessionId is provided and active, execute in that session
      if (sid && this.activeSessions.has(sid)) {
        try {
          logger.info(`Executing command in existing session ${sid}: ${command}`);
          result = await executeCommandInSession(sid, command);

          // Update session tracking on success
          this.activeSessions.set(sid, {
            lastCommand: command,
            lastOutput: result.output,
            status: result.status,
            timestamp: new Date()
          });

          return {
            jsonrpc: "2.0",
            result: {
              sessionId: sid,
              command: result.command,
              output: result.output,
              status: result.status,
              exitCode: result.exitCode
            },
            id: message.id
          };
        } catch (sessionError) {
          // If session is not active, create a new one
          logger.info(`Session error: ${sessionError.message}, creating new session`);
          result = await executeCommand(command);
          sid = result.sessionId;
          this.activeSessions.set(sid, {
            lastCommand: command,
            lastOutput: result.output,
            status: result.status,
            timestamp: new Date()
          });
          return {
            jsonrpc: "2.0",
            result: {
              sessionId: sid,
              command: result.command,
              output: result.output,
              status: result.status,
              exitCode: result.exitCode
            },
            id: message.id
          };
        }
      } else {
        // No sessionId provided or not active: create a new session
        logger.info(`Creating new session for command: ${command}`);
        result = await executeCommand(command);
        sid = result.sessionId;
        this.activeSessions.set(sid, {
          lastCommand: command,
          lastOutput: result.output,
          status: result.status,
          timestamp: new Date()
        });
        this.currentSessionId = sid; // Optionally update currentSessionId for backward compatibility
        return {
          jsonrpc: "2.0",
          result: {
            sessionId: sid,
            command: result.command,
            output: result.output,
            status: result.status,
            exitCode: result.exitCode
          },
          id: message.id
        };
      }
    } catch (error) {
      return {
        jsonrpc: "2.0",
        error: { code: -32000, message: `Failed to execute command: ${error.message}` },
        id: message.id
      };
    }
  }

  // Handle get output
  async handleGetOutput(message) {
    let { sessionId } = message.params || {};
    
    // If no session ID is provided, use the current session if available
    if (!sessionId && this.currentSessionId) {
      sessionId = this.currentSessionId;
      logger.info(`Using current session ${sessionId} for output request`);
    }
    
    if (!sessionId) {
      return {
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params: sessionId is required and no active session exists" },
        id: message.id
      };
    }

    try {
      const result = await getCommandOutput(sessionId);
      return {
        jsonrpc: "2.0",
        result: {
          sessionId: result.sessionId,
          command: result.command,
          output: result.output,
          status: result.status,
          exitCode: result.exitCode
        },
        id: message.id
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        error: { code: -32000, message: `Failed to get output: ${error.message}` },
        id: message.id
      };
    }
  }

  // Handle stop command
  async handleStop(message) {
    let { sessionId } = message.params || {};
    
    // If no session ID is provided, use the current session if available
    if (!sessionId && this.currentSessionId) {
      sessionId = this.currentSessionId;
      logger.info(`Using current session ${sessionId} for stop request`);
    }
    
    if (!sessionId) {
      return {
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params: sessionId is required and no active session exists" },
        id: message.id
      };
    }

    try {
      const result = await stopCommand(sessionId);
      
      // Clean up our session tracking
      this.activeSessions.delete(sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      
      return {
        jsonrpc: "2.0",
        result: {
          success: true,
          message: "Command terminated",
          exitCode: result.exitCode
        },
        id: message.id
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        error: { code: -32000, message: `Failed to stop command: ${error.message}` },
        id: message.id
      };
    }
  }
}

export default MCPHandler;