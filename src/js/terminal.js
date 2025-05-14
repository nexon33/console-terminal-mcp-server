/**
 * Terminal functionality for MCP Server
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Variables
  let sessionId = null;
  let term = null;
  let fitAddon = null;
  let searchAddon = null;
  let webLinksAddon = null;
  let serializeAddon = null;
  let contextMenuVisible = false;
  let contextMenu = null;
  
  // Initialize the terminal
  function initTerminal() {
    // Create terminal
    term = new Terminal({
      fontFamily: 'Consolas, monospace',
      fontSize: 14,
      cursorStyle: 'block',
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#f0f0f0',
        black: '#000000',
        red: '#e74c3c',
        green: '#2ecc71',
        yellow: '#f1c40f',
        blue: '#3498db',
        magenta: '#9b59b6',
        cyan: '#1abc9c',
        white: '#ecf0f1',
        brightBlack: '#95a5a6',
        brightRed: '#e74c3c',
        brightGreen: '#2ecc71',
        brightYellow: '#f1c40f',
        brightBlue: '#3498db',
        brightMagenta: '#9b59b6',
        brightCyan: '#1abc9c',
        brightWhite: '#ffffff'
      },
      scrollback: 1000,
      allowTransparency: true,
      convertEol: true,
      disableStdin: false
    });
    
    // Create addons
    fitAddon = new FitAddon.FitAddon();
    searchAddon = new SearchAddon.SearchAddon();
    webLinksAddon = new WebLinksAddon.WebLinksAddon();
    serializeAddon = new SerializeAddon.SerializeAddon();
    
    // Load addons
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(serializeAddon);
    
    // Open the terminal
    term.open(document.getElementById('terminal-container'));
    
    // Set up terminal events
    term.onData(data => {
      if (sessionId) {
        window.api.sendTerminalInput(sessionId, data);
      }
    });
    
    term.onResize(({ cols, rows }) => {
      if (sessionId) {
        window.api.resizeTerminal(sessionId, cols, rows);
      }
      document.getElementById('terminal-size').textContent = `${cols}×${rows}`;
    });
    
    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      if (sessionId) {
        window.api.resizeTerminal(sessionId, cols, rows);
      }
      document.getElementById('terminal-size').textContent = `${cols}×${rows}`;
    }, 100);
    
    // Focus terminal
    term.focus();
  }
  
  // Initialize context menu
  function initContextMenu() {
    contextMenu = document.getElementById('context-menu');
    
    // Show context menu on right-click
    document.getElementById('terminal-container').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      
      // Position the menu
      contextMenu.style.left = `${e.pageX}px`;
      contextMenu.style.top = `${e.pageY}px`;
      
      // Show the menu
      contextMenu.classList.add('show');
      contextMenuVisible = true;
    });
    
    // Hide context menu on click outside
    document.addEventListener('click', () => {
      if (contextMenuVisible) {
        contextMenu.classList.remove('show');
        contextMenuVisible = false;
      }
    });
    
    // Handle context menu actions
    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.context-menu-item')?.dataset.action;
      if (!action) return;
      
      switch (action) {
        case 'copy':
          if (term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection());
          }
          break;
        
        case 'paste':
          navigator.clipboard.readText().then(text => {
            if (sessionId && text) {
              window.api.sendTerminalInput(sessionId, text);
            }
          });
          break;
        
        case 'clear':
          term.clear();
          break;
        
        case 'send-output':
          sendCurrentOutput();
          break;
      }
      
      // Hide the menu
      contextMenu.classList.remove('show');
      contextMenuVisible = false;
    });
  }
  
  // Initialize window controls
  function initWindowControls() {
    // Minimize
    document.getElementById('minimize-btn').addEventListener('click', () => {
      window.api.minimizeWindow();
    });
    
    // Maximize
    document.getElementById('maximize-btn').addEventListener('click', () => {
      window.api.maximizeWindow();
    });
    
    // Close
    document.getElementById('close-btn').addEventListener('click', () => {
      window.api.closeWindow();
    });
    
    // Clear
    document.getElementById('clear-btn').addEventListener('click', () => {
      term.clear();
    });
    
    // Send Output
    document.getElementById('send-output-btn').addEventListener('click', () => {
      sendCurrentOutput();
    });
  }
  
  // Send current terminal output to main process
  function sendCurrentOutput() {
    if (!sessionId || !term) return;
    
    // Get the current content
    const serializedContent = serializeAddon.serialize();
    
    // Send to main process
    window.api.sendCurrentOutput(sessionId, serializedContent);
    
    // Visual feedback
    const feedbackElement = document.createElement('div');
    feedbackElement.textContent = '✓ Output sent';
    feedbackElement.style.position = 'absolute';
    feedbackElement.style.left = '50%';
    feedbackElement.style.top = '50%';
    feedbackElement.style.transform = 'translate(-50%, -50%)';
    feedbackElement.style.backgroundColor = 'rgba(0, 128, 0, 0.8)';
    feedbackElement.style.color = 'white';
    feedbackElement.style.padding = '10px 20px';
    feedbackElement.style.borderRadius = '5px';
    feedbackElement.style.zIndex = '1000';
    document.body.appendChild(feedbackElement);
    
    // Remove after a delay
    setTimeout(() => {
      feedbackElement.style.opacity = '0';
      feedbackElement.style.transition = 'opacity 0.5s';
      setTimeout(() => {
        document.body.removeChild(feedbackElement);
      }, 500);
    }, 1500);
  }
  
  // Initialize event listeners from main process
  function initEventListeners() {
    // Terminal data
    window.api.onTerminalData((data) => {
      term.write(data);
    });
    
    // Terminal exit
    window.api.onTerminalExit((exitCode) => {
      term.write(`\r\n\r\nProcess exited with code ${exitCode}\r\n`);
    });
    
    // Session ID
    window.api.onSessionId((sid) => {
      sessionId = sid;
      document.getElementById('session-id').textContent = `Session ID: ${sid}`;
    });
    
    // Window resize event
    window.addEventListener('resize', () => {
      if (fitAddon) {
        fitAddon.fit();
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+C (Copy)
      if (e.ctrlKey && e.key === 'c') {
        if (term.hasSelection()) {
          e.preventDefault();
          navigator.clipboard.writeText(term.getSelection());
        }
      }
      
      // Ctrl+V (Paste)
      else if (e.ctrlKey && e.key === 'v') {
        navigator.clipboard.readText().then(text => {
          if (sessionId && text) {
            window.api.sendTerminalInput(sessionId, text);
          }
        });
      }
      
      // Ctrl+K (Clear)
      else if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        term.clear();
      }
    });
  }
  
  // Initialize everything
  function init() {
    initTerminal();
    initContextMenu();
    initWindowControls();
    initEventListeners();
  }
  
  // Start initialization
  init();
});
