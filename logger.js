import winston from 'winston';
import path from 'path';
import os from 'os';
import fs from 'fs'; // Import fs for directory creation

// Determine the appropriate log directory
let logDir;
if (process.env.NODE_ENV === 'development') {
  logDir = '.'; // Current directory for development
} else {
  // Use platform-specific app data directory
  const platform = os.platform();
  if (platform === 'win32') {
    logDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (platform === 'darwin') {
    logDir = path.join(os.homedir(), 'Library', 'Application Support');
  } else { // Linux and other Unix-like
    logDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
}

const appLogDir = path.join(logDir, 'mcp-server-logs');

// Ensure the log directory exists
try {
  if (!fs.existsSync(appLogDir)) {
    fs.mkdirSync(appLogDir, { recursive: true });
  }
} catch (error) {
  // Fallback to console if directory creation fails, to avoid crashing the app
  console.error(`Failed to create log directory at ${appLogDir}:`, error);
  // Potentially, we could have a very basic console-only logger here as a fallback
  // For now, winston will likely error out if it can't write to files,
  // but the console transport (if added) might still work.
}


const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-server' },
  transports: [
    new winston.transports.File({ filename: path.join(appLogDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(appLogDir, 'application.log') })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(appLogDir, 'exceptions.log') })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(appLogDir, 'rejections.log') })
  ]
});

// Create a stream object with a 'write' function that will be used by morgan or other stream-based loggers
logger.stream = {
  write: function(message) {
    logger.info(message.trim());
  },
};


export default logger;