import logger from './logger.js';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000'; // Assuming API server runs locally

/**
 * Execute a command through the API
 * @param {string} command - The command to execute
 * @returns {Promise<Object>} - Command result 
 */
export async function executeCommand(command) {
  try {
    // Use IPC for direct communication with the main process if available
    // For now, we're using the API as a fallback
    const response = await axios.post(`${API_BASE_URL}/execute`, { command });
    return response.data;
  } catch (error) {
    logger.error(`Error in executeCommand: ${error.message}`);
    throw error; // Re-throw the error to be handled by the caller
  }
}

/**
 * Execute a command in an existing session
 * @param {string} sessionId - The session ID
 * @param {string} command - The command to execute
 * @returns {Promise<Object>} - Command result
 */
export async function executeCommandInSession(sessionId, command) {
  try {
    // Use IPC for direct communication if available
    // For now, we're using the API as a fallback
    const response = await axios.post(`${API_BASE_URL}/execute/${sessionId}`, { command });
    return response.data;
  } catch (error) {
    logger.error(`Error in executeCommandInSession (session ${sessionId}): ${error.message}`);
    // Check if the error is a 404 (Session not found) and handle appropriately if needed
    if (error.response && error.response.status === 404) {
       logger.warn(`Session ${sessionId} not found or inactive.`);
       // Optionally, throw a specific error or return a specific structure
    }
    throw error;
  }
}

/**
 * Get command output from a session
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} - Command output
 */
export async function getCommandOutput(sessionId) {
  try {
    // Use IPC for direct communication if available
    // For now, we're using the API as a fallback
    const response = await axios.get(`${API_BASE_URL}/output/${sessionId}`);
    return response.data;
  } catch (error) {
    logger.error(`Error in getCommandOutput (session ${sessionId}): ${error.message}`);
    throw error;
  }
}

/**
 * Stop a command in a session
 * @param {string} sessionId - The session ID
 * @returns {Promise<Object>} - Stop result
 */
export async function stopCommand(sessionId) {
  try {
    // Use IPC for direct communication if available
    // For now, we're using the API as a fallback
    const response = await axios.post(`${API_BASE_URL}/stop/${sessionId}`);
    return response.data;
  } catch (error) {
    logger.error(`Error in stopCommand (session ${sessionId}): ${error.message}`);
    throw error;
  }
}