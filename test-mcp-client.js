const net = require('net');

const MCP_PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 4321;

const client = net.createConnection({ port: MCP_PORT }, () => {
  console.log('Connected to MCP server on port', MCP_PORT);

  // Send initialize message
  const initMsg = {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    },
    id: 1
  };

  client.write(JSON.stringify(initMsg) + '\n');
});

let sessionIds = [];

client.on('data', (data) => {
  const responseText = data.toString();
  console.log('Received from server:', responseText);

  try {
    const response = JSON.parse(responseText);

    // After initialization, send two concurrent terminal/execute requests
    if (response.id === 1 && !response.error) {
      console.log('Initialization successful, sending two concurrent commands...');
      setTimeout(() => {
        // Command 1: new session
        const cmdMsg1 = {
          jsonrpc: "2.0",
          method: "terminal/execute",
          params: { command: "dir" },
          id: 2
        };
        client.write(JSON.stringify(cmdMsg1) + '\n');

        // Command 2: new session
        const cmdMsg2 = {
          jsonrpc: "2.0",
          method: "terminal/execute",
          params: { command: "echo Session 2" },
          id: 3
        };
        client.write(JSON.stringify(cmdMsg2) + '\n');
      }, 1000);
    }

    // Track session IDs for each response
    if ((response.id === 2 || response.id === 3) && !response.error && response.result && response.result.sessionId) {
      sessionIds[response.id] = response.result.sessionId;
      console.log(`Session created with ID: ${response.result.sessionId} for request ${response.id}`);

      // Send a follow-up command in each session
      setTimeout(() => {
        const followupCmd = {
          jsonrpc: "2.0",
          method: "terminal/execute",
          params: {
            command: `echo Follow-up for session ${response.result.sessionId}`,
            sessionId: response.result.sessionId
          },
          id: response.id + 10 // Unique ID for follow-up
        };
        client.write(JSON.stringify(followupCmd) + '\n');
      }, 2000 * response.id); // stagger follow-ups
    }
  } catch (e) {
    console.error('Error parsing server response:', e);
  }
});

client.on('end', () => {
  console.log('Disconnected from server');
});

client.on('error', (err) => {
  console.error('Connection error:', err);
});