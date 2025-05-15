import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import logger from '../logger.js'; // Assuming logger is in the root
import { EXIT_CODES } from './constants.js'; // For default exit codes

const PORT = 3000;

// Helper function to get a final exit code, defaulting to 0 if not set
function getFinalExitCode(result, session) {
  if (result && result.exitCode !== null && result.exitCode !== undefined) {
    return result.exitCode;
  }
  if (session && session.exitCode !== null && session.exitCode !== undefined) {
    return session.exitCode;
  }
  return EXIT_CODES.SUCCESS; // Default to success if no code is found
}

// Helper function to build and send JSON responses
function sendJsonResponse(res, data, statusCode = 200) {
  res.status(statusCode).json(data);
}

function sendJsonError(res, error, defaultMessage, statusCode = 500, additionalData = {}) {
  logger.error(`API Error: ${defaultMessage}`, error);
  res.status(statusCode).json({
    error: error.message || defaultMessage,
    ...additionalData
  });
}

class ApiServer {
  constructor(terminalManager) {
    this.terminalManager = terminalManager;
    this.apiServer = express();
    this._configureMiddleware();
    this._configureRoutes();
  }

  _configureMiddleware() {
    this.apiServer.use(cors());
    this.apiServer.use(bodyParser.json());
    // Basic security middleware from main.js
    this.apiServer.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  _configureRoutes() {
    // Health check endpoint
    this.apiServer.get('/health', (req, res) => {
      sendJsonResponse(res, { status: 'ok' });
    });

    // API endpoint to execute command (new session)
    this.apiServer.post('/execute', async (req, res) => {
      try {
        const { command } = req.body;
        if (!command || command.trim().length === 0) {
          return sendJsonError(res, new Error('Command is required'), 'Command is required', 400);
        }
        // Basic command validation (from main.js)
        if (command.includes('&&&') || command.includes('|||') || command.includes(';')) {
           return sendJsonError(res, new Error('Command chaining is not allowed'), 'Command chaining not allowed', 400);
        }

        const sessionId = this.terminalManager.generateSessionId();
        // In the new architecture, createOrShowMainWindow() will be handled by ElectronAppManager
        // and typically shown when the app starts or a new terminal is requested from UI.
        // For API calls, we assume the window/app is running.

        await this.terminalManager.createTerminalProcess(sessionId, command);
        
        // The original main.js sent 'session-id' via IPC here.
        // This might be done by createTerminalProcess or an event listener in ElectronAppManager if needed.

        logger.info(`[API /execute] Before waitForCommandCompletion for session ${sessionId}`);
        const result = await this.terminalManager.waitForCommandCompletion(sessionId);
        logger.info(`[API /execute] After waitForCommandCompletion for session ${sessionId}, exitCode=${result.exitCode}`);

        const session = this.terminalManager.terminals.get(sessionId);
        const exitCodeValue = getFinalExitCode(result, session);
        const mcpOutput = this.terminalManager.formatOutputWithExitCode(result.output, exitCodeValue);

        sendJsonResponse(res, {
          ...result,
          output: mcpOutput,
          exitCode: exitCodeValue
        });

      } catch (error) {
        // Attempt to get session details if an error occurred after session creation
        const sessionIdFromError = error.sessionId || (error.message && error.message.includes('session_') ? error.message.match(/session_\d+_\d+/)?.[0] : null);
        let sessionDetails = {};
        if (sessionIdFromError && this.terminalManager.terminals.has(sessionIdFromError)) {
            const failedSession = this.terminalManager.terminals.get(sessionIdFromError);
            sessionDetails = {
                sessionId: failedSession.sessionId,
                command: failedSession.command,
                status: failedSession.status,
                exitCode: getFinalExitCode(null, failedSession)
            };
        }
        sendJsonError(res, error, 'Failed to execute command', 500, sessionDetails);
      }
    });

    // API endpoint to execute command in existing session
    this.apiServer.post('/execute/:sessionId', async (req, res) => {
      const { sessionId } = req.params;
      try {
        const { command } = req.body;
        if (!command || command.trim().length === 0) {
          return sendJsonError(res, new Error('Command is required'), 'Command required', 400, { sessionId });
        }

        const session = this.terminalManager.terminals.get(sessionId);
        if (!session) {
          return sendJsonError(res, new Error('Session not found'), 'Session not found', 404, { sessionId });
        }
        if (!session.process || session.status === 'terminated' || session.status === 'exited') {
          return sendJsonError(res, new Error('Session is not active'), 'Session not active', 400, { sessionId });
        }

        // Reset relevant parts of session state for new command
        session.buffer = '';
        session.exitCode = null;
        session.status = 'running';
        session.command = command; // Update command
        session.startTime = new Date(); // Update start time
        session.lastUnblockedOutput = null;
        session.lastUnblockedOutputTimestamp = null;

        // Write command to PTY (OS-specific logic is now in TerminalManager or process-utils)
        this.terminalManager.writeCommandToSession(sessionId, command);

        logger.info(`[API /execute/${sessionId}] Before waitForCommandCompletion`);
        const result = await this.terminalManager.waitForCommandCompletion(sessionId);
        logger.info(`[API /execute/${sessionId}] After waitForCommandCompletion, exitCode=${result.exitCode}`);
        
        const currentSession = this.terminalManager.terminals.get(sessionId); // Re-fetch to get latest state
        const exitCodeValue = getFinalExitCode(result, currentSession);
        const mcpOutput = this.terminalManager.formatOutputWithExitCode(result.output, exitCodeValue);

        sendJsonResponse(res, {
          ...result,
          output: mcpOutput,
          exitCode: exitCodeValue
        });

      } catch (error) {
        const currentSessionOnError = this.terminalManager.terminals.get(sessionId);
        let errorDetails = { sessionId };
        if (currentSessionOnError) {
            errorDetails.command = currentSessionOnError.command;
            errorDetails.status = currentSessionOnError.status;
            errorDetails.exitCode = getFinalExitCode(null, currentSessionOnError);
        }
        sendJsonError(res, error, 'Failed to execute command in session', 500, errorDetails);
      }
    });

    // API endpoint to list active sessions
    this.apiServer.get('/sessions', (req, res) => {
      try {
        const sessions = Array.from(this.terminalManager.terminals.values()).map(session => ({
          sessionId: session.sessionId,
          command: session.command,
          status: session.status,
          startTime: session.startTime,
          exitCode: session.exitCode,
          isWindows: session.isWindows,
          lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
        }));
        sendJsonResponse(res, { sessions });
      } catch (error) {
        sendJsonError(res, error, 'Failed to list sessions');
      }
    });

    // API endpoint to get command output
    this.apiServer.get('/output/:sessionId', (req, res) => {
      const { sessionId } = req.params;
      try {
        const session = this.terminalManager.terminals.get(sessionId);
        if (!session) {
          return sendJsonError(res, new Error('Session not found'), 'Session not found', 404, { sessionId });
        }
        
        const mcpOutput = this.terminalManager.formatOutputWithExitCode(session.buffer, session.exitCode);
        sendJsonResponse(res, {
          sessionId: session.sessionId,
          command: session.command,
          output: mcpOutput,
          status: session.status,
          startTime: session.startTime,
          exitCode: session.exitCode,
          lastUnblockedOutput: session.lastUnblockedOutput,
          lastUnblockedOutputTimestamp: session.lastUnblockedOutputTimestamp
        });
      } catch (error) {
        sendJsonError(res, error, 'Failed to get command output', 500, { sessionId });
      }
    });

    // API endpoint to stop command
    this.apiServer.post('/stop/:sessionId', (req, res) => {
      const { sessionId } = req.params;
      try {
        const session = this.terminalManager.terminals.get(sessionId);
        if (!session) {
          return sendJsonError(res, new Error('Session not found'), 'Session not found', 404, { sessionId });
        }

        if (session.process) {
          // cleanupTerminalSession handles killing the process and updating state
          this.terminalManager.cleanupTerminalSession(sessionId);
          // Ensure the response reflects manual termination code if set by cleanup
          const updatedSession = this.terminalManager.terminals.get(sessionId) || session;
          sendJsonResponse(res, { 
            success: true, 
            message: 'Command terminated', 
            sessionId, 
            exitCode: updatedSession.exitCode !== null ? updatedSession.exitCode : EXIT_CODES.MANUAL_TERMINATION 
          });
        } else {
          sendJsonError(res, new Error('Process already terminated or not found'), 'Process not active', 400, { sessionId, status: session.status });
        }
      } catch (error) {
        sendJsonError(res, error, 'Failed to stop command', 500, { sessionId });
      }
    });
  }

  start() {
    this.apiServer.listen(PORT, () => {
      logger.info(`API server listening on port ${PORT}`);
    });
    return this.apiServer; // Return instance for testing or other uses if needed
  }
}

export default ApiServer; 