/**
 * Terminal functionality for MCP Server with multi-tab support
 */
import themes from './themes.js';
import { initializeAllEventListeners } from './event-handler.js'; // Added import
import * as animations from './animation-handler.js'; // Import animation handler
import * as errorHandler from './error-handler.js'; // Import error handler

document.addEventListener('DOMContentLoaded', async () => {
  // Global variables
  const terminals = {};
  let activeTerminalId = null;
  let currentFontSize = 14;
  let currentTheme = 'dark';
  
  // NEW: Local feedback message display function using animation-handler
  /**
   * Displays a feedback message to the user (for non-errors).
   * Error messages should use errorHandler.showError.
   * @param {string} message The message to display.
   * @param {'info' | 'success'} type The type of message.
   * @param {number} [duration=3000] How long to display the message (ms).
   */
  function showFeedback(message, type = 'info', duration = 3000) {
    if (type === 'error') { // Route errors to the new handler
      errorHandler.showError(message, 'error');
      return;
    }
    const feedbackElement = document.createElement('div');
    feedbackElement.className = `feedback-message ${type}`;
    feedbackElement.textContent = message;
    document.body.appendChild(feedbackElement);
    animations.animateFeedbackMessageShow(feedbackElement, duration);
  }
  
  // Initialize event listeners - This function will be removed
  // function initEventListeners() { ... }

  // Initialize keyboard shortcuts - REMOVED (moved to event-handler.js)
  // function initKeyboardShortcuts() { ... }
  
  // Initialize terminal events from main process - REMOVED (moved to event-handler.js)
  // function initTerminalEvents() { ... }
  
  // Initialize context menu - REMOVED (moved to event-handler.js)
  // function initContextMenu() { ... }
  
  // Initialize search panel - REMOVED (moved to event-handler.js)
  // function initSearchPanel() { ... }
  
  // Show search panel - REMAINS IN terminal.js as it's a direct UI manipulation
  function showSearchPanel() {
    const searchPanel = document.getElementById('search-panel');
    if (!searchPanel) return;
    
    searchPanel.classList.add('show'); // Assuming 'show' class handles visibility with CSS transition
    const searchInput = document.getElementById('search-input');
    searchInput.focus();
    searchInput.select();
  }
  
  // Toggle menu visibility - REMOVED (moved to event-handler.js)
  // function toggleMenu(menuName) { ... }
  
  // Show submenu - REMOVED (moved to event-handler.js)
  // function showSubmenu(submenuName, trigger) { ... }
  
  // Hide all dropdown menus - REMOVED (moved to event-handler.js)
  // function hideAllMenus() { ... }
  
  // Hide all submenus - REMOVED (moved to event-handler.js)
  // function hideAllSubmenus() { ... }
  
  // Toggle theme - REMAINS IN terminal.js (manages currentTheme, applies to terminals)
  function toggleTheme() {
    const themeOrder = ['dark', 'light', 'nord', 'dracula'];
    const currentIndex = themeOrder.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    const newThemeName = themeOrder[nextIndex];
    
    const applyThemeChanges = () => {
      currentTheme = newThemeName;
      const newThemeClass = `theme-${currentTheme}`;
      
      document.documentElement.classList.remove('theme-dark', 'theme-light', 'theme-nord', 'theme-dracula');
      document.documentElement.classList.add(newThemeClass);
      
      Object.values(terminals).forEach(terminal => {
        terminal.term.options.theme = themes[currentTheme];
        terminal.term.refresh(0, terminal.term.rows - 1);
      });
      showFeedback(`Theme changed to ${currentTheme}`, 'info');
    };

    animations.animateThemeChange(applyThemeChanges);
  }
  
  // Change font size
  function changeFontSize(delta) {
    const prevSize = currentFontSize;
    currentFontSize = Math.max(8, Math.min(24, currentFontSize + delta));
    
    if (prevSize === currentFontSize) return;
    
    Object.values(terminals).forEach(terminal => {
      terminal.term.options.fontSize = currentFontSize;
      terminal.fitAddon.fit();
    });
    
    showFeedback(`Font size ${delta > 0 ? 'increased' : 'decreased'} to ${currentFontSize}px`, 'info');
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
    const attemptCreation = () => {
      window.api.createTerminal().then(sessionIdOrError => {
        if (loadingTab.parentNode) {
          loadingTab.parentNode.removeChild(loadingTab);
        }
        
        if (sessionIdOrError && typeof sessionIdOrError === 'object' && sessionIdOrError.error) {
          const errorDetails = {
            message: sessionIdOrError.message || 'Failed to create terminal process'
          };
          // No specific terminal container or tab exists yet for this error.
          // Use a generic placeholder if no terminals are open, or just show a notification.
          if (Object.keys(terminals).length === 0) {
            const terminalsContainer = document.getElementById('terminals-container');
            errorHandler.createGenericErrorPlaceholder(
              terminalsContainer,
              errorDetails.message,
              () => createNewTerminal() // Retry by calling createNewTerminal again
            );
          } else {
            errorHandler.showError(`Terminal error: ${errorDetails.message}`, 'error');
          }
          errorHandler.logError('Error creating terminal', { initialError: sessionIdOrError });
          return; 
        }
        createTerminalForSession(sessionIdOrError);
      }).catch(err => {
        if (loadingTab.parentNode) {
          loadingTab.parentNode.removeChild(loadingTab);
        }
        errorHandler.showSystemError(null, 'Failed to communicate with main process for new terminal.');
        errorHandler.logError('Error creating terminal via API', { originalError: err });
      });
    };
    attemptCreation();
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
    
    // Insert before the new tab button
    tabsContainer.insertBefore(tab, newTabButton);
    
    // Trigger animation using animation handler
    animations.animateTabAppear(tab);
    
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
    if (!terminals[sessionId] || activeTerminalId === sessionId) return;

    const newTerminalContainer = terminals[sessionId].container;
    const oldTerminalContainer = activeTerminalId ? terminals[activeTerminalId]?.container : null;

    const completeActivation = () => {
      activeTerminalId = sessionId;
      
      const tab = document.getElementById(`tab-${sessionId}`);
      if (tab) {
        // Ensure all other tabs are not active
        document.querySelectorAll('.tab.active').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
      
      updateTerminalInfo(sessionId);
      terminals[sessionId].term.focus();
      terminals[sessionId].fitAddon.fit();
    };

    // Deactivate all current tabs first visually
    document.querySelectorAll('#tabs .tab.active').forEach(activeTab => {
        activeTab.classList.remove('active');
    });

    animations.animateTerminalActivation(newTerminalContainer, oldTerminalContainer, completeActivation);
  }
  
  // Update terminal information in the status bar
  function updateTerminalInfo(sessionId) {
    if (sessionId === activeTerminalId && terminals[sessionId]) { // Added check for terminals[sessionId]
      const sessionIdElement = document.getElementById('session-id-value');
      if (sessionIdElement) {
        sessionIdElement.textContent = sessionId;
        
        if (!sessionIdElement.hasAttribute('data-copy-initialized')) {
          sessionIdElement.setAttribute('data-copy-initialized', 'true');
          sessionIdElement.addEventListener('click', () => {
            copyToClipboard(sessionId);
            animations.animateCopiedFeedback(sessionIdElement, 'copied-feedback-active', 1500);
            showFeedback('Session ID copied to clipboard', 'success');
          });
        }
      }
      
      const termInstance = terminals[sessionId].term;
      if (termInstance) { // Check if term instance exists
        const { cols, rows } = termInstance;
        const terminalSizeElement = document.getElementById('terminal-size');
        if (terminalSizeElement) { // Check if element exists
            terminalSizeElement.innerHTML = `<span class="terminal-size-icon"></span>${cols}×${rows}`;
            if (!terminalSizeElement.hasAttribute('data-tooltip')) {
                terminalSizeElement.setAttribute('data-tooltip', 'Terminal dimensions');
            }
        }
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
    
    const tab = document.getElementById(`tab-${sessionId}`);
    if (tab) {
      animations.animateTabClose(tab, () => {
        // Tab is visually gone, now handle internal logic
        // The original closeTerminalInternal might remove the tab from DOM, ensure it doesn't conflict
        closeTerminalInternal(sessionId); 
      });
    } else {
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
                titleElement.style.color = '#e74c3c'; // Keep direct style for error emphasis
              }
              // If tab was animated out by animateTabClose, it might be gone.
              // This path implies an error *during* replacement terminal creation,
              // so the original tab for the failing terminal might still be partly visible or in DOM.
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
  function removeTerminal(sessionId, force = false) {
    if (!terminals[sessionId]) return;
    
    try {
      // Request cleanup of terminal process on the main side
      window.api.closeTerminal(sessionId);
      
      // UI cleanup is handled by the onTerminalCloseResponse event handler
      // This function now just initiates the close request to the main process
      if (force) {
        const container = terminals[sessionId].container;
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
        const tab = document.getElementById(`tab-${sessionId}`);
        if (tab && tab.parentNode) {
          tab.parentNode.removeChild(tab);
        }
        terminals[sessionId].term.dispose();
        delete terminals[sessionId];
      }
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
    const sessionIds = Object.keys(terminals).filter(id => terminals[id] && !terminals[id].exited);
    if (sessionIds.length <= 1) return;
    
    const currentIndex = sessionIds.indexOf(activeTerminalId);
    const nextIndex = (currentIndex + 1) % sessionIds.length;
    setActiveTerminal(sessionIds[nextIndex]);
  }
  
  // Navigate to the previous tab
  function navigateToPreviousTab() {
    const sessionIds = Object.keys(terminals).filter(id => terminals[id] && !terminals[id].exited);
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
      document.documentElement.className = `theme-${currentTheme}`; // Ensure class follows pattern e.g. theme-dark
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
    // Create search button if it doesn't exist - MOVED EARLIER
    createSearchButton();

    // Set up event listeners
    const terminalInterface = {
      terminals,
      getActiveTerminalId: () => activeTerminalId,
      createNewTerminal,
      closeTerminal,
      navigateToNextTab,
      navigateToPreviousTab,
      copyToClipboard,
      sendCurrentOutput,
      showSearchPanel, 
      showFeedback, // Use new showFeedback
      updateTabTitle,
      updateTerminalInfo,
      createTerminalForSession,
      setActiveTerminal,
      loadCurrentSettings,
      showSettingsModal,
      toggleTheme,
      changeFontSize,
      toggleMenuBar,
      fitActiveTerminal: () => {
        if (activeTerminalId && terminals[activeTerminalId] && terminals[activeTerminalId].fitAddon) {
          terminals[activeTerminalId].fitAddon.fit();
          // Update size display after fit, as it might change
          if (terminals[activeTerminalId].term) {
            updateTerminalInfo(activeTerminalId);
          }
        }
      },
    };
    initializeAllEventListeners(terminalInterface);
    
    // Initialize settings modal
    initSettingsModal();
    
    // Load saved settings from localStorage if available
    loadSavedSettings();
    
    // Create terminal footer element with blue border
    createTerminalFooter();
    
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
});
