/**
 * Terminal functionality for MCP Server with multi-tab support
 */
import themes from './themes.js';

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
  let currentTheme = 'dark';
  
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
    
    // Enhance title bar with custom drag area
    const titleBar = document.querySelector('.titlebar') || document.querySelector('.window-titlebar');
    if (titleBar) {
      titleBar.innerHTML = `
        <div class="titlebar-drag-region"></div>
        <div class="titlebar-app-icon">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="8" y1="9" x2="16" y2="9"></line>
            <line x1="8" y1="13" x2="14" y2="13"></line>
            <line x1="8" y1="17" x2="12" y2="17"></line>
          </svg>
        </div>
        <div class="titlebar-title">MCP Terminal</div>
        <div class="titlebar-controls">
          <button id="minimize-btn" class="titlebar-button" title="Minimize">
            <svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1"></rect></svg>
          </button>
          <button id="maximize-btn" class="titlebar-button" title="Maximize">
            <svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke-width="1"></rect></svg>
          </button>
          <button id="close-btn" class="titlebar-button titlebar-close" title="Close">
            <svg viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9"></line><line x1="9" y1="3" x2="3" y2="9"></line></svg>
          </button>
        </div>
      `;
      
      // Re-add event listeners to new elements
      document.getElementById('minimize-btn').addEventListener('click', () => {
        window.api.minimizeWindow();
      });
      
      document.getElementById('maximize-btn').addEventListener('click', () => {
        window.api.maximizeWindow();
        updateMaximizeButtonState();
      });
      
      document.getElementById('close-btn').addEventListener('click', () => {
        window.api.closeWindow();
      });
    }
    
    // Enhance new tab button
    const newTabButton = document.getElementById('new-tab-button');
    if (newTabButton) {
      newTabButton.innerHTML = `
        <svg viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      `;
      newTabButton.title = "New Terminal (Ctrl+Shift+T)";
      newTabButton.setAttribute('data-tooltip', 'New Terminal (Ctrl+Shift+T)');
    }
    
    // Search button in top bar
    document.getElementById('search-btn')?.addEventListener('click', () => {
      showSearchPanel();
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
      loadCurrentSettings();
      showSettingsModal();
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
    
    document.getElementById('menu-copy-session-id')?.addEventListener('click', () => {
      hideAllMenus();
      if (activeTerminalId) {
        copyToClipboard(activeTerminalId);
        showFeedback('Session ID copied to clipboard', 'success');
        
        // Also provide visual feedback on the element
        const sessionIdElement = document.getElementById('session-id-value');
        if (sessionIdElement) {
          sessionIdElement.classList.add('copied');
          setTimeout(() => {
            sessionIdElement.classList.remove('copied');
          }, 1500);
        }
      }
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
      
      // Ctrl+Alt+C (Copy Session ID)
      else if (e.ctrlKey && e.altKey && e.key === 'c') {
        e.preventDefault();
        if (activeTerminalId) {
          copyToClipboard(activeTerminalId);
          showFeedback('Session ID copied to clipboard', 'success');
          
          // Also provide visual feedback on the element
          const sessionIdElement = document.getElementById('session-id-value');
          if (sessionIdElement) {
            sessionIdElement.classList.add('copied');
            setTimeout(() => {
              sessionIdElement.classList.remove('copied');
            }, 1500);
          }
        }
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
      
      // Update session ID in the UI
      const sessionIdElement = document.getElementById('session-id-value');
      if (sessionIdElement) {
        sessionIdElement.textContent = sessionId;
      }
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
      
      // Check right-click behavior setting
      const rightClickBehavior = localStorage.getItem('rightClickBehavior') || 'context';
      
      if (rightClickBehavior === 'paste') {
        // Paste content from clipboard
        if (activeTerminalId && terminals[activeTerminalId]) {
          navigator.clipboard.readText().then(text => {
            window.api.sendTerminalInput(activeTerminalId, text);
          });
        }
        return;
      }
      
      // For 'context' behavior, show the context menu
      if (rightClickBehavior === 'context') {
        // Position the menu
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        
        // Ensure it stays in viewport
        const rect = contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (rect.right > viewportWidth) {
          contextMenu.style.left = `${e.pageX - rect.width}px`;
        }
        
        if (rect.bottom > viewportHeight) {
          contextMenu.style.top = `${e.pageY - rect.height}px`;
        }
        
        // Show the menu with animation
        contextMenu.classList.add('show');
        contextMenuVisible = true;
        
        // Add animation class
        contextMenu.classList.add('context-menu-appear');
        setTimeout(() => {
          contextMenu.classList.remove('context-menu-appear');
        }, 300);
      }
      
      // For 'select' behavior, the terminal will handle word selection automatically
      // This is configured in the Terminal constructor with rightClickSelectsWord
    });
    
    // Hide context menu on click outside
    document.addEventListener('click', () => {
      if (contextMenuVisible) {
        contextMenu.classList.remove('show');
        contextMenuVisible = false;
      }
    });
    
    // Update context menu HTML with icons
    if (contextMenu) {
      contextMenu.innerHTML = `
        <div class="context-menu-header">Terminal Actions</div>
        <div class="context-menu-item" data-action="copy">
          <span class="context-menu-icon">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </span>
          <span>Copy</span>
          <span class="context-menu-shortcut">Ctrl+C</span>
        </div>
        <div class="context-menu-item" data-action="paste">
          <span class="context-menu-icon">
            <svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          </span>
          <span>Paste</span>
          <span class="context-menu-shortcut">Ctrl+V</span>
        </div>
        <div class="context-menu-item" data-action="clear">
          <span class="context-menu-icon">
            <svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </span>
          <span>Clear Terminal</span>
          <span class="context-menu-shortcut">Ctrl+K</span>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="send-output">
          <span class="context-menu-icon">
            <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
          </span>
          <span>Send Output</span>
        </div>
        <div class="context-menu-item" data-action="new-tab">
          <span class="context-menu-icon">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </span>
          <span>New Tab</span>
          <span class="context-menu-shortcut">Ctrl+Shift+T</span>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" data-action="dev-tools">
          <span class="context-menu-icon">
            <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </span>
          <span>Developer Tools</span>
          <span class="context-menu-shortcut">F12</span>
        </div>
      `;
    }
    
    // Handle context menu actions
    contextMenu.addEventListener('click', (e) => {
      const action = e.target.closest('.context-menu-item')?.dataset.action;
      if (!action) return;
      
      switch (action) {
        case 'copy':
          if (activeTerminalId && terminals[activeTerminalId] && terminals[activeTerminalId].term.hasSelection()) {
            navigator.clipboard.writeText(terminals[activeTerminalId].term.getSelection());
            showFeedback('Text copied to clipboard', 'success');
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
            showFeedback('Terminal cleared', 'info');
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
    
    // Add hover effects to menu items
    const menuItems = contextMenu.querySelectorAll('.context-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.classList.add('active');
      });
      
      item.addEventListener('mouseleave', () => {
        item.classList.remove('active');
      });
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
    // Get the next theme in rotation
    // Cycle between dark, light, nord, dracula
    const themeOrder = ['dark', 'light', 'nord', 'dracula'];
    const currentIndex = themeOrder.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    currentTheme = themeOrder[nextIndex];
    
    // Apply the new theme class
    const newThemeClass = `theme-${currentTheme}`;
    
    // Add transition class to body for smooth theme change
    document.body.classList.add('theme-transition');
    
    // Change theme with delay for transition
    setTimeout(() => {
      // Remove all theme classes
      document.documentElement.classList.remove('theme-dark', 'theme-light', 'theme-nord', 'theme-dracula');
      // Add the new theme class
      document.documentElement.classList.add(newThemeClass);
      
      // Update terminal themes
      Object.values(terminals).forEach(terminal => {
        terminal.term.options.theme = themes[currentTheme];
        terminal.term.refresh(0, terminal.term.rows - 1);
      });
      
      // Remove transition class after theme change is complete
      setTimeout(() => {
        document.body.classList.remove('theme-transition');
      }, 300);
    }, 50);
    
    // Show feedback
    showFeedback(`Theme changed to ${currentTheme}`, 'info');
  }
  
  // Change font size
  function changeFontSize(delta) {
    const prevSize = currentFontSize;
    currentFontSize = Math.max(8, Math.min(24, currentFontSize + delta));
    
    // Only proceed if size actually changed
    if (prevSize === currentFontSize) return;
    
    Object.values(terminals).forEach(terminal => {
      terminal.term.options.fontSize = currentFontSize;
      terminal.fitAddon.fit();
    });
    
    // Show feedback
    if (delta > 0) {
      showFeedback(`Font size increased to ${currentFontSize}px`, 'info');
    } else {
      showFeedback(`Font size decreased to ${currentFontSize}px`, 'info');
    }
  }
  
  // Toggle menu bar
  function toggleMenuBar() {
    const appMenuBar = document.querySelector('.app-menu-bar');
    if (appMenuBar) {
      appMenuBar.style.display = appMenuBar.style.display === 'none' ? 'flex' : 'none';
    }
  }
  
  // Show feedback message with improved styling
  function showFeedback(message, type = 'success') {
    const feedbackElement = document.createElement('div');
    feedbackElement.textContent = message;
    feedbackElement.style.position = 'absolute';
    feedbackElement.style.left = '50%';
    feedbackElement.style.top = '50%';
    feedbackElement.style.transform = 'translate(-50%, -50%)';
    feedbackElement.style.padding = '12px 24px';
    feedbackElement.style.borderRadius = '6px';
    feedbackElement.style.zIndex = '1000';
    feedbackElement.style.display = 'flex';
    feedbackElement.style.alignItems = 'center';
    feedbackElement.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
    feedbackElement.style.animation = 'feedbackAnim 0.3s forwards, feedbackFade 2s forwards 0.5s';
    feedbackElement.style.backdropFilter = 'blur(8px)';
    
    // Add icon based on type
    const icon = document.createElement('span');
    icon.style.marginRight = '10px';
    icon.style.fontSize = '18px';
    
    if (type === 'success') {
      feedbackElement.style.backgroundColor = 'rgba(46, 204, 113, 0.85)';
      feedbackElement.style.color = 'white';
      icon.textContent = '✓';
    } else if (type === 'error') {
      feedbackElement.style.backgroundColor = 'rgba(231, 76, 60, 0.85)';
      feedbackElement.style.color = 'white';
      icon.textContent = '✕';
    } else if (type === 'info') {
      feedbackElement.style.backgroundColor = 'rgba(52, 152, 219, 0.85)';
      feedbackElement.style.color = 'white';
      icon.textContent = 'ℹ';
    }
    
    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes feedbackAnim {
        0% { opacity: 0; transform: translate(-50%, -40%); }
        100% { opacity: 1; transform: translate(-50%, -50%); }
      }
      
      @keyframes feedbackFade {
        0% { opacity: 1; transform: translate(-50%, -50%); }
        80% { opacity: 1; transform: translate(-50%, -50%); }
        100% { opacity: 0; transform: translate(-50%, -40%); }
      }
    `;
    document.head.appendChild(style);
    
    feedbackElement.prepend(icon);
    document.body.appendChild(feedbackElement);
    
    // Remove after animation completes
    setTimeout(() => {
      if (feedbackElement.parentNode) {
        feedbackElement.parentNode.removeChild(feedbackElement);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 2500);
  }
  
  // Create a new terminal tab
  function createNewTerminal() {
    // Add loading indicator to tab bar
    const tabsContainer = document.getElementById('tabs');
    const loadingTab = document.createElement('div');
    loadingTab.className = 'tab';
    loadingTab.innerHTML = `
      <span class="tab-title">Loading...</span>
      <div class="loading-spinner"></div>
    `;
    const newTabButton = document.getElementById('new-tab-button');
    tabsContainer.insertBefore(loadingTab, newTabButton);
    
    // Request a new terminal from the main process
    window.api.createTerminal().then(sessionIdOrError => {
      // Remove loading indicator
      if (loadingTab.parentNode) {
        loadingTab.parentNode.removeChild(loadingTab);
      }
      
      // Check if we got an error object back
      if (sessionIdOrError && typeof sessionIdOrError === 'object' && sessionIdOrError.error) {
        console.error('Error creating terminal:', sessionIdOrError.message);
        
        // Show error message to user
        showFeedback(`Terminal error: ${sessionIdOrError.message || 'Failed to create terminal process'}`, 'error');
        
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
      // Remove loading indicator on error
      if (loadingTab.parentNode) {
        loadingTab.parentNode.removeChild(loadingTab);
      }
      showFeedback('Failed to create terminal', 'error');
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
    
    // Get terminal settings from localStorage
    const fontFamily = localStorage.getItem('fontFamily') || 'Consolas, "Cascadia Mono", "Source Code Pro", monospace';
    const cursorStyle = localStorage.getItem('cursorStyle') || 'block';
    const cursorBlink = localStorage.getItem('cursorBlink') !== 'false';
    const scrollback = parseInt(localStorage.getItem('scrollback') || '5000');
    const allowTransparency = localStorage.getItem('allowTransparency') !== 'false';
    const rendererType = localStorage.getItem('rendererType') || 'canvas';
    const macOptionIsMeta = localStorage.getItem('macOptionIsMeta') !== 'false';
    const wordSeparator = localStorage.getItem('wordSeparator') || ' ()[]{}\'",.;:';
    
    // Create the xterm.js instance
    const term = new Terminal({
      fontFamily: fontFamily,
      fontSize: currentFontSize,
      cursorStyle: cursorStyle,
      cursorBlink: cursorBlink,
      theme: themes[currentTheme],
      scrollback: scrollback,
      allowTransparency: allowTransparency,
      convertEol: true,
      disableStdin: false,
      smoothScrollDuration: 300,
      rightClickSelectsWord: localStorage.getItem('rightClickBehavior') === 'select',
      macOptionIsMeta: macOptionIsMeta,
      rendererType: rendererType,
      allowProposedApi: true,
      wordSeparator: wordSeparator
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
    
    // Handle copy on select if enabled
    term.onSelectionChange(() => {
      const copyOnSelect = localStorage.getItem('copyOnSelect') === 'true';
      if (copyOnSelect && term.hasSelection()) {
        const selection = term.getSelection();
        navigator.clipboard.writeText(selection);
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
    
    // Add custom title detection
    term.onTitleChange(title => {
      if (title && title.trim()) {
        updateTabTitle(sessionId, title.trim());
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
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" class="tab-icon-svg">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="8" y1="9" x2="16" y2="9"></line>
          <line x1="8" y1="13" x2="14" y2="13"></line>
          <line x1="8" y1="17" x2="12" y2="17"></line>
        </svg>
      </span>
      <span class="tab-title">Terminal</span>
      <span class="tab-close">×</span>
    `;
    
    // Add appear animation
    tab.style.opacity = '0';
    tab.style.transform = 'translateY(-10px)';
    tab.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    // Insert before the new tab button
    tabsContainer.insertBefore(tab, newTabButton);
    
    // Trigger animation
    setTimeout(() => {
      tab.style.opacity = '1';
      tab.style.transform = 'translateY(0)';
    }, 10);
    
    // Add click events
    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        closeTerminal(sessionId);
      } else {
        setActiveTerminal(sessionId);
      }
    });
    
    // Add double-click for renaming
    tab.querySelector('.tab-title').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const titleElement = e.target;
      const currentTitle = titleElement.textContent;
      
      // Create input element for renaming
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentTitle;
      input.className = 'tab-rename-input';
      input.style.width = `${titleElement.offsetWidth}px`;
      
      // Replace title with input
      titleElement.innerHTML = '';
      titleElement.appendChild(input);
      input.focus();
      input.select();
      
      // Handle input events
      input.addEventListener('blur', () => {
        finishRenaming();
      });
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          finishRenaming();
        } else if (e.key === 'Escape') {
          input.value = currentTitle;
          finishRenaming();
        }
      });
      
      // Function to complete renaming
      function finishRenaming() {
        const newTitle = input.value.trim() || currentTitle;
        titleElement.textContent = newTitle;
        updateTabTitle(sessionId, newTitle);
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
  
  // Set the active terminal with animation
  function setActiveTerminal(sessionId) {
    if (!terminals[sessionId]) return;
    
    // Deactivate current terminal with fade out
    if (activeTerminalId && terminals[activeTerminalId]) {
      terminals[activeTerminalId].container.classList.add('fade-out');
      
      // Prepare for fade-in
      terminals[sessionId].container.classList.add('fade-in');
      
      setTimeout(() => {
        terminals[activeTerminalId].container.classList.remove('active', 'fade-out');
        
        const currentTab = document.getElementById(`tab-${activeTerminalId}`);
        if (currentTab) {
          currentTab.classList.remove('active');
        }
        
        // Complete activation with fade-in
        activeTerminalId = sessionId;
        terminals[sessionId].container.classList.add('active');
        terminals[sessionId].container.classList.remove('fade-in');
        
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
      }, 150);
    } else {
      // No previous active terminal, just activate
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
  }
  
  // Update terminal information in the status bar
  function updateTerminalInfo(sessionId) {
    if (sessionId === activeTerminalId) {
      const sessionIdElement = document.getElementById('session-id-value');
      if (sessionIdElement) {
        sessionIdElement.textContent = sessionId;
        
        // Ensure click handler is set up
        if (!sessionIdElement.hasAttribute('data-copy-initialized')) {
          sessionIdElement.setAttribute('data-copy-initialized', 'true');
          
          // Add click handler to copy session ID
          sessionIdElement.addEventListener('click', () => {
            copyToClipboard(sessionId);
            
            // Visual feedback
            sessionIdElement.classList.add('copied');
            setTimeout(() => {
              sessionIdElement.classList.remove('copied');
            }, 1500);
            
            // Show additional feedback
            showFeedback('Session ID copied to clipboard', 'success');
          });
        }
      }
      
      const { cols, rows } = terminals[sessionId].term;
      const terminalSizeElement = document.getElementById('terminal-size');
      terminalSizeElement.innerHTML = `<span class="terminal-size-icon"></span>${cols}×${rows}`;
      
      // Add tooltip if not already present
      if (!terminalSizeElement.hasAttribute('data-tooltip')) {
        terminalSizeElement.setAttribute('data-tooltip', 'Terminal dimensions');
      }
    }
  }
  
  // Helper function to copy text to clipboard
  function copyToClipboard(text) {
    // Use the newer navigator.clipboard API if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          console.log('Session ID copied to clipboard');
        })
        .catch(err => {
          console.error('Failed to copy session ID: ', err);
          // Fallback to the older method
          copyToClipboardFallback(text);
        });
    } else {
      // Fallback for browsers that don't support the Clipboard API
      copyToClipboardFallback(text);
    }
  }
  
  // Fallback clipboard copy method
  function copyToClipboardFallback(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // Make the textarea out of viewport
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        console.log('Session ID copied to clipboard (fallback)');
      } else {
        console.error('Failed to copy session ID (fallback)');
      }
    } catch (err) {
      console.error('Failed to copy session ID (fallback): ', err);
    }
    
    document.body.removeChild(textArea);
  }
  
  // Close a terminal
  function closeTerminal(sessionId) {
    if (!terminals[sessionId]) return;
    
    // Add close animation to the tab
    const tab = document.getElementById(`tab-${sessionId}`);
    if (tab) {
      tab.classList.add('closing');
      
      // Wait for animation to complete
      setTimeout(() => {
        // Continue with normal close logic
        closeTerminalInternal(sessionId);
      }, 200);
    } else {
      // No tab found, just close directly
      closeTerminalInternal(sessionId);
    }
  }
  
  // Internal function to handle terminal closing logic
  function closeTerminalInternal(sessionId) {
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
    showFeedback('Output sent successfully', 'success');
  }
  
  // Initialize settings modal
  function initSettingsModal() {
    const settingsModal = document.getElementById('settings-modal');
    const closeButton = document.getElementById('settings-close');
    const saveButton = document.getElementById('settings-save');
    const resetButton = document.getElementById('settings-reset');
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    const fontSizeInput = document.getElementById('font-size');
    const decreaseFontBtn = document.getElementById('decrease-font-btn');
    const increaseFontBtn = document.getElementById('increase-font-btn');
    
    if (!settingsModal) {
      console.error('Settings modal not found');
      return;
    }
    
    // Note: The menu-settings click event listener is already defined in initMenuActions
    
    // Close button
    closeButton.addEventListener('click', () => {
      hideSettingsModal();
    });
    
    // Save button
    saveButton.addEventListener('click', () => {
      saveSettings();
      hideSettingsModal();
    });
    
    // Reset button
    resetButton.addEventListener('click', () => {
      resetToDefaultSettings();
    });
    
    // Tab switching
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        switchSettingsTab(tabName);
      });
    });
    
    // Font size buttons
    decreaseFontBtn.addEventListener('click', () => {
      const currentValue = parseInt(fontSizeInput.value);
      if (currentValue > parseInt(fontSizeInput.min)) {
        fontSizeInput.value = currentValue - 1;
      }
    });
    
    increaseFontBtn.addEventListener('click', () => {
      const currentValue = parseInt(fontSizeInput.value);
      if (currentValue < parseInt(fontSizeInput.max)) {
        fontSizeInput.value = currentValue + 1;
      }
    });
    
    // Toggle switches - add real-time visual feedback
    const toggleSwitches = [
      'cursor-blink',
      'copy-on-select', 
      'allow-transparency', 
      'mac-option-is-meta',
      'restore-tabs'
    ];
    
    toggleSwitches.forEach(id => {
      const toggleElem = document.getElementById(id);
      if (toggleElem) {
        // Add click event to provide immediate visual feedback
        toggleElem.addEventListener('change', () => {
          // Optional: Add visual feedback or real-time preview
          if (id === 'cursor-blink' && activeTerminalId && terminals[activeTerminalId]) {
            // Real-time preview of cursor blink
            terminals[activeTerminalId].term.options.cursorBlink = toggleElem.checked;
            terminals[activeTerminalId].term.refresh(0, terminals[activeTerminalId].term.rows - 1);
          }
          
          // Show feedback message
          showFeedback(`${toggleElem.checked ? 'Enabled' : 'Disabled'} ${id.replace(/-/g, ' ')}`, 'info');
        });
      }
    });
    
    // Add listener for renderer type changes to provide feedback
    const rendererTypeSelect = document.getElementById('renderer-type');
    if (rendererTypeSelect) {
      rendererTypeSelect.addEventListener('change', () => {
        showFeedback(`Renderer type will be set to ${rendererTypeSelect.value}`, 'info');
      });
    }
    
    // Add listener to cursor style changes
    const cursorStyleSelect = document.getElementById('cursor-style');
    if (cursorStyleSelect) {
      cursorStyleSelect.addEventListener('change', () => {
        if (activeTerminalId && terminals[activeTerminalId]) {
          // Real-time preview of cursor style
          terminals[activeTerminalId].term.options.cursorStyle = cursorStyleSelect.value;
          terminals[activeTerminalId].term.refresh(0, terminals[activeTerminalId].term.rows - 1);
          showFeedback(`Cursor style changed to ${cursorStyleSelect.value}`, 'info');
        }
      });
    }
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsModal.classList.contains('show')) {
        hideSettingsModal();
      }
    });
    
    // Close when clicking outside modal content
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        hideSettingsModal();
      }
    });
  }
  
  // Load current settings into form
  function loadCurrentSettings() {
    // Theme settings
    const themeSelect = document.getElementById('theme-select');
    themeSelect.value = currentTheme || 'dark';
    
    // Font settings
    const fontSizeInput = document.getElementById('font-size');
    fontSizeInput.value = currentFontSize || 14;
    
    // Get an active terminal to grab its settings, or use defaults
    let fontFamily = 'Consolas, "Cascadia Mono", "Source Code Pro", monospace';
    let cursorStyle = 'block';
    let cursorBlink = true;
    let scrollback = 5000;
    let allowTransparency = true;
    let rendererType = 'canvas';
    let macOptionIsMeta = true;
    
    // Try to get values from active terminal if available
    if (terminals[activeTerminalId]?.term) {
      const activeTerminal = terminals[activeTerminalId].term;
      
      fontFamily = activeTerminal.options.fontFamily;
      cursorStyle = activeTerminal.options.cursorStyle;
      cursorBlink = activeTerminal.options.cursorBlink;
      scrollback = activeTerminal.options.scrollback;
      allowTransparency = activeTerminal.options.allowTransparency;
      rendererType = activeTerminal.options.rendererType;
      macOptionIsMeta = activeTerminal.options.macOptionIsMeta;
    } else {
      // Try to get values from localStorage if no active terminal
      fontFamily = localStorage.getItem('fontFamily') || fontFamily;
      cursorStyle = localStorage.getItem('cursorStyle') || cursorStyle;
      cursorBlink = localStorage.getItem('cursorBlink') !== 'false';
      scrollback = parseInt(localStorage.getItem('scrollback') || scrollback);
      allowTransparency = localStorage.getItem('allowTransparency') !== 'false';
      rendererType = localStorage.getItem('rendererType') || rendererType;
      macOptionIsMeta = localStorage.getItem('macOptionIsMeta') !== 'false';
    }
    
    // Set form values
    const fontFamilySelect = document.getElementById('font-family');
    fontFamilySelect.value = fontFamily;
    
    const cursorStyleSelect = document.getElementById('cursor-style');
    cursorStyleSelect.value = cursorStyle;
    
    const cursorBlinkCheckbox = document.getElementById('cursor-blink');
    cursorBlinkCheckbox.checked = cursorBlink;
    
    const scrollbackInput = document.getElementById('scrollback');
    scrollbackInput.value = scrollback;
    
    const allowTransparencyCheckbox = document.getElementById('allow-transparency');
    allowTransparencyCheckbox.checked = allowTransparency;
    
    const rendererTypeSelect = document.getElementById('renderer-type');
    rendererTypeSelect.value = rendererType;
    
    const macOptionMetaCheckbox = document.getElementById('mac-option-is-meta');
    macOptionMetaCheckbox.checked = macOptionIsMeta;
    
    // Behavior settings from localStorage
    const copyOnSelectCheckbox = document.getElementById('copy-on-select');
    copyOnSelectCheckbox.checked = localStorage.getItem('copyOnSelect') === 'true';
    
    const rightClickBehaviorSelect = document.getElementById('right-click-behavior');
    rightClickBehaviorSelect.value = localStorage.getItem('rightClickBehavior') || 'context';
    
    const wordSeparatorInput = document.getElementById('word-separator');
    wordSeparatorInput.value = localStorage.getItem('wordSeparator') || ' ()[]{}\'",.;:';
    
    const restoreTabsCheckbox = document.getElementById('restore-tabs');
    restoreTabsCheckbox.checked = localStorage.getItem('restoreTabs') === 'true';
  }
  
  // Save all settings
  function saveSettings() {
    const themeSelect = document.getElementById('theme-select');
    const fontFamilySelect = document.getElementById('font-family');
    const fontSizeInput = document.getElementById('font-size');
    const cursorStyleSelect = document.getElementById('cursor-style');
    const cursorBlinkCheckbox = document.getElementById('cursor-blink');
    const scrollbackInput = document.getElementById('scrollback');
    const copyOnSelectCheckbox = document.getElementById('copy-on-select');
    const rightClickBehaviorSelect = document.getElementById('right-click-behavior');
    const wordSeparatorInput = document.getElementById('word-separator');
    const allowTransparencyCheckbox = document.getElementById('allow-transparency');
    const rendererTypeSelect = document.getElementById('renderer-type');
    const macOptionMetaCheckbox = document.getElementById('mac-option-is-meta');
    const restoreTabsCheckbox = document.getElementById('restore-tabs');
    
    // Save to localStorage for persistence
    localStorage.setItem('theme', themeSelect.value);
    localStorage.setItem('fontFamily', fontFamilySelect.value);
    localStorage.setItem('fontSize', fontSizeInput.value);
    localStorage.setItem('cursorStyle', cursorStyleSelect.value);
    localStorage.setItem('cursorBlink', cursorBlinkCheckbox.checked);
    localStorage.setItem('scrollback', scrollbackInput.value);
    localStorage.setItem('copyOnSelect', copyOnSelectCheckbox.checked);
    localStorage.setItem('rightClickBehavior', rightClickBehaviorSelect.value);
    localStorage.setItem('wordSeparator', wordSeparatorInput.value);
    localStorage.setItem('allowTransparency', allowTransparencyCheckbox.checked);
    localStorage.setItem('rendererType', rendererTypeSelect.value);
    localStorage.setItem('macOptionIsMeta', macOptionMetaCheckbox.checked);
    localStorage.setItem('restoreTabs', restoreTabsCheckbox.checked);
    
    // Apply settings to global variables
    currentTheme = themeSelect.value;
    currentFontSize = parseInt(fontSizeInput.value);
    
    // Apply settings to all terminals
    Object.values(terminals).forEach(terminal => {
      // Apply theme
      terminal.term.options.theme = themes[currentTheme];
      
      // Apply font settings
      terminal.term.options.fontFamily = fontFamilySelect.value;
      terminal.term.options.fontSize = currentFontSize;
      
      // Apply cursor settings
      terminal.term.options.cursorStyle = cursorStyleSelect.value;
      terminal.term.options.cursorBlink = cursorBlinkCheckbox.checked;
      
      // Apply other terminal settings
      terminal.term.options.scrollback = parseInt(scrollbackInput.value);
      terminal.term.options.allowTransparency = allowTransparencyCheckbox.checked;
      terminal.term.options.rendererType = rendererTypeSelect.value;
      terminal.term.options.macOptionIsMeta = macOptionMetaCheckbox.checked;
      terminal.term.options.wordSeparator = wordSeparatorInput.value;
      
      // Refresh the terminal
      terminal.term.refresh(0, terminal.term.rows - 1);
      terminal.fitAddon.fit();
    });
    
    // Apply theme to document
    document.documentElement.className = currentTheme === 'dark' ? 'theme-dark' : 'theme-light';
    
    // Show success message
    showFeedback('Settings saved', 'success');
  }
  
  // Reset to default settings
  function resetToDefaultSettings() {
    // Default values
    const defaultSettings = {
      theme: 'dark',
      fontFamily: 'Consolas, "Cascadia Mono", "Source Code Pro", monospace',
      fontSize: '14',
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: '5000',
      copyOnSelect: false,
      rightClickBehavior: 'context',
      wordSeparator: ' ()[]{}\'",.;:',
      allowTransparency: true,
      rendererType: 'canvas',
      macOptionIsMeta: true,
      restoreTabs: false
    };
    
    // Set form values to defaults
    document.getElementById('theme-select').value = defaultSettings.theme;
    document.getElementById('font-family').value = defaultSettings.fontFamily;
    document.getElementById('font-size').value = defaultSettings.fontSize;
    document.getElementById('cursor-style').value = defaultSettings.cursorStyle;
    document.getElementById('cursor-blink').checked = defaultSettings.cursorBlink;
    document.getElementById('scrollback').value = defaultSettings.scrollback;
    document.getElementById('copy-on-select').checked = defaultSettings.copyOnSelect;
    document.getElementById('right-click-behavior').value = defaultSettings.rightClickBehavior;
    document.getElementById('word-separator').value = defaultSettings.wordSeparator;
    document.getElementById('allow-transparency').checked = defaultSettings.allowTransparency;
    document.getElementById('renderer-type').value = defaultSettings.rendererType;
    document.getElementById('mac-option-is-meta').checked = defaultSettings.macOptionIsMeta;
    document.getElementById('restore-tabs').checked = defaultSettings.restoreTabs;
    
    // Show feedback
    showFeedback('Settings reset to defaults', 'info');
  }
  
  // Switch settings tab
  function switchSettingsTab(tabName) {
    // Deactivate all tabs
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    document.querySelectorAll('.settings-tab-pane').forEach(pane => {
      pane.classList.remove('active');
    });
    
    // Activate the selected tab
    document.querySelector(`.settings-tab-btn[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
  }
  
  // Show settings modal
  function showSettingsModal() {
    const settingsModal = document.getElementById('settings-modal');
    settingsModal.classList.add('show');
  }
  
  // Hide settings modal
  function hideSettingsModal() {
    const settingsModal = document.getElementById('settings-modal');
    settingsModal.classList.remove('show');
  }
  
  // Load saved settings from localStorage
  function loadSavedSettings() {
    // Load theme
    if (localStorage.getItem('theme')) {
      currentTheme = localStorage.getItem('theme');
      document.documentElement.className = currentTheme === 'dark' ? 'theme-dark' : 'theme-light';
    }
    
    // Load font size
    if (localStorage.getItem('fontSize')) {
      currentFontSize = parseInt(localStorage.getItem('fontSize'));
    }
    
    // These settings will be applied to new terminals when they are created
    // We don't need to do anything else here since the terminal creation function
    // will use these global settings
  }
  
  // Create search button in the top bar
  function createSearchButton() {
    // Check if the button already exists
    if (document.getElementById('search-btn')) return;
    
    // Find the controls container in the header
    const controlsContainer = document.querySelector('.window-controls') || document.querySelector('.header-controls');
    
    if (!controlsContainer) {
      console.warn('Could not find header controls container to add search button');
      return;
    }
    
    // Create the search button
    const searchBtn = document.createElement('div');
    searchBtn.id = 'search-btn';
    searchBtn.className = 'search-btn';
    searchBtn.title = 'Search (Ctrl+F)';
    searchBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
    `;
    
    // Add click event
    searchBtn.addEventListener('click', () => {
      showSearchPanel();
    });
    
    // Insert before the window control buttons
    controlsContainer.insertBefore(searchBtn, controlsContainer.firstChild);
  }
  
  // Initialize the application
  function init() {
    // Set up event listeners
    initEventListeners();
    
    // Initialize settings modal
    initSettingsModal();
    
    // Load saved settings from localStorage if available
    loadSavedSettings();
    
    // Create search button if it doesn't exist
    createSearchButton();
    
    // Create terminal footer element with blue border
    createTerminalFooter();
    
    // Add CSS for blue borders and terminal styling
    const style = document.createElement('style');
    style.textContent += `
      /* Terminal blue border styling */
      .terminal-instance {
        border-radius: var(--terminal-radius);
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
        opacity: 1;
        position: relative;
        border: 1px solid #0078d7;
        box-shadow: 0 0 0 1px rgba(0, 120, 215, 0.2);
      }
      
      .terminal-container {
        border: 2px solid #0078d7;
        border-radius: var(--terminal-radius);
        overflow: hidden;
        box-shadow: 0 0 10px rgba(0, 120, 215, 0.3);
      }
      
      #terminals-container {
        border: 1px solid #0078d7;
        border-radius: var(--terminal-radius);
        overflow: hidden;
        margin: 4px;
        box-shadow: inset 0 0 5px rgba(0, 120, 215, 0.3);
      }
      
      .tab.active {
        border-top: 2px solid #0078d7;
        border-left: 1px solid #0078d7;
        border-right: 1px solid #0078d7;
      }
      
      /* Status bar with no border */
      .status-bar {
        border-top: none;
        border-bottom: none;
        position: relative;
        padding-bottom: 4px;
        margin-bottom: 1px;
      }
      
      /* Remove status bar blue glow */
      .status-bar::after {
        display: none;
      }
      
      /* Remove blue styled footer */
      .terminal-footer {
        display: none;
      }
      
      /* Window border - remove all borders */
      body {
        border: none;
      }
      
      /* Create a horizontal blue line at the bottom of the tab bar - remove it */
      .tabs-container::after {
        display: none;
      }
      
      /* Terminal glow effect */
      .terminal-instance.active {
        box-shadow: 0 0 0 1px #0078d7, 0 0 8px rgba(0, 120, 215, 0.6);
      }
      
      .terminal-instance .xterm {
        padding: 8px;
      }
      
      /* Blue glow animation for active terminal */
      .terminal-instance.active .xterm {
        animation: blue-terminal-glow 3s ease-in-out infinite alternate;
      }
      
      @keyframes blue-terminal-glow {
        0% {
          box-shadow: 0 0 5px rgba(0, 120, 215, 0.3);
        }
        100% {
          box-shadow: 0 0 15px rgba(0, 120, 215, 0.5);
        }
      }
      
      /* Blue tinted selection */
      .xterm-selection {
        background-color: rgba(0, 120, 215, 0.3) !important;
      }
      
      /* Blue focus outline for tabs */
      .tab:focus {
        outline: 2px solid #0078d7;
        outline-offset: -1px;
      }
      
      /* Accent color definition */
      :root {
        --accent-color: #0078d7;
        --primary-glow: rgba(0, 120, 215, 0.15);
      }
      
      /* Title bar with blue styling */
      .titlebar, .window-titlebar {
        border-bottom: none; /* Remove border from title bar */
        box-shadow: none;
      }
      
      /* Only keep blue borders at the bottom */
      .tabs-container {
        border-bottom: none; /* Remove blue border from tabs container */
      }
      
      /* Blue tabs styling */
      .tab {
        border-bottom: none;
      }
      
      .tab::before {
        background: #0078d7;
      }
      
      .tabs-container {
        border-bottom: 1px solid #0078d7;
      }
      
      /* Blue styling for menu and buttons */
      .dropdown-menu {
        border: 1px solid #0078d7;
        box-shadow: 0 4px 12px rgba(0, 120, 215, 0.2);
      }
      
      .dropdown-menu-item:hover {
        background-color: rgba(0, 120, 215, 0.1);
      }
      
      button:hover, .btn:hover {
        background-color: rgba(0, 120, 215, 0.1);
      }
      
      /* Search panel with blue accents */
      #search-panel {
        border: 1px solid #0078d7;
      }
      
      #search-input:focus {
        border-color: #0078d7;
        box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.2);
      }
      
      /* Session ID with blue accent */
      .session-id::before {
        background-color: #0078d7;
      }
    `;
    document.head.appendChild(style);
    
    // Create initial terminal
    createNewTerminal();
  }
  
  // Create a terminal footer with a blue border
  function createTerminalFooter() {
    const footer = document.createElement('div');
    footer.className = 'terminal-footer';
    document.body.appendChild(footer);
  }
  
  // Start the app
  init();

  // Add CSS for new tab button
  const newTabButtonStyle = document.createElement('style');
  newTabButtonStyle.textContent = `
    /* New Tab Button styling */
    #new-tab-button {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 32px;
      height: 28px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
      margin-left: 4px;
      margin-right: 8px;
      border: none;
      background-color: transparent;
    }
    
    #new-tab-button svg {
      width: 16px;
      height: 16px;
      stroke: var(--accent-color);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      opacity: 0.9;
    }
    
    #new-tab-button:hover {
      background-color: var(--action-hover);
    }
    
    #new-tab-button:active {
      transform: scale(0.95);
    }
    
    /* Theme-specific styling for the new tab button */
    .theme-light #new-tab-button svg {
      stroke: var(--accent-color);
    }
    
    .theme-dark #new-tab-button svg {
      stroke: var(--accent-color);
    }
    
    .theme-nord #new-tab-button svg {
      stroke: #88c0d0;
    }
    
    .theme-dracula #new-tab-button svg {
      stroke: #bd93f9;
    }
  `;
  document.head.appendChild(newTabButtonStyle);
});
