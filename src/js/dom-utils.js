/**
 * Gets a single DOM element.
 * @param {string} selector - The CSS selector.
 * @param {Document|Element} [context=document] - The context to search within.
 * @returns {Element|null}
 */
export function getElement(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Gets multiple DOM elements.
 * @param {string} selector - The CSS selector.
 * @param {Document|Element} [context=document] - The context to search within.
 * @returns {NodeListOf<Element>}
 */
export function getAllElements(selector, context = document) {
  return context.querySelectorAll(selector);
}

/**
 * Creates an element with an optional class name.
 * @param {string} tagName - The HTML tag name.
 * @param {string|string[]} [className] - A class name or an array of class names.
 * @returns {Element}
 */
export function createElement(tagName, className) {
  const element = document.createElement(tagName);
  if (className) {
    if (Array.isArray(className)) {
      element.classList.add(...className);
    } else {
      element.classList.add(className);
    }
  }
  return element;
}

/**
 * Adds a class to an element.
 * @param {Element} element - The DOM element.
 * @param {string} className - The class name to add.
 */
export function addClass(element, className) {
  if (element) {
    element.classList.add(className);
  }
}

/**
 * Removes a class from an element.
 * @param {Element} element - The DOM element.
 * @param {string} className - The class name to remove.
 */
export function removeClass(element, className) {
  if (element) {
    element.classList.remove(className);
  }
}

/**
 * Toggles a class on an element.
 * @param {Element} element - The DOM element.
 * @param {string} className - The class name to toggle.
 * @param {boolean} [force] - If true, adds the class; if false, removes it.
 */
export function toggleClass(element, className, force) {
  if (element) {
    element.classList.toggle(className, force);
  }
}

/**
 * Sets the text content of an element.
 * @param {Element} element - The DOM element.
 * @param {string} text - The text to set.
 */
export function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

/**
 * Sets the HTML content of an element.
 * @param {Element} element - The DOM element.
 * @param {string} html - The HTML string to set.
 */
export function setHtml(element, html) {
  if (element) {
    element.innerHTML = html;
  }
}

/**
 * Appends a child element to a parent element.
 * @param {Element} parent - The parent DOM element.
 * @param {Element} child - The child DOM element.
 */
export function appendChild(parent, child) {
  if (parent && child) {
    parent.appendChild(child);
  }
}

/**
 * Removes a child element from a parent element.
 * @param {Element} parent - The parent DOM element.
 * @param {Element} child - The child DOM element.
 */
export function removeChild(parent, child) {
  if (parent && child && parent.contains(child)) {
    parent.removeChild(child);
  }
}

/**
 * Inserts an element before another element.
 * @param {Element} parentElement - The parent element.
 * @param {Element} newElement - The element to insert.
 * @param {Element} referenceElement - The element to insert before.
 */
export function insertBefore(parentElement, newElement, referenceElement) {
  if (parentElement && newElement && referenceElement) {
    parentElement.insertBefore(newElement, referenceElement);
  }
}

/**
 * Displays a feedback message on the screen.
 * Assumes CSS classes 'feedback-message', 'feedback-message--success',
 * 'feedback-message--error', 'feedback-message--info', and animations
 * 'feedback-anim', 'feedback-fade' are defined in CSS.
 * @param {string} message - The message to display.
 * @param {string} [type='success'] - The type of message ('success', 'error', 'info').
 */
export function displayFeedbackMessage(message, type = 'success') {
  const feedbackElement = createElement('div', 'feedback-message');
  addClass(feedbackElement, `feedback-message--${type}`); // e.g., feedback-message--success

  const icon = createElement('span', 'feedback-message__icon');
  // Icon character (✓, ✕, ℹ) can be set using CSS ::before pseudo-element based on the type class
  // e.g., .feedback-message--success .feedback-message__icon::before { content: '✓'; }
  appendChild(feedbackElement, icon);

  const textNode = document.createTextNode(message); // Create a text node for the message
  appendChild(feedbackElement, textNode); // Append the text node
  
  appendChild(document.body, feedbackElement);

  // The element is removed after animations complete.
  // CSS animations 'feedback-anim' (for entry) and 'feedback-fade' (for exit) should be defined.
  // The timeout should be set to the total duration of entry animation + display time + exit animation.
  // Example CSS might be:
  // .feedback-message { animation: feedback-anim 0.3s forwards, feedback-fade 0.3s forwards 2.2s; }
  // Timeout = 0.3s (anim) + 1.9s (visible) + 0.3s (fade) = 2.5s total.
  setTimeout(() => {
    removeChild(document.body, feedbackElement);
  }, 2500); // This duration should match your CSS animations.
}

/**
 * Creates a container for a terminal instance.
 * @param {string} sessionId - The session ID for this terminal.
 * @returns {Element} The created terminal container element.
 */
export function createTerminalContainerElement(sessionId) {
  const container = createElement('div', 'terminal-instance');
  container.id = `terminal-${sessionId}`;
  return container;
}

/**
 * Creates a tab element for a terminal.
 * Assumes CSS class `tab-appear` is defined for entry animation.
 * @param {string} sessionId - The session ID for this tab.
 * @param {string} initialTitle - The initial title for the tab.
 * @param {object} eventHandlers - Callbacks for tab interactions.
 * @param {function} eventHandlers.onTabClick - Called when the tab (not close button) is clicked.
 * @param {function} eventHandlers.onCloseClick - Called when the close button is clicked.
 * @param {function} eventHandlers.onTitleDoubleClick - Called when the title is double-clicked (signals start of edit).
 * @param {function} eventHandlers.onRenameSubmit - Called with the new title when renaming is confirmed (Enter/Blur).
 * @returns {Element} The created tab element.
 */
export function createTabElement(sessionId, initialTitle, eventHandlers) {
  const tab = createElement('div', 'tab');
  tab.id = `tab-${sessionId}`;
  tab.dataset.sessionId = sessionId;

  const icon = createElement('span', 'tab-icon');
  setHtml(icon, `
    <svg viewBox="0 0 24 24" class="tab-icon-svg">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="8" y1="9" x2="16" y2="9"></line>
      <line x1="8" y1="13" x2="14" y2="13"></line>
      <line x1="8" y1="17" x2="12" y2="17"></line>
    </svg>
  `);
  appendChild(tab, icon);

  const titleElement = createElement('span', 'tab-title');
  setText(titleElement, initialTitle);
  appendChild(tab, titleElement);

  const closeButton = createElement('span', 'tab-close');
  setText(closeButton, '×');
  appendChild(tab, closeButton);

  tab.addEventListener('click', (e) => {
    if (e.target === closeButton) {
      if (eventHandlers.onCloseClick) eventHandlers.onCloseClick(sessionId);
    } else if (!titleElement.contains(e.target) || !getElement('input', titleElement)) {
      if (eventHandlers.onTabClick) eventHandlers.onTabClick(sessionId);
    }
  });

  titleElement.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (getElement('input', titleElement)) return; // Already in edit mode

    const currentTitleText = titleElement.textContent;
    const input = createElement('input', 'tab-rename-input');
    input.type = 'text';
    input.value = currentTitleText;
    input.style.width = `${Math.max(50, titleElement.offsetWidth)}px`; 
    
    setHtml(titleElement, ''); 
    appendChild(titleElement, input);
    input.focus();
    input.select();

    const finishRenaming = () => {
      const newTitle = input.value.trim() || currentTitleText;
      setHtml(titleElement, ''); 
      setText(titleElement, newTitle); 
      if (newTitle !== currentTitleText) {
        if (eventHandlers.onRenameSubmit) eventHandlers.onRenameSubmit(sessionId, newTitle);
      }
      input.removeEventListener('blur', finishRenamingHandler); // Use named handler
      input.removeEventListener('keydown', handleRenameKeyDown);
    };
    
    // Named handler for removal
    const finishRenamingHandler = () => finishRenaming();

    const handleRenameKeyDown = (evt) => {
      if (evt.key === 'Enter') {
        finishRenaming();
      } else if (evt.key === 'Escape') {
        input.value = currentTitleText; 
        finishRenaming();
      }
    };

    input.addEventListener('blur', finishRenamingHandler);
    input.addEventListener('keydown', handleRenameKeyDown);
    
    if (eventHandlers.onTitleDoubleClick) eventHandlers.onTitleDoubleClick(sessionId);
  });
  
  // Initial animation: set initial styles for transition, then add class for transition target state.
  // Requires a CSS class like: 
  // .tab-appear-active { opacity: 1; transform: translateY(0); transition: opacity 0.3s ease, transform 0.3s ease; }
  tab.style.opacity = '0';
  tab.style.transform = 'translateY(-10px)';
  requestAnimationFrame(() => {
    addClass(tab, 'tab-appear-active'); // Class that defines the final state and transition
  });

  return tab;
}

// More functions will be added here, like displayFeedbackMessage, etc. 