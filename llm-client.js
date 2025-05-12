import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000'; // Assuming API server runs locally

export async function executeCommand(command) {
  try {
    const response = await axios.post(`${API_BASE_URL}/execute`, { command });
    return response.data;
  } catch (error) {
    console.error(`Error in executeCommand: ${error.message}`);
    throw error; // Re-throw the error to be handled by the caller
  }
}

export async function executeCommandInSession(sessionId, command) {
  try {
    const response = await axios.post(`${API_BASE_URL}/execute/${sessionId}`, { command });
    return response.data;
  } catch (error) {
    console.error(`Error in executeCommandInSession (session ${sessionId}): ${error.message}`);
    // Check if the error is a 404 (Session not found) and handle appropriately if needed
    if (error.response && error.response.status === 404) {
       console.warn(`Session ${sessionId} not found or inactive.`);
       // Optionally, throw a specific error or return a specific structure
    }
    throw error;
  }
}

export async function getCommandOutput(sessionId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/output/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error(`Error in getCommandOutput (session ${sessionId}): ${error.message}`);
    throw error;
  }
}

export async function stopCommand(sessionId) {
  try {
    const response = await axios.post(`${API_BASE_URL}/stop/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error(`Error in stopCommand (session ${sessionId}): ${error.message}`);
    throw error;
  }
}