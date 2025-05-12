const axios = require('axios');
const API_BASE = 'http://localhost:3000';

// Execute a command in a new terminal window
async function executeCommand(command) {
  try {
    const response = await axios.post(`${API_BASE}/execute`, { command });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Failed to execute command');
  }
}

// Execute command in an existing session
async function executeCommandInSession(sessionId, command) {
    try {
      console.log(`Attempting to execute command in session ${sessionId}: ${command}`);
      const response = await axios.post(`${API_BASE}/execute/${sessionId}`, { command });
      console.log(`Command execution successful in session ${sessionId}`);
      return response.data;
    } catch (error) {
      console.error(`Error executing command in session ${sessionId}:`, error.message);
      if (error.response?.status === 400 && error.response?.data?.error?.includes('not active')) {
        throw new Error('Session is not active');
      }
      throw new Error(error.response?.data?.error || 'Failed to execute command in session');
    }
  }

// Get command output from a session
async function getCommandOutput(sessionId) {
  try {
    const response = await axios.get(`${API_BASE}/output/${sessionId}`);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Failed to get command output');
  }
}

// Stop a running command
async function stopCommand(sessionId) {
  try {
    const response = await axios.post(`${API_BASE}/stop/${sessionId}`);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || 'Failed to stop command');
  }
}

module.exports = {
  executeCommand,
  executeCommandInSession,
  getCommandOutput,
  stopCommand
};