# MCP Terminal with xterm Integration

This project combines the Model Context Protocol (MCP) Server with a modern terminal interface based on xterm.js. It provides a streamlined interface for executing commands and interacting with the terminal through both an API and a graphical interface.

## Features

- Modern terminal interface using xterm.js
- Support for MCP (Model Context Protocol) for LLM integration
- Early output feedback mechanism for responsive interactions
- Cross-platform support (Windows, macOS, Linux)
- IPC-based communication between the renderer and main processes
- API endpoints for programmatic access

## Installation

1. Clone the repository
2. Install dependencies:
```
npm install
```
3. Start the application:
```
npm start
```

## Usage

### Terminal Window

The terminal window provides a fully functional terminal interface with the following features:

- Execute commands directly in the terminal
- Copy/paste support
- Clear terminal with the clear button or context menu
- Send current output early with the "Send Output" button
- Window controls (minimize, maximize, close)

### Context Menu

Right-click in the terminal to access the context menu with the following options:

- Copy: Copy selected text
- Paste: Paste from clipboard
- Clear: Clear the terminal
- Send Output Now: Send the current terminal output back to the MCP client

### Early Output

The terminal supports sending early output back to the MCP client before a command completes. This is useful for long-running commands where you want to get intermediate results.

### API Endpoints

The following API endpoints are available:

- `POST /execute` - Execute a command in a new terminal session
- `POST /execute/:sessionId` - Execute a command in an existing session
- `GET /output/:sessionId` - Get the output of a command
- `POST /stop/:sessionId` - Stop a command
- `GET /sessions` - List all active sessions

## MCP Integration

This terminal supports the Model Context Protocol (MCP) for integration with Large Language Models. The MCP server runs alongside the terminal and provides a standardized interface for LLMs to interact with the terminal.

## Architecture

The application is built with Electron and consists of the following components:

- Main Process: Handles the core application logic, API server, and terminal sessions
- Renderer Process: Handles the terminal UI and user interactions
- MCP Server: Provides an interface for LLMs to interact with the terminal
- API Server: Provides HTTP endpoints for programmatic access

## Development

To modify the terminal layout:

1. Edit `terminal.html` for HTML structure
2. Edit `src/css/terminal.css` for styling
3. Edit `src/js/terminal.js` for terminal functionality

To modify the application behavior:

1. Edit `main.js` for main process logic
2. Edit `preload.js` for preload script
3. Edit `mcp-server.js` and `mcp-handler.js` for MCP integration
4. Edit `llm-client.js` for API client logic
