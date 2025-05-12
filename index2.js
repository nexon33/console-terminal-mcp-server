import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "child_process";
import { spawn } from "child_process";
import fs from "fs";
import WebSocket from "ws";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ELECTRON_PATH = path.join(__dirname, 'node_modules', 'electron', 'cli.js');
const LOCK_FILE = path.join(process.env.APPDATA || process.env.HOME, ".electron-gui-port.lock");

function ensureElectronGui(cb) {
  let port = null;
  if (fs.existsSync(LOCK_FILE)) {
    port = parseInt(fs.readFileSync(LOCK_FILE, "utf8"), 10);
    cb(port);
  } else {
    // Launch Electron using the local package
    const electronProc = spawn(process.execPath, [ELECTRON_PATH, path.join(__dirname, 'electron-main.js')], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
    });
    electronProc.unref();
    // Wait for lock file to appear
    const check = setInterval(() => {
      if (fs.existsSync(LOCK_FILE)) {
        port = parseInt(fs.readFileSync(LOCK_FILE, "utf8"), 10);
        clearInterval(check);
        cb(port);
      }
    }, 200);
  }
}

const server = new McpServer({ name: "Electron Terminal", version: "1.0.0" });

server.tool(
  "terminal_execute",
  { command: z.string(), sessionId: z.string().optional() },
  async ({ command, sessionId }) => {
    // Execute command and get output
    const output = await new Promise((resolve) => {
      exec(command, (error, stdout, stderr) => {
        resolve({
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error ? error.code : 0
        });
      });
    });

    // Generate session ID and show GUI
    const sid = sessionId || `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Create GUI window
    await new Promise((resolve, reject) => {
      ensureElectronGui((port) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on("open", () => {
          ws.send(JSON.stringify({ command, sessionId: sid }));
          resolve();
        });
        ws.on("error", reject);
      });
    });

    // Return both output and window creation confirmation
    return {
      content: [
        { type: "text", text: output.stdout },
        ...(output.stderr ? [{ type: "text", text: output.stderr }] : [])
      ],
      sessionId: sid,
      exitCode: output.exitCode
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
