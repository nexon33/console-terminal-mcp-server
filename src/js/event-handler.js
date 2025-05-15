let TI; // Terminal Interface (dependencies from terminal.js)

// Module-level state for menus and context menu
let menuVisible = false;
let selectedMenu = null;
let submenuVisible = false;
let selectedSubmenu = null;
let contextMenuVisible = false;

// --- Menu Helper Functions (will use TI for external calls if needed) ---
function hideAllSubmenus() {
  const submenus = document.querySelectorAll('.submenu');
  submenus.forEach(submenu => {
    submenu.style.display = 'none';
  });
  submenuVisible = false;
  selectedSubmenu = null;
}

function hideAllMenus() {
  hideAllSubmenus();
  const menus = document.querySelectorAll('.dropdown-menu');
  menus.forEach(menu => {
    menu.style.display = 'none';
  });
  const activeMenuItems = document.querySelectorAll('.menu-item.active');
  activeMenuItems.forEach(item => {
    item.classList.remove('active');
  });
  menuVisible = false;
  selectedMenu = null;
}

function toggleMenu(menuName) {
  const menu = document.getElementById(`${menuName}-menu`);
  if (!menu) return;

  const isThisMenuVisible = menuName === selectedMenu;
  hideAllMenus();
  if (isThisMenuVisible) return;

  menu.style.display = 'block';
  menuVisible = true;
  selectedMenu = menuName;

  const menuItem = document.querySelector(`.menu-item[data-menu="${menuName}"]`);
  if (menuItem) {
    menuItem.classList.add('active');
    const rect = menuItem.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom}px`;
  }
}

function showSubmenu(submenuName, trigger) {
  hideAllSubmenus();
  const submenu = document.getElementById(`${submenuName}-menu`);
  if (!submenu) return;

  submenu.style.display = 'block';
  submenuVisible = true;
  selectedSubmenu = submenuName;

  const triggerRect = trigger.getBoundingClientRect();
  const parentMenuRect = trigger.closest('.dropdown-menu').getBoundingClientRect();

  submenu.style.top = `${triggerRect.top}px`;
  submenu.style.left = `${parentMenuRect.right}px`;

  submenu.addEventListener('mouseleave', () => {
    if (!trigger.matches(':hover')) {
      submenu.style.display = 'none';
      submenuVisible = false;
      selectedSubmenu = null;
    }
  });

  trigger.addEventListener('mouseleave', (e) => {
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

// --- Moved Main Event Initializer Sections (use TI for external calls) ---
function updateMaximizeButtonState() {
  // console.log("[EventHandler] Updating Maximize Button State..."); // Optional: too frequent
  const maximizeButton = document.getElementById('maximize-btn');
  if (maximizeButton) {
    maximizeButton.title = "Toggle Maximize"; 
  }
}

function initTitleBarAndControls() {
  console.log("[EventHandler] Initializing Title Bar and Controls...");
  const minimizeBtn = document.getElementById('minimize-btn');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
      window.api.minimizeWindow();
    });
  } else {
    console.warn("[EventHandler] Minimize button not found.");
  }
  
  const maximizeBtn = document.getElementById('maximize-btn');
  if (maximizeBtn) {
    maximizeBtn.addEventListener('click', () => {
      window.api.maximizeWindow();
      updateMaximizeButtonState();
    });
  } else {
    console.warn("[EventHandler] Maximize button not found.");
  }
  
  const closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.api.closeWindow();
    });
  } else {
    console.warn("[EventHandler] Close button not found.");
  }

  const titleBar = document.querySelector('.titlebar') || document.querySelector('.window-titlebar');
  if (titleBar && !titleBar.dataset.enhancedControls) { 
    titleBar.innerHTML = `
      <div class="titlebar-drag-region"></div>
      <div class="titlebar-app-icon">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="8" y1="9" x2="16" y2="9"></line><line x1="8" y1="13" x2="14" y2="13"></line><line x1="8" y1="17" x2="12" y2="17"></line></svg>
      </div>
      <div class="titlebar-title">MCP Terminal</div>
      <div class="titlebar-controls">
        <button id="minimize-btn-tb" class="titlebar-button" title="Minimize"><svg viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1"></rect></svg></button>
        <button id="maximize-btn-tb" class="titlebar-button" title="Maximize"><svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke-width="1"></rect></svg></button>
        <button id="close-btn-tb" class="titlebar-button titlebar-close" title="Close"><svg viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9"></line><line x1="9" y1="3" x2="3" y2="9"></line></svg></button>
      </div>
    `;
    titleBar.dataset.enhancedControls = "true"; // Mark as enhanced
    
    // Re-add event listeners to new elements within titleBar
    const minBtnTb = titleBar.querySelector('#minimize-btn-tb');
    if(minBtnTb) minBtnTb.addEventListener('click', () => window.api.minimizeWindow());
    else console.warn("[EventHandler] Titlebar Minimize button (tb) not found after innerHTML update.");

    const maxBtnTb = titleBar.querySelector('#maximize-btn-tb');
    if(maxBtnTb) maxBtnTb.addEventListener('click', () => { window.api.maximizeWindow(); updateMaximizeButtonState(); });
    else console.warn("[EventHandler] Titlebar Maximize button (tb) not found after innerHTML update.");

    const closeBtnTb = titleBar.querySelector('#close-btn-tb');
    if(closeBtnTb) closeBtnTb.addEventListener('click', () => window.api.closeWindow());
    else console.warn("[EventHandler] Titlebar Close button (tb) not found after innerHTML update.");

  } else if (!titleBar) {
    console.warn("[EventHandler] Title bar element (.titlebar or .window-titlebar) not found.");
  }
}

function initNewTabButtonEnhancement() {
  console.log("[EventHandler] Initializing New Tab Button Enhancement...");
  const newTabButton = document.getElementById('new-tab-button');
  if (newTabButton && !newTabButton.dataset.enhancedVisual) { 
    newTabButton.innerHTML = `
      <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    `;
    newTabButton.title = "New Terminal (Ctrl+Shift+T)";
    newTabButton.setAttribute('data-tooltip', 'New Terminal (Ctrl+Shift+T)');
    newTabButton.dataset.enhancedVisual = "true";
  } else if (!newTabButton) {
    console.warn("[EventHandler] New tab button ('new-tab-button') not found for visual enhancement.");
  }
}

function initTopBarSearchButton() {
  console.log("[EventHandler] Initializing Top Bar Search Button...");
  const searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      TI.showSearchPanel();
    });
  } else {
    console.warn("[EventHandler] Top bar search button ('search-btn') not found.");
  }
}

function initAltKeyPress() {
  console.log("[EventHandler] Initializing Alt Key Press listener...");
  if (window.api && window.api.onAltKeyPressed) {
    window.api.onAltKeyPressed(() => {
      toggleFirstMenu();
    });
  } else {
    console.warn("[EventHandler] window.api.onAltKeyPressed not available.");
  }
}

function initTabControlButtons() {
  console.log("[EventHandler] Initializing Tab Control Buttons...");
  const newTabBtn = document.getElementById('new-tab-btn'); // Often a specific button in a bar
  if (newTabBtn) {
    newTabBtn.addEventListener('click', TI.createNewTerminal);
  } else {
    console.warn("[EventHandler] 'new-tab-btn' not found.");
  }

  const newTabButtonIcon = document.getElementById('new-tab-button'); // The icon button
  if (newTabButtonIcon) {
    newTabButtonIcon.addEventListener('click', TI.createNewTerminal);
  } else {
    console.warn("[EventHandler] 'new-tab-button' (icon) not found.");
  }
  
  const trashBtn = document.getElementById('trash-btn');
  if (trashBtn) {
    trashBtn.addEventListener('click', () => {
      const activeId = TI.getActiveTerminalId();
      if (activeId) {
        TI.closeTerminal(activeId);
      }
    });
  } else {
    console.warn("[EventHandler] 'trash-btn' not found.");
  }

  const nextTabBtn = document.getElementById('next-tab-btn');
  if(nextTabBtn) {
    nextTabBtn.addEventListener('click', TI.navigateToNextTab);
  } else {
    console.warn("[EventHandler] 'next-tab-btn' not found.");
  }
}

function initMenuItemsAndMenus() {
  console.log("[EventHandler] Initializing Menu Items and Menus interactivity...");
  const menuItems = document.querySelectorAll('.menu-item');
  if (menuItems.length > 0) {
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const target = e.currentTarget; // Use currentTarget for the element the listener is attached to
        if (target && target.dataset.menu) {
          toggleMenu(target.dataset.menu);
        }
      });
    });
  } else {
    console.warn("[EventHandler] No '.menu-item' elements found.");
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.menu-item') || e.target.closest('.dropdown-menu')) {
      return;
    }
    hideAllMenus();
  });

  const submenuTriggers = document.querySelectorAll('.submenu-trigger');
  if (submenuTriggers.length > 0) {
    submenuTriggers.forEach(trigger => {
      trigger.addEventListener('mouseenter', (e) => {
        const target = e.currentTarget; // Use currentTarget
        if (target && target.dataset.submenu) {
          showSubmenu(target.dataset.submenu, target);
        }
      });
    });
  } else {
    console.warn("[EventHandler] No '.submenu-trigger' elements found.");
  }
}

function initMenuActions() {
  console.log("[EventHandler] Initializing Menu Actions...");
  // Helper to add listeners
  const addListener = (id, action) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', action);
    } else {
      console.warn(`[EventHandler] Menu action element '${id}' not found.`);
    }
  };

  // MCP Menu
  addListener('menu-new-window', () => { hideAllMenus(); window.api.createWindow(); });
  addListener('menu-settings', () => { hideAllMenus(); TI.loadCurrentSettings(); TI.showSettingsModal(); });
  addListener('menu-exit', () => { hideAllMenus(); window.api.quit(); });

  // Terminal Menu
  addListener('menu-new-tab', () => { hideAllMenus(); TI.createNewTerminal(); });
  addListener('menu-close-tab', () => {
    hideAllMenus();
    const activeId = TI.getActiveTerminalId();
    if (activeId) TI.closeTerminal(activeId);
  });
  addListener('menu-clear', () => {
    hideAllMenus();
    const activeId = TI.getActiveTerminalId();
    if (activeId && TI.terminals[activeId]) TI.terminals[activeId].term.clear();
  });
  addListener('menu-reset', () => {
    hideAllMenus();
    const activeId = TI.getActiveTerminalId();
    if (activeId && TI.terminals[activeId]) TI.terminals[activeId].term.reset();
  });
  addListener('menu-send-output', () => { hideAllMenus(); TI.sendCurrentOutput(); });
  addListener('menu-copy-session-id', () => {
    hideAllMenus();
    const activeId = TI.getActiveTerminalId();
    if (activeId) {
      TI.copyToClipboard(activeId);
      TI.showFeedback('Session ID copied to clipboard', 'success');
      const sessionIdElement = document.getElementById('session-id-value');
      if (sessionIdElement) {
        sessionIdElement.classList.add('copied');
        setTimeout(() => { sessionIdElement.classList.remove('copied'); }, 1500);
      }
    }
  });
  addListener('menu-next-tab', () => { hideAllMenus(); TI.navigateToNextTab(); });
  addListener('menu-prev-tab', () => { hideAllMenus(); TI.navigateToPreviousTab(); });

  // Edit Menu
  addListener('menu-copy', () => {
    hideAllMenus();
    const activeId = TI.getActiveTerminalId();
    if (activeId && TI.terminals[activeId] && TI.terminals[activeId].term.hasSelection()) {
      navigator.clipboard.writeText(TI.terminals[activeId].term.getSelection());
    }
  });
  addListener('menu-paste', () => {
    hideAllMenus();
    const activeId = TI.getActiveTerminalId();
    if (activeId && TI.terminals[activeId]) {
      navigator.clipboard.readText().then(text => {
        window.api.sendTerminalInput(activeId, text);
      });
    }
  });
  addListener('menu-select-all', () => {
    hideAllMenus();
    const activeId = TI.getActiveTerminalId();
    if (activeId && TI.terminals[activeId]) TI.terminals[activeId].term.selectAll();
  });
  addListener('menu-find', () => { hideAllMenus(); TI.showSearchPanel(); });

  // View Menu
  addListener('menu-toggle-theme', () => { hideAllMenus(); TI.toggleTheme(); });
  addListener('menu-increase-font', () => { hideAllMenus(); TI.changeFontSize(1); });
  addListener('menu-decrease-font', () => { hideAllMenus(); TI.changeFontSize(-1); });
  addListener('menu-toggle-menu-bar', () => { hideAllMenus(); TI.toggleMenuBar(); });

  // Window Menu
  addListener('menu-fullscreen', () => { hideAllMenus(); window.api.toggleFullscreen(); });

  // Developer Tools Menu
  addListener('menu-toggle-dev-tools', () => { hideAllMenus(); window.api.toggleDevTools(); });
  addListener('menu-reload', () => { hideAllMenus(); window.api.reloadWindow(); });
  addListener('menu-force-reload', () => { hideAllMenus(); window.api.forceReload(); });

  // Help Menu
  addListener('menu-keyboard-shortcuts', () => { hideAllMenus(); /* TODO */ });
  addListener('menu-about', () => { hideAllMenus(); /* TODO */ });
}

function initContextMenuListeners() {
  console.log("[EventHandler] Initializing Context Menu Listeners...");
  const contextMenu = document.getElementById('context-menu');
  const terminalsContainer = document.getElementById('terminals-container');

  if (terminalsContainer) {
    terminalsContainer.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rightClickBehavior = localStorage.getItem('rightClickBehavior') || 'context';
      const activeId = TI.getActiveTerminalId();

      if (rightClickBehavior === 'paste') {
        if (activeId && TI.terminals && TI.terminals[activeId]) { // Check TI.terminals
          navigator.clipboard.readText().then(text => {
            window.api.sendTerminalInput(activeId, text);
          });
        }
        return;
      }
      
      if (rightClickBehavior === 'context' && contextMenu) {
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) contextMenu.style.left = `${e.pageX - rect.width}px`;
        if (rect.bottom > window.innerHeight) contextMenu.style.top = `${e.pageY - rect.height}px`;
        
        contextMenu.classList.add('show');
        contextMenuVisible = true;
        contextMenu.classList.add('context-menu-appear');
        setTimeout(() => contextMenu.classList.remove('context-menu-appear'), 300);
      }
    });
  } else {
    console.warn("[EventHandler] Element with ID 'terminals-container' not found. Context menu on terminals-container will not be initialized.");
  }

  document.addEventListener('click', (e) => {
    if (contextMenuVisible && contextMenu && !contextMenu.contains(e.target)) {
        if (terminalsContainer && terminalsContainer.contains(e.target)) {
            // Click is inside terminal container, do nothing to allow selection/interaction
        } else {
            contextMenu.classList.remove('show');
            contextMenuVisible = false;
        }
    }
  });
  
  if (contextMenu) {
    if (!contextMenu.querySelector('[data-action="copy"]')) {
        contextMenu.innerHTML = `
          <div class="context-menu-header">Terminal Actions</div>
          <div class="context-menu-item" data-action="copy"><span class="context-menu-icon"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></span><span>Copy</span><span class="context-menu-shortcut">Ctrl+C</span></div>
          <div class="context-menu-item" data-action="paste"><span class="context-menu-icon"><svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg></span><span>Paste</span><span class="context-menu-shortcut">Ctrl+V</span></div>
          <div class="context-menu-item" data-action="clear"><span class="context-menu-icon"><svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span><span>Clear Terminal</span><span class="context-menu-shortcut">Ctrl+K</span></div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="send-output"><span class="context-menu-icon"><svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg></span><span>Send Output</span></div>
          <div class="context-menu-item" data-action="new-tab"><span class="context-menu-icon"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></span><span>New Tab</span><span class="context-menu-shortcut">Ctrl+Shift+T</span></div>
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" data-action="dev-tools"><span class="context-menu-icon"><svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span><span>Developer Tools</span><span class="context-menu-shortcut">F12</span></div>
        `;
    }

    contextMenu.addEventListener('click', (e) => {
      const actionItem = e.target.closest('.context-menu-item');
      if (!actionItem) return;
      const action = actionItem.dataset.action;
      
      const activeId = TI.getActiveTerminalId();
      
      switch (action) {
        case 'copy':
          if (activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].term.hasSelection()) {
            navigator.clipboard.writeText(TI.terminals[activeId].term.getSelection());
            TI.showFeedback('Text copied to clipboard', 'success');
          }
          break;
        case 'paste':
          if (activeId && TI.terminals && TI.terminals[activeId]) {
            navigator.clipboard.readText().then(text => {
              window.api.sendTerminalInput(activeId, text);
            });
          }
          break;
        case 'clear':
          if (activeId && TI.terminals && TI.terminals[activeId]) {
            TI.terminals[activeId].term.clear();
            TI.showFeedback('Terminal cleared', 'info');
          }
          break;
        case 'send-output': TI.sendCurrentOutput(); break;
        case 'new-tab': TI.createNewTerminal(); break;
        case 'dev-tools': window.api.toggleDevTools(); break;
      }
      contextMenu.classList.remove('show');
      contextMenuVisible = false;
    });

    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('mouseenter', () => item.classList.add('active'));
      item.addEventListener('mouseleave', () => item.classList.remove('active'));
    });
  } else {
      console.warn("[EventHandler] Context menu element ('context-menu') not found. Context menu actions and hover effects will not be initialized.");
  }
}

function initSearchPanelListeners() {
  console.log("[EventHandler] Initializing Search Panel Listeners...");
  const searchPanel = document.getElementById('search-panel');
  const searchInput = document.getElementById('search-input');
  const searchPrevBtn = document.getElementById('search-prev-btn');
  const searchNextBtn = document.getElementById('search-next-btn');
  const searchCloseBtn = document.getElementById('search-close-btn');

  if (!searchPanel || !searchInput || !searchPrevBtn || !searchNextBtn || !searchCloseBtn) {
    console.warn("[EventHandler] One or more search panel elements not found. Search functionality may be incomplete.");
    return; // Exit if essential elements are missing
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value;
    const activeId = TI.getActiveTerminalId();
    if (query && activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].searchAddon) {
      TI.terminals[activeId].searchAddon.findNext(query);
    }
  });

  searchPrevBtn.addEventListener('click', () => {
    const query = searchInput.value;
    const activeId = TI.getActiveTerminalId();
    if (query && activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].searchAddon) {
      TI.terminals[activeId].searchAddon.findPrevious(query);
    }
  });

  searchNextBtn.addEventListener('click', () => {
    const query = searchInput.value;
    const activeId = TI.getActiveTerminalId();
    if (query && activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].searchAddon) {
      TI.terminals[activeId].searchAddon.findNext(query);
    }
  });

  searchCloseBtn.addEventListener('click', () => {
    searchPanel.classList.remove('show');
    const activeId = TI.getActiveTerminalId();
    if (activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].term) {
      TI.terminals[activeId].term.focus();
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    const activeId = TI.getActiveTerminalId();
    if (e.key === 'Enter') {
      const query = searchInput.value;
      if (query && activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].searchAddon) {
        if (e.shiftKey) {
          TI.terminals[activeId].searchAddon.findPrevious(query);
        } else {
          TI.terminals[activeId].searchAddon.findNext(query);
        }
      }
    } else if (e.key === 'Escape') {
      searchPanel.classList.remove('show');
      if (activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].term) {
        TI.terminals[activeId].term.focus();
      }
    }
  });
}

function initWindowResizeListener() {
  console.log("[EventHandler] Initializing Window Resize Listener...");
  window.addEventListener('resize', () => {
    TI.fitActiveTerminal();
    updateMaximizeButtonState();
  });
}

function initKeyboardShortcuts() {
  console.log("[EventHandler] Initializing Keyboard Shortcuts...");
  document.addEventListener('keydown', (e) => {
    const activeId = TI.getActiveTerminalId();
    // Ctrl+Shift+N
    if (e.ctrlKey && e.shiftKey && e.key === 'N') { e.preventDefault(); if(window.api) window.api.createWindow(); }
    // Ctrl+Shift+T
    else if (e.ctrlKey && e.shiftKey && e.key === 'T') { e.preventDefault(); TI.createNewTerminal(); }
    // Ctrl+W
    else if (e.ctrlKey && e.key === 'w') { 
      e.preventDefault(); 
      if (activeId) TI.closeTerminal(activeId); 
    }
    // Ctrl+Tab
    else if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); TI.navigateToNextTab(); }
    // Ctrl+Shift+Tab
    else if (e.ctrlKey && e.shiftKey && e.key === 'Tab') { e.preventDefault(); TI.navigateToPreviousTab(); }
    // Ctrl+Alt+C
    else if (e.ctrlKey && e.altKey && e.key === 'c') {
      e.preventDefault();
      if (activeId) {
        TI.copyToClipboard(activeId);
        TI.showFeedback('Session ID copied to clipboard', 'success');
        const sessionIdElement = document.getElementById('session-id-value');
        if (sessionIdElement) {
          sessionIdElement.classList.add('copied');
          setTimeout(() => sessionIdElement.classList.remove('copied'), 1500);
        }
      }
    }
    // Ctrl+C
    else if (e.ctrlKey && e.key === 'c') {
      if (activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].term.hasSelection()) {
        e.preventDefault();
        navigator.clipboard.writeText(TI.terminals[activeId].term.getSelection());
      }
    }
    // Ctrl+V
    else if (e.ctrlKey && e.key === 'v') {
      const focusedElement = document.activeElement;
      const isInputFocused = focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'TEXTAREA' || focusedElement.isContentEditable);
      if (activeId && TI.terminals && TI.terminals[activeId] && !isInputFocused) {
        navigator.clipboard.readText().then(text => {
          if(window.api) window.api.sendTerminalInput(activeId, text);
        });
      }
    }
    // Ctrl+A
    else if (e.ctrlKey && e.key === 'a') {
      const focusedElement = document.activeElement;
      const isInputFocused = focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'TEXTAREA');
       if (activeId && TI.terminals && TI.terminals[activeId] && !isInputFocused) {
        e.preventDefault();
        TI.terminals[activeId].term.selectAll();
      }
    }
    // Ctrl+F
    else if (e.ctrlKey && e.key === 'f') { e.preventDefault(); TI.showSearchPanel(); }
    // Ctrl+K
    else if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      if (activeId && TI.terminals && TI.terminals[activeId]) TI.terminals[activeId].term.clear();
    }
    // Ctrl++ or Ctrl+=
    else if (e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); TI.changeFontSize(1); }
    // Ctrl+-
    else if (e.ctrlKey && e.key === '-') { e.preventDefault(); TI.changeFontSize(-1); }
    // F11
    else if (e.key === 'F11') { e.preventDefault(); if(window.api) window.api.toggleFullscreen(); }
    // F12
    else if (e.key === 'F12') { e.preventDefault(); if(window.api) window.api.toggleDevTools(); }
    // Alt (alone)
    else if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault(); 
        if (TI.toggleMenuBar) TI.toggleMenuBar(); 
    }
    // ESC
    else if (e.key === 'Escape') {
      let eventHandled = false;
      if (menuVisible) {
        hideAllMenus();
        eventHandled = true;
      }
      const searchPanel = document.getElementById('search-panel');
      if (searchPanel && searchPanel.classList.contains('show')) {
        searchPanel.classList.remove('show');
        if (activeId && TI.terminals && TI.terminals[activeId] && TI.terminals[activeId].term) TI.terminals[activeId].term.focus();
        eventHandled = true;
      }
      if(eventHandled) e.preventDefault();
    }
  });
}

function initTerminalEventsFromMain() {
  console.log("[EventHandler] Initializing Terminal Events from Main Process...");
  if (!window.api) {
    console.error("[EventHandler] window.api is not available. Terminal events from main process cannot be initialized.");
    return;
  }

  window.api.onTerminalData && window.api.onTerminalData(({ sessionId, data }) => {
    if (TI.terminals && TI.terminals[sessionId] && TI.terminals[sessionId].term) {
      TI.terminals[sessionId].term.write(data);
      if (sessionId === TI.getActiveTerminalId()) {
        TI.updateTerminalInfo(sessionId);
      }
    }
  });

  window.api.onTerminalExit && window.api.onTerminalExit(({ sessionId, exitCode }) => {
    if (TI.terminals && TI.terminals[sessionId]) {
      TI.terminals[sessionId].exitCode = exitCode;
      TI.updateTabTitle(sessionId, TI.terminals[sessionId].title + " [Exited]");
    }
  });

  window.api.onSessionId && window.api.onSessionId((sessionId) => {
    if (TI.terminals && !TI.terminals[sessionId]) { // Check TI.terminals
      TI.createTerminalForSession(sessionId);
    }
    TI.setActiveTerminal(sessionId);
    const sessionIdElement = document.getElementById('session-id-value');
    if (sessionIdElement) sessionIdElement.textContent = sessionId;
  });

  window.api.onTerminalCloseResponse && window.api.onTerminalCloseResponse(({ sessionId, success, error }) => {
    if (!success) {
      console.warn(`[EventHandler] Failed to close terminal session ${sessionId} from main process:`, error);
    }
    if (TI.handleTerminalCloseResponse) {
        TI.handleTerminalCloseResponse({ sessionId, success, error });
    } else {
        console.warn("[EventHandler] TI.handleTerminalCloseResponse not found. Performing minimal cleanup.");
        if (TI.terminals && TI.terminals[sessionId]) {
            try {
                const container = TI.terminals[sessionId].container;
                if (container && container.parentNode) container.parentNode.removeChild(container);
                const tab = document.getElementById(`tab-${sessionId}`);
                if (tab && tab.parentNode) tab.parentNode.removeChild(tab);
                if (TI.terminals[sessionId].term) {
                    try { TI.terminals[sessionId].term.dispose(); }
                    catch (termError) { console.error(`[EventHandler] Error disposing terminal ${sessionId}: `, termError); }
                }
                delete TI.terminals[sessionId];
            } catch (uiError) {
                console.error(`[EventHandler] Error during fallback UI removal for terminal ${sessionId}:`, uiError);
            }
        }
    }
  });
}

// --- Main Exported Function ---
export function initializeAllEventListeners(terminalInterface) {
  console.log("[EventHandler] Attempting to initialize all event listeners...");
  TI = terminalInterface; 

  if (!TI) {
    console.error("[EventHandler] CRITICAL: Terminal Interface (TI) is undefined. Cannot initialize event listeners.");
    return;
  }

  try {
    initTitleBarAndControls();
    initNewTabButtonEnhancement();
    initTopBarSearchButton();
    initTabControlButtons();
    initMenuItemsAndMenus();
    initMenuActions();
    initContextMenuListeners();
    initSearchPanelListeners();
    initAltKeyPress();
    initWindowResizeListener();
    initKeyboardShortcuts();
    initTerminalEventsFromMain();

    console.log("[EventHandler] All event listeners initialized successfully.");
  } catch (error) {
    console.error("[EventHandler] CRITICAL ERROR during event listener initialization:", error);
  }
} 