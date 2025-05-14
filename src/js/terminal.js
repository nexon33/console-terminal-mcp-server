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
  let submenuVisible = false;
  let selectedSubmenu = null;
  let currentFontSize = 14;
  
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
    // Window control buttons for frameless window 
    document.getElementById('minimize-btn').addEventListener('click', () => {
      window.api.minimizeWindow();
    });
    
    document.getElementById('maximize-btn').addEventListener('click', () => {
      window.api.maximizeWindow();
      // Update maximize button icon based on window state
      updateMaximizeButtonState();
    });
    
    document.getElementById('close-btn').addEventListener('click', () => {
      window.api.closeWindow();
    });
    
    // Register for alt-key-pressed messages from main process
    window.api.onAltKeyPressed && window.api.onAltKeyPressed(() => {
      // Handle Alt key press to toggle menu visibility
      toggleFirstMenu();
    });
    
    // Tab control buttons
    document.getElementById('new-tab-btn').addEventListener('click', createNewTerminal);
    document.getElementById('new-tab-button').addEventListener('click', createNewTerminal);
    document.getElementById('trash-btn')?.addEventListener('click', () => {
      if (activeTerminalId) {
        closeTerminal(activeTerminalId);
      }
    });
    document.getElementById('next-tab-btn')?.addEventListener('click', navigateToNextTab);
    
    // Menu items
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const menuName = e.target.dataset.menu;
        toggleMenu(menuName);
      });
    });
    
    // Initialize menu actions
    initMenuActions();
    
    // Hide menus when clicking elsewhere
    document.addEventListener('click', (e) => {
      // Don't hide if clicking on a menu item or dropdown menu
      if (e.target.closest('.menu-item') || e.target.closest('.dropdown-menu')) {
        return;
      }
      
      hideAllMenus();
    });
    
    // Submenu triggers
    document.querySelectorAll('.submenu-trigger').forEach(trigger => {
      trigger.addEventListener('mouseenter', (e) => {
        const submenuName = e.target.dataset.submenu;
        showSubmenu(submenuName, e.target);
      });
    });
    
    // Initialize context menu
    initContextMenu();
    
    // Initialize search panel
    initSearchPanel();
    
    // Window resize event
    window.addEventListener('resize', () => {
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].fitAddon.fit();
      }
      updateMaximizeButtonState();
    });
    
    // Keyboard shortcuts
    initKeyboardShortcuts();
    
    // Terminal events from main process
    initTerminalEvents();
  }

  // Update maximize button icon based on window state
  function updateMaximizeButtonState() {
    // We'll use a message to main process to get the current state
    // For now, just update the button title
    const maximizeButton = document.getElementById('maximize-btn');
    if (maximizeButton) {
      // We don't have direct access to window state, this would need IPC
      // This is a placeholder - we would ideally get state from main process
      maximizeButton.title = "Toggle Maximize"; 
    }
  }
  
  // Toggle the first menu in response to Alt key
  function toggleFirstMenu() {
    const firstMenuItem = document.querySelector('.menu-item');
    if (firstMenuItem && firstMenuItem.dataset.menu) {
      if (menuVisible) {
        hideAllMenus();
      } else {
        toggleMenu(firstMenuItem.dataset.menu);
      }
    }
  }

  // Initialize menu actions
  function initMenuActions() {
    // MCP Menu
    document.getElementById('menu-new-window')?.addEventListener('click', () => {
      hideAllMenus();
      window.api.createWindow();
    });
    
    document.getElementById('menu-settings')?.addEventListener('click', () => {
      hideAllMenus();
      // TODO: Show settings
    });
    
    document.getElementById('menu-exit')?.addEventListener('click', () => {
      hideAllMenus();
      window.api.quit();
    });
    
    // Terminal Menu
    document.getElementById('menu-new-tab')?.addEventListener('click', () => {
      hideAllMenus();
      createNewTerminal();
    });
    
    document.getElementById('menu-close-tab')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId) {
        closeTerminal(activeTerminalId);
      }
    });
    
    document.getElementById('menu-clear')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].term.clear();
      }
    });
    
    document.getElementById('menu-reset')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].term.reset();
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
    
    // Edit Menu
    document.getElementById('menu-copy')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId && terminals[activeTerminalId] && terminals[activeTerminalId].term.hasSelection()) {
        navigator.clipboard.writeText(terminals[activeTerminalId].term.getSelection());
      }
    });
    
    document.getElementById('menu-paste')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId && terminals[activeTerminalId]) {
        navigator.clipboard.readText().then(text => {
          window.api.sendTerminalInput(activeTerminalId, text);
        });
      }
    });
    
    document.getElementById('menu-select-all')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].term.selectAll();
      }
    });
    
    document.getElementById('menu-find')?.addEventListener('click', () => {
      hideAllMenus();
      showSearchPanel();
    });
    
    // View Menu
    document.getElementById('menu-toggle-theme')?.addEventListener('click', () => {
      hideAllMenus();
      toggleTheme();
    });
    
    document.getElementById('menu-increase-font')?.addEventListener('click', () => {
      hideAllMenus();
      changeFontSize(1);
    });
    
    document.getElementById('menu-decrease-font')?.addEventListener('click', () => {
      hideAllMenus();
      changeFontSize(-1);
    });
    
    document.getElementById('menu-toggle-menu-bar')?.addEventListener('click', () => {
      hideAllMenus();
      toggleMenuBar();
    });
    
    // Window Menu
    document.getElementById('menu-fullscreen')?.addEventListener('click', () => {
      hideAllMenus();
      window.api.toggleFullscreen();
    });
    
    // Developer Tools Menu
    document.getElementById('menu-toggle-dev-tools')?.addEventListener('click', () => {
      hideAllMenus();
      window.api.toggleDevTools();
    });
    
    document.getElementById('menu-reload')?.addEventListener('click', () => {
      hideAllMenus();
      window.api.reloadWindow();
    });
    
    document.getElementById('menu-force-reload')?.addEventListener('click', () => {
      hideAllMenus();
      window.api.forceReload();
    });
    
    // Help Menu
    document.getElementById('menu-keyboard-shortcuts')?.addEventListener('click', () => {
      hideAllMenus();
      // TODO: Show keyboard shortcuts
    });
    
    document.getElementById('menu-about')?.addEventListener('click', () => {
      hideAllMenus();
      // TODO: Show about dialog
    });
  }
  
  // Initialize keyboard shortcuts
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+N (New Window)
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        window.api.createWindow();
      }
      
      // Ctrl+Shift+T (New Tab)
      else if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        createNewTerminal();
      }
      
      // Ctrl+W (Close Tab)
      else if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTerminalId) {
          closeTerminal(activeTerminalId);
        }
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
      
      // Ctrl+A (Select All)
      else if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        if (activeTerminalId && terminals[activeTerminalId]) {
          terminals[activeTerminalId].term.selectAll();
        }
      }
      
      // Ctrl+F (Find)
      else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        showSearchPanel();
      }
      
      // Ctrl+K (Clear)
      else if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (activeTerminalId && terminals[activeTerminalId]) {
          terminals[activeTerminalId].term.clear();
        }
      }
      
      // Ctrl++ (Increase Font)
      else if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        changeFontSize(1);
      }
      
      // Ctrl+- (Decrease Font)
      else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        changeFontSize(-1);
      }
      
      // F11 (Fullscreen)
      else if (e.key === 'F11') {
        e.preventDefault();
        window.api.toggleFullscreen();
      }
      
      // F12 (Developer Tools)
      else if (e.key === 'F12') {
        e.preventDefault();
        window.api.toggleDevTools();
      }
      
      // Alt (Toggle Menu Bar)
      else if (e.key === 'Alt') {
        e.preventDefault();
        toggleMenuBar();
      }
      
      // ESC (Close Menus/Search)
      else if (e.key === 'Escape') {
        if (menuVisible) {
          e.preventDefault();
          hideAllMenus();
        }
        
        const searchPanel = document.getElementById('search-panel');
        if (searchPanel && searchPanel.classList.contains('show')) {
          e.preventDefault();
          searchPanel.classList.remove('show');
        }
      }
    });
  }
  
  // Initialize terminal events from main process
  function initTerminalEvents() {
    // Terminal data event
    window.api.onTerminalData(({ sessionId, data }) => {
      if (terminals[sessionId]) {
        terminals[sessionId].term.write(data);
        
        // Update terminal info if this is the active terminal
        if (sessionId === activeTerminalId) {
          updateTerminalInfo(sessionId);
        }
      }
    });
    
    // Terminal exit event
    window.api.onTerminalExit(({ sessionId, exitCode }) => {
      if (terminals[sessionId]) {
        // Update terminal status
        terminals[sessionId].exitCode = exitCode;
        
        // Update UI to indicate terminal has exited
        updateTabTitle(sessionId, terminals[sessionId].title + " [Exited]");
      }
    });
    
    // Session ID event (triggered by MCP when a session is created via API)
    window.api.onSessionId((sessionId) => {
      // Check if this session already exists
      if (!terminals[sessionId]) {
        createTerminalForSession(sessionId);
      }
      
      // Set this as the active terminal
      setActiveTerminal(sessionId);
    });
    
    // Terminal close response event
    window.api.onTerminalCloseResponse(({ sessionId, success, error }) => {
      if (!success) {
        console.warn(`Failed to close terminal session ${sessionId}:`, error);
      }
      
      // Ensure the terminal UI is removed regardless of main process success
      if (terminals[sessionId]) {
        try {
          // If the terminal tab is still in the UI, remove it
          const container = terminals[sessionId].container;
          if (container && container.parentNode) {
            container.parentNode.removeChild(container);
          }
          
          const tab = document.getElementById(`tab-${sessionId}`);
          if (tab && tab.parentNode) {
            tab.parentNode.removeChild(tab);
          }
          
          // Clean up xterm.js instance
          if (terminals[sessionId].term) {
            try {
              terminals[sessionId].term.dispose();
            } catch (termError) {
              console.error(`Error disposing terminal ${sessionId}:`, termError);
            }
          }
          
          // Remove from terminals object
          delete terminals[sessionId];
        } catch (uiError) {
          console.error(`Error removing terminal UI ${sessionId}:`, uiError);
        }
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
        
        case 'dev-tools':
          window.api.toggleDevTools();
          break;
      }
      
      // Hide the menu
      contextMenu.classList.remove('show');
      contextMenuVisible = false;
    });
  }
  
  // Initialize search panel
  function initSearchPanel() {
    const searchPanel = document.getElementById('search-panel');
    const searchInput = document.getElementById('search-input');
    const searchPrevBtn = document.getElementById('search-prev-btn');
    const searchNextBtn = document.getElementById('search-next-btn');
    const searchCloseBtn = document.getElementById('search-close-btn');
    
    if (!searchPanel) return;
    
    // Set up search handlers
    searchInput.addEventListener('input', () => {
      const query = searchInput.value;
      if (query && activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].searchAddon.findNext(query);
      }
    });
    
    // Previous match
    searchPrevBtn.addEventListener('click', () => {
      const query = searchInput.value;
      if (query && activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].searchAddon.findPrevious(query);
      }
    });
    
    // Next match
    searchNextBtn.addEventListener('click', () => {
      const query = searchInput.value;
      if (query && activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].searchAddon.findNext(query);
      }
    });
    
    // Close search
    searchCloseBtn.addEventListener('click', () => {
      searchPanel.classList.remove('show');
      if (activeTerminalId && terminals[activeTerminalId]) {
        terminals[activeTerminalId].term.focus();
      }
    });
    
    // Enter key behavior
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value;
        if (query && activeTerminalId && terminals[activeTerminalId]) {
          if (e.shiftKey) {
            terminals[activeTerminalId].searchAddon.findPrevious(query);
          } else {
            terminals[activeTerminalId].searchAddon.findNext(query);
          }
        }
      } else if (e.key === 'Escape') {
        searchPanel.classList.remove('show');
        if (activeTerminalId && terminals[activeTerminalId]) {
          terminals[activeTerminalId].term.focus();
        }
      }
    });
  }
  
  // Show search panel
  function showSearchPanel() {
    const searchPanel = document.getElementById('search-panel');
    if (!searchPanel) return;
    
    searchPanel.classList.add('show');
    const searchInput = document.getElementById('search-input');
    searchInput.focus();
    searchInput.select();
  }
  
  // Toggle menu visibility
  function toggleMenu(menuName) {
    // Get the menu element
    const menu = document.getElementById(`${menuName}-menu`);
    if (!menu) return;
    
    // Check if this menu is already open
    const isThisMenuVisible = menuName === selectedMenu;
    
    // Hide any open menus
    hideAllMenus();
    
    // If this menu was visible, we're done (it was toggled off)
    if (isThisMenuVisible) return;
    
    // Otherwise, show this menu
    menu.style.display = 'block';
    menuVisible = true;
    selectedMenu = menuName;
    
    // Highlight the menu item
    const menuItem = document.querySelector(`.menu-item[data-menu="${menuName}"]`);
    if (menuItem) {
      menuItem.classList.add('active');
    }
    
    // Position the menu
    const rect = menuItem.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom}px`;
  }
  
  // Show submenu
  function showSubmenu(submenuName, trigger) {
    // Hide any existing submenus
    hideAllSubmenus();
    
    // Show the submenu
    const submenu = document.getElementById(`${submenuName}-menu`);
    if (!submenu) return;
    
    submenu.style.display = 'block';
    submenuVisible = true;
    selectedSubmenu = submenuName;
    
    // Position the submenu
    const triggerRect = trigger.getBoundingClientRect();
    const parentMenuRect = trigger.closest('.dropdown-menu').getBoundingClientRect();
    
    submenu.style.top = `${triggerRect.top}px`;
    submenu.style.left = `${parentMenuRect.right}px`;
    
    // Add mouse leave event to hide submenu
    submenu.addEventListener('mouseleave', () => {
      // Only hide if not hovering over the trigger
      if (!trigger.matches(':hover')) {
        submenu.style.display = 'none';
        submenuVisible = false;
        selectedSubmenu = null;
      }
    });
    
    // Make sure submenu stays visible when hovering over trigger
    trigger.addEventListener('mouseleave', (e) => {
      // Check if we're moving to the submenu
      const relatedTarget = e.relatedTarget;
      if (!relatedTarget || !submenu.contains(relatedTarget)) {
        setTimeout(() => {
          if (!submenu.matches(':hover')) {
            submenu.style.display = 'none';
            submenuVisible = false;
            selectedSubmenu = null;
          }
        }, 100);
      }
    });
  }
  
  // Hide all dropdown menus
  function hideAllMenus() {
    // Hide submenus first
    hideAllSubmenus();
    
    // Hide regular menus
    const menus = document.querySelectorAll('.dropdown-menu');
    menus.forEach(menu => {
      menu.style.display = 'none';
    });
    
    // Deselect active menu
    const activeMenuItems = document.querySelectorAll('.menu-item.active');
    activeMenuItems.forEach(item => {
      item.classList.remove('active');
    });
    
    menuVisible = false;
    selectedMenu = null;
  }
  
  // Hide all submenus
  function hideAllSubmenus() {
    const submenus = document.querySelectorAll('.submenu');
    submenus.forEach(submenu => {
      submenu.style.display = 'none';
    });
    
    submenuVisible = false;
    selectedSubmenu = null;
  }
  
  // Toggle theme
  function toggleTheme() {
    const currentTheme = document.documentElement.className;
    const newTheme = currentTheme === 'theme-dark' ? 'theme-light' : 'theme-dark';
    
    document.documentElement.className = newTheme;
    
    // Update terminal themes
    const themeKey = newTheme === 'theme-dark' ? 'dark' : 'light';
    Object.values(terminals).forEach(terminal => {
      terminal.term.options.theme = themes[themeKey];
    });
  }
  
  // Change font size
  function changeFontSize(delta) {
    currentFontSize = Math.max(8, Math.min(24, currentFontSize + delta));
    
    Object.values(terminals).forEach(terminal => {
      terminal.term.options.fontSize = currentFontSize;
      terminal.fitAddon.fit();
    });
  }
  
  // Toggle menu bar
  function toggleMenuBar() {
    const appMenuBar = document.querySelector('.app-menu-bar');
    if (appMenuBar) {
      appMenuBar.style.display = appMenuBar.style.display === 'none' ? 'flex' : 'none';
    }
  }
  
  // Create a new terminal tab
  function createNewTerminal() {
    // Request a new terminal from the main process
    window.api.createTerminal().then(sessionIdOrError => {
      // Check if we got an error object back
      if (sessionIdOrError && typeof sessionIdOrError === 'object' && sessionIdOrError.error) {
        console.error('Error creating terminal:', sessionIdOrError.message);
        
        // Show error message to user
        const errorMsg = document.createElement('div');
        errorMsg.style.position = 'fixed';
        errorMsg.style.top = '50%';
        errorMsg.style.left = '50%';
        errorMsg.style.transform = 'translate(-50%, -50%)';
        errorMsg.style.backgroundColor = 'rgba(200, 0, 0, 0.8)';
        errorMsg.style.color = 'white';
        errorMsg.style.padding = '15px 20px';
        errorMsg.style.borderRadius = '5px';
        errorMsg.style.zIndex = '1000';
        errorMsg.textContent = `Terminal error: ${sessionIdOrError.message || 'Failed to create terminal process'}`;
        
        document.body.appendChild(errorMsg);
        
        // Remove after 3 seconds
        setTimeout(() => {
          errorMsg.style.opacity = '0';
          errorMsg.style.transition = 'opacity 0.5s';
          setTimeout(() => {
            if (errorMsg.parentNode) {
              errorMsg.parentNode.removeChild(errorMsg);
            }
          }, 500);
        }, 3000);
        
        // Try to reuse existing terminal if available
        if (activeTerminalId && terminals[activeTerminalId]) {
          setActiveTerminal(activeTerminalId);
          return;
        }
        
        // If no existing terminal, try one more time with delay
        setTimeout(() => {
          window.api.createTerminal().then(secondAttemptSession => {
            if (secondAttemptSession && typeof secondAttemptSession !== 'object') {
              createTerminalForSession(secondAttemptSession);
            } else {
              console.error('Second attempt to create terminal failed');
            }
          }).catch(err => {
            console.error('Second attempt error:', err);
          });
        }, 1000);
        
        return;
      }
      
      // Normal case - we got a valid session ID
      createTerminalForSession(sessionIdOrError);
    }).catch(err => {
      console.error('Error creating terminal:', err);
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
      fontSize: currentFontSize,
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
      if (sessionId) {
        window.api.sendTerminalInput(sessionId, data);
      }
    });
    
    term.onResize(({ cols, rows }) => {
      if (sessionId) {
        window.api.resizeTerminal(sessionId, cols, rows);
      }
      
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
      document.getElementById('session-id').textContent = `Session ID: ${sessionId}`;
      
      const { cols, rows } = terminals[sessionId].term;
      document.getElementById('terminal-size').textContent = `${cols}×${rows}`;
    }
  }
  
  // Close a terminal
  function closeTerminal(sessionId) {
    if (!terminals[sessionId]) return;
    
    try {
      // Safety check - ensure we have at least one terminal left or create a new one
      const terminalIds = Object.keys(terminals);
      if (terminalIds.length <= 1) {
        // Create a new terminal first before closing this one
        window.api.createTerminal().then(sessionIdOrError => {
          // Check if we got an error object back
          if (sessionIdOrError && typeof sessionIdOrError === 'object' && sessionIdOrError.error) {
            console.error('Error creating replacement terminal:', sessionIdOrError.message);
            
            // Just remove the current terminal anyway, but keep the UI element visible
            // to avoid empty app state
            const container = terminals[sessionId].container;
            const tab = document.getElementById(`tab-${sessionId}`);
            
            // Create a placeholder with error message
            const errorPlaceholder = document.createElement('div');
            errorPlaceholder.className = 'terminal-error-state';
            errorPlaceholder.style.width = '100%';
            errorPlaceholder.style.height = '100%';
            errorPlaceholder.style.display = 'flex';
            errorPlaceholder.style.flexDirection = 'column';
            errorPlaceholder.style.justifyContent = 'center';
            errorPlaceholder.style.alignItems = 'center';
            errorPlaceholder.style.backgroundColor = '#1e1e1e';
            errorPlaceholder.style.color = '#e74c3c';
            errorPlaceholder.innerHTML = `
              <h3>Terminal Error</h3>
              <p>${sessionIdOrError.message || 'Failed to create terminal process'}</p>
              <button id="retry-terminal-btn" style="padding: 5px 10px; margin-top: 15px; background: #2980b9; color: white; border: none; border-radius: 3px; cursor: pointer;">Retry</button>
            `;
            
            // Replace terminal with placeholder
            if (container && container.parentNode) {
              container.style.display = 'none';
              container.parentNode.appendChild(errorPlaceholder);
              
              // Add retry button handler
              const retryBtn = document.getElementById('retry-terminal-btn');
              if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                  errorPlaceholder.parentNode.removeChild(errorPlaceholder);
                  createNewTerminal();
                });
              }
            }
            
            // Update tab to show error
            if (tab) {
              const titleElement = tab.querySelector('.tab-title');
              if (titleElement) {
                titleElement.textContent = 'Terminal Error';
                titleElement.style.color = '#e74c3c';
              }
            }
            
            // Don't actually remove the terminal process yet to avoid empty state
            window.api.closeTerminal(sessionId);
          } else {
            // Successfully created replacement terminal
            createTerminalForSession(sessionIdOrError);
            
            // Now safe to remove the old terminal
            removeTerminal(sessionId);
          }
        }).catch(err => {
          console.error('Error creating replacement terminal:', err);
          // Failed to create replacement terminal, but still need to close current one
          removeTerminal(sessionId);
          // Create an empty placeholder terminal
          createEmptyTerminalPlaceholder();
        });
      } else {
        // Safe to remove - we have other terminals
        removeTerminal(sessionId);
        
        // Activate another terminal if this was the active one
        if (activeTerminalId === sessionId) {
          const remainingIds = Object.keys(terminals).filter(id => id !== sessionId);
          if (remainingIds.length > 0) {
            setActiveTerminal(remainingIds[0]);
          }
        }
      }
    } catch (error) {
      console.error(`Error closing terminal ${sessionId}:`, error);
      
      // Try direct removal as last resort
      try {
        if (terminals[sessionId]) {
          window.api.closeTerminal(sessionId);
          delete terminals[sessionId];
        }
      } catch (e) {
        console.error('Final cleanup error:', e);
      }
    }
  }
  
  // Helper function to create an empty terminal placeholder
  function createEmptyTerminalPlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'terminal-placeholder';
    placeholder.style.width = '100%';
    placeholder.style.height = '100%';
    placeholder.style.display = 'flex';
    placeholder.style.flexDirection = 'column';
    placeholder.style.justifyContent = 'center';
    placeholder.style.alignItems = 'center';
    placeholder.style.backgroundColor = '#1e1e1e';
    placeholder.style.color = '#95a5a6';
    placeholder.innerHTML = `
      <h3>Terminal Error</h3>
      <p>Could not create terminal process</p>
      <button id="retry-terminal-btn" style="padding: 5px 10px; margin-top: 15px; background: #2980b9; color: white; border: none; border-radius: 3px; cursor: pointer;">Retry</button>
    `;
    
    // Add to container
    const terminalsContainer = document.getElementById('terminals-container');
    if (terminalsContainer) {
      terminalsContainer.appendChild(placeholder);
      
      // Add retry button handler
      const retryBtn = document.getElementById('retry-terminal-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          placeholder.parentNode.removeChild(placeholder);
          createNewTerminal();
        });
      }
    }
    
    // Create a placeholder tab
    const tab = document.createElement('div');
    tab.className = 'tab active';
    tab.innerHTML = `
      <span class="tab-title">Terminal Error</span>
      <span class="tab-close">×</span>
    `;
    
    // Add to tabs
    const tabsContainer = document.getElementById('tabs');
    const newTabButton = document.getElementById('new-tab-button');
    if (tabsContainer && newTabButton) {
      tabsContainer.insertBefore(tab, newTabButton);
      
      // Handle click on close button
      tab.querySelector('.tab-close').addEventListener('click', () => {
        if (placeholder.parentNode) {
          placeholder.parentNode.removeChild(placeholder);
        }
        if (tab.parentNode) {
          tab.parentNode.removeChild(tab);
        }
        createNewTerminal();
      });
    }
  }
  
  // Helper function to remove a terminal
  function removeTerminal(sessionId) {
    if (!terminals[sessionId]) return;
    
    try {
      // Request cleanup of terminal process on the main side
      window.api.closeTerminal(sessionId);
      
      // UI cleanup is handled by the onTerminalCloseResponse event handler
      // This function now just initiates the close request to the main process
    } catch (err) {
      console.error(`Error initiating removal of terminal ${sessionId}:`, err);
      
      // Fallback cleanup if the IPC request fails
      try {
        // Clean up UI elements
        const container = terminals[sessionId].container;
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
        
        const tab = document.getElementById(`tab-${sessionId}`);
        if (tab && tab.parentNode) {
          tab.parentNode.removeChild(tab);
        }
        
        // Dispose the terminal instance
        if (terminals[sessionId].term) {
          terminals[sessionId].term.dispose();
        }
        
        // Remove from terminals object
        delete terminals[sessionId];
      } catch (cleanupErr) {
        console.error(`Error during fallback cleanup for terminal ${sessionId}:`, cleanupErr);
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
