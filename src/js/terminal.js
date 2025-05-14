/**
 * Terminal functionality for MCP Server with multi-tab support
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Global variables
  const terminals = {};
  let activeTerminalId = null;
  let contextMenuVisible = false;
  let menuVisible = false;
  let selectedMenu = null;
  
  // Terminal themes
  const themes = {
    dark: {
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
    light: {
      background: '#ffffff',
      foreground: '#333333',
      black: '#000000',
      red: '#c0392b',
      green: '#27ae60',
      yellow: '#f39c12',
      blue: '#2980b9',
      magenta: '#8e44ad',
      cyan: '#16a085',
      white: '#bdc3c7',
      brightBlack: '#7f8c8d',
      brightRed: '#e74c3c',
      brightGreen: '#2ecc71',
      brightYellow: '#f1c40f',
      brightBlue: '#3498db',
      brightMagenta: '#9b59b6',
      brightCyan: '#1abc9c',
      brightWhite: '#ecf0f1'
    }
  };
  
  // Initialize event listeners
  function initEventListeners() {
    // Window control buttons
    document.getElementById('minimize-btn').addEventListener('click', () => {
      window.api.minimizeWindow();
    });
    
    document.getElementById('maximize-btn').addEventListener('click', () => {
      window.api.maximizeWindow();
    });
    
    document.getElementById('close-btn').addEventListener('click', () => {
      window.api.closeWindow();
    });
    
    // New tab buttons
    document.getElementById('new-tab-btn').addEventListener('click', createNewTerminal);
    document.getElementById('new-tab-button').addEventListener('click', createNewTerminal);
    
    // Clear button
    document.getElementById('clear-btn').addEventListener('click', () => {
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].term.clear();
      }
    });
    
    // Send output button
    document.getElementById('send-output-btn').addEventListener('click', () => {
      sendCurrentOutput();
    });
    
    // Menu items
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const menuName = e.target.dataset.menu;
        toggleMenu(menuName);
      });
    });
    
    // Menu actions
    document.getElementById('menu-new-tab')?.addEventListener('click', () => {
      hideAllMenus();
      createNewTerminal();
    });
    
    document.getElementById('menu-clear')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].term.clear();
      }
    });
    
    document.getElementById('menu-send-output')?.addEventListener('click', () => {
      hideAllMenus();
      sendCurrentOutput();
    });
    
    document.getElementById('menu-next-tab')?.addEventListener('click', () => {
      hideAllMenus();
      navigateToNextTab();
    });
    
    document.getElementById('menu-prev-tab')?.addEventListener('click', () => {
      hideAllMenus();
      navigateToPreviousTab();
    });
    
    // Hide menus when clicking elsewhere
    document.addEventListener('click', (e) => {
      // Don't hide if clicking on a menu item
      if (e.target.closest('.menu-item') || e.target.closest('.dropdown-menu')) {
        return;
      }
      
      hideAllMenus();
    });
    
    // Initialize context menu
    initContextMenu();
    
    // Window resize event
    window.addEventListener('resize', () => {
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].fitAddon.fit();
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+T (New Tab)
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        createNewTerminal();
      }
      
      // Ctrl+Tab (Next Tab)
      else if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        navigateToNextTab();
      }
      
      // Ctrl+Shift+Tab (Previous Tab)
      else if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        navigateToPreviousTab();
      }
      
      // Ctrl+C (Copy)
      else if (e.ctrlKey && e.key === 'c') {
        if (activeTerminalId && terminals[activeTerminalId] && terminals[activeTerminalId].term.hasSelection()) {
          e.preventDefault();
          navigator.clipboard.writeText(terminals[activeTerminalId].term.getSelection());
        }
      }
      
      // Ctrl+V (Paste)
      else if (e.ctrlKey && e.key === 'v') {
        if (activeTerminalId && terminals[activeTerminalId]) {
          navigator.clipboard.readText().then(text => {
            window.api.sendTerminalInput(activeTerminalId, text);
          });
        }
      }
      
      // Ctrl+K (Clear)
      else if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (activeTerminalId && terminals[activeTerminalId]) {
          terminals[activeTerminalId].term.clear();
        }
      }
    });
    
    // Receive terminal data from main process
    window.api.onTerminalData((data) => {
      // If data doesn't have sessionId, assume it's for the active terminal
      const sessionId = data.sessionId || activeTerminalId;
      
      if (terminals[sessionId]) {
        terminals[sessionId].term.write(data.data || data);
      }
    });
    
    // Terminal exit event
    window.api.onTerminalExit((data) => {
      const sessionId = data.sessionId || activeTerminalId;
      const exitCode = data.exitCode || data;
      
      if (terminals[sessionId]) {
        terminals[sessionId].term.write(`\r\n\r\nProcess exited with code ${exitCode}\r\n`);
        terminals[sessionId].exited = true;
        updateTabTitle(sessionId, 'Terminal (Closed)');
      }
    });
    
    // Session ID event
    window.api.onSessionId((sessionId) => {
      if (!terminals[sessionId]) {
        // If this is a new session ID, create a terminal for it
        createTerminalForSession(sessionId);
      } else {
        // Update the terminal info
        updateTerminalInfo(sessionId);
      }
    });
  }
  
  // Initialize context menu
  function initContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    
    // Show context menu on right-click in terminal container
    document.getElementById('terminals-container').addEventListener('contextmenu', (e) => {
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
          if (activeTerminalId && terminals[activeTerminalId] && terminals[activeTerminalId].term.hasSelection()) {
            navigator.clipboard.writeText(terminals[activeTerminalId].term.getSelection());
          }
          break;
        
        case 'paste':
          if (activeTerminalId && terminals[activeTerminalId]) {
            navigator.clipboard.readText().then(text => {
              window.api.sendTerminalInput(activeTerminalId, text);
            });
          }
          break;
        
        case 'clear':
          if (activeTerminalId && terminals[activeTerminalId]) {
            terminals[activeTerminalId].term.clear();
          }
          break;
        
        case 'send-output':
          sendCurrentOutput();
          break;
        
        case 'new-tab':
          createNewTerminal();
          break;
      }
      
      // Hide the menu
      contextMenu.classList.remove('show');
      contextMenuVisible = false;
    });
  }
  
  // Toggle menu visibility
  function toggleMenu(menuName) {
    const menu = document.getElementById(`${menuName}-menu`);
    if (!menu) return;
    
    // If this menu is already open, close it
    if (menuVisible && selectedMenu === menuName) {
      menu.classList.remove('show');
      menuVisible = false;
      selectedMenu = null;
      return;
    }
    
    // Close any open menu
    hideAllMenus();
    
    // Position the menu
    const menuItem = document.querySelector(`.menu-item[data-menu="${menuName}"]`);
    if (menuItem) {
      const rect = menuItem.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom}px`;
    }
    
    // Show the menu
    menu.classList.add('show');
    menuVisible = true;
    selectedMenu = menuName;
  }
  
  // Hide all dropdown menus
  function hideAllMenus() {
    const menus = document.querySelectorAll('.dropdown-menu');
    menus.forEach(menu => {
      menu.classList.remove('show');
    });
    menuVisible = false;
    selectedMenu = null;
  }
  
  // Create a new terminal tab
  function createNewTerminal() {
    // Request a new terminal from the main process
    window.api.createTerminal().then(sessionId => {
      // Create terminal for this session ID
      createTerminalForSession(sessionId);
    });
  }
  
  // Create a terminal for a session ID
  function createTerminalForSession(sessionId) {
    // Skip if this terminal already exists
    if (terminals[sessionId]) return;
    
    // Create a terminal container
    const terminalContainer = document.createElement('div');
    terminalContainer.id = `terminal-${sessionId}`;
    terminalContainer.className = 'terminal-instance';
    document.getElementById('terminals-container').appendChild(terminalContainer);
    
    // Create the xterm.js instance
    const term = new Terminal({
      fontFamily: 'Consolas, monospace',
      fontSize: 14,
      cursorStyle: 'block',
      cursorBlink: true,
      theme: themes.dark,
      scrollback: 1000,
      allowTransparency: true,
      convertEol: true,
      disableStdin: false
    });
    
    // Create addons
    const fitAddon = new FitAddon.FitAddon();
    const searchAddon = new SearchAddon.SearchAddon();
    const webLinksAddon = new WebLinksAddon.WebLinksAddon();
    const serializeAddon = new SerializeAddon.SerializeAddon();
    
    // Load addons
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(serializeAddon);
    
    // Open the terminal
    term.open(terminalContainer);
    
    // Store terminal info
    terminals[sessionId] = {
      term,
      fitAddon,
      searchAddon,
      serializeAddon,
      container: terminalContainer,
      sessionId,
      title: 'Terminal',
      exited: false
    };
    
    // Set up terminal events
    term.onData(data => {
      window.api.sendTerminalInput(sessionId, data);
    });
    
    term.onResize(({ cols, rows }) => {
      window.api.resizeTerminal(sessionId, cols, rows);
      
      if (sessionId === activeTerminalId) {
        document.getElementById('terminal-size').textContent = `${cols}×${rows}`;
      }
    });
    
    // Create a tab for this terminal
    createTab(sessionId);
    
    // Set as active terminal
    setActiveTerminal(sessionId);
    
    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      window.api.resizeTerminal(sessionId, cols, rows);
      
      if (sessionId === activeTerminalId) {
        document.getElementById('terminal-size').textContent = `${cols}×${rows}`;
      }
    }, 100);
    
    return terminals[sessionId];
  }
  
  // Create a tab for a terminal
  function createTab(sessionId) {
    const tabsContainer = document.getElementById('tabs');
    const newTabButton = document.getElementById('new-tab-button');
    
    // Create the tab
    const tab = document.createElement('div');
    tab.id = `tab-${sessionId}`;
    tab.className = 'tab';
    tab.dataset.sessionId = sessionId;
    tab.innerHTML = `
      <span class="tab-title">Terminal</span>
      <span class="tab-close">×</span>
    `;
    
    // Insert before the new tab button
    tabsContainer.insertBefore(tab, newTabButton);
    
    // Add click events
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        closeTerminal(sessionId);
      } else {
        setActiveTerminal(sessionId);
      }
    });
    
    return tab;
  }
  
  // Update a tab's title
  function updateTabTitle(sessionId, title) {
    const tab = document.getElementById(`tab-${sessionId}`);
    if (tab) {
      const titleElement = tab.querySelector('.tab-title');
      if (titleElement) {
        titleElement.textContent = title;
      }
    }
    
    // Update the stored title
    if (terminals[sessionId]) {
      terminals[sessionId].title = title;
    }
  }
  
  // Set the active terminal
  function setActiveTerminal(sessionId) {
    if (!terminals[sessionId]) return;
    
    // Deactivate current terminal
    if (activeTerminalId && terminals[activeTerminalId]) {
      terminals[activeTerminalId].container.classList.remove('active');
      
      const currentTab = document.getElementById(`tab-${activeTerminalId}`);
      if (currentTab) {
        currentTab.classList.remove('active');
      }
    }
    
    // Activate new terminal
    activeTerminalId = sessionId;
    terminals[sessionId].container.classList.add('active');
    
    const tab = document.getElementById(`tab-${sessionId}`);
    if (tab) {
      tab.classList.add('active');
      
      // Ensure the tab is visible by scrolling if necessary
      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    
    // Update status bar
    updateTerminalInfo(sessionId);
    
    // Focus the terminal
    terminals[sessionId].term.focus();
    
    // Fit the terminal
    terminals[sessionId].fitAddon.fit();
  }
  
  // Update terminal information in the status bar
  function updateTerminalInfo(sessionId) {
    if (sessionId === activeTerminalId) {
      document.getElementById('terminal-info').textContent = `Session ID: ${sessionId}`;
      
      const { cols, rows } = terminals[sessionId].term;
      document.getElementById('terminal-size').textContent = `${cols}×${rows}`;
    }
  }
  
  // Close a terminal
  function closeTerminal(sessionId) {
    if (!terminals[sessionId]) return;
    
    // Remove the terminal container
    terminals[sessionId].container.remove();
    
    // Remove the tab
    const tab = document.getElementById(`tab-${sessionId}`);
    if (tab) {
      tab.remove();
    }
    
    // Clean up
    terminals[sessionId].term.dispose();
    delete terminals[sessionId];
    
    // If this was the active terminal, activate another one
    if (activeTerminalId === sessionId) {
      const remainingIds = Object.keys(terminals);
      if (remainingIds.length > 0) {
        setActiveTerminal(remainingIds[0]);
      } else {
        // No terminals left, create a new one
        createNewTerminal();
      }
    }
  }
  
  // Navigate to the next tab
  function navigateToNextTab() {
    const sessionIds = Object.keys(terminals);
    if (sessionIds.length <= 1) return;
    
    const currentIndex = sessionIds.indexOf(activeTerminalId);
    const nextIndex = (currentIndex + 1) % sessionIds.length;
    setActiveTerminal(sessionIds[nextIndex]);
  }
  
  // Navigate to the previous tab
  function navigateToPreviousTab() {
    const sessionIds = Object.keys(terminals);
    if (sessionIds.length <= 1) return;
    
    const currentIndex = sessionIds.indexOf(activeTerminalId);
    const prevIndex = (currentIndex - 1 + sessionIds.length) % sessionIds.length;
    setActiveTerminal(sessionIds[prevIndex]);
  }
  
  // Send current terminal output to main process
  function sendCurrentOutput() {
    if (!activeTerminalId || !terminals[activeTerminalId]) return;
    
    // Get terminal content
    const output = terminals[activeTerminalId].serializeAddon.serialize();
    
    // Send to main process
    window.api.sendCurrentOutput(activeTerminalId, output);
    
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
  
  // Initialize the application
  function init() {
    // Set up event listeners
    initEventListeners();
    
    // Create initial terminal
    createNewTerminal();
  }
  
  // Start the app
  init();
});
