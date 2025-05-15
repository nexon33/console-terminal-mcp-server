/**
 * Centralized error handling for the MCP Server application.
 */
import { animateFeedbackMessageShow } from './animation-handler.js';

/**
 * Logs an error to the console with optional context.
 * @param {Error | string} error The error object or message.
 * @param {object} [context={}] Additional context for the error.
 */
export function logError(error, context = {}) {
  console.error("[MCP Application Error]", error);
  if (context && Object.keys(context).length > 0) {
    console.error("Error Context:", context);
  }
  // In a production environment, this could also send errors to a remote logging service.
}

/**
 * Displays a user-facing error message.
 * This uses a similar mechanism to the feedback messages.
 * @param {string} message The message to display.
 * @param {'error' | 'warning' | 'info'} [type='error'] The type of message.
 * @param {any} [details=null] Additional details to log.
 */
export function showError(message, type = 'error', details = null) {
  logError(message, { type, ...(details && { details }) });

  const feedbackElement = document.createElement('div');
  feedbackElement.className = `feedback-message ${type}`; // Assumes .feedback-message, .error, .warning, .info CSS classes
  feedbackElement.textContent = message;
  document.body.appendChild(feedbackElement);

  // Show error messages for a bit longer
  const duration = type === 'error' ? 5000 : 3000;
  animateFeedbackMessageShow(feedbackElement, duration);
  // animateFeedbackMessageShow calls animateFeedbackMessageHide, which removes the element.
}

/**
 * Handles errors specific to a terminal session.
 * Updates the tab title and replaces the terminal content with an error placeholder.
 * @param {string} sessionId The ID of the terminal session.
 * @param {Error | {message: string}} error The error object or an object with a message property.
 * @param {object} options Options for handling the terminal error.
 * @param {HTMLElement} options.terminalContainerElement The DOM element for the terminal instance.
 * @param {HTMLElement} [options.tabElement] The DOM element for the terminal's tab.
 * @param {() => void} [options.onRetry] Optional callback function to execute when a retry button is clicked.
 */
export function handleTerminalError(sessionId, error, { terminalContainerElement, tabElement, onRetry }) {
  const errorMessage = error.message || 'An unexpected error occurred with this terminal.';
  logError(`Terminal error for session ${sessionId}: ${errorMessage}`, { sessionId, originalError: error });
  showError(`Terminal Error (ID: ${sessionId}): ${errorMessage}`, 'error');

  // Update tab title to "Terminal Error"
  if (tabElement) {
    const titleElement = tabElement.querySelector('.tab-title');
    if (titleElement) {
      titleElement.textContent = 'Terminal Error';
      titleElement.style.color = '#e74c3c'; // Consistent error color, can be moved to CSS
    }
  }

  // Replace terminal content with an error placeholder
  if (terminalContainerElement) {
    // Hide the original terminal content visually, but don't remove its listeners immediately
    // It might be better to just hide it and let the retry logic decide what to do.
    terminalContainerElement.style.display = 'none';

    const parent = terminalContainerElement.parentNode;
    if (!parent) {
        logError("Cannot display terminal error placeholder: terminal container has no parent.", {sessionId});
        return;
    }

    // Remove any existing error placeholder for this specific session to avoid duplicates
    const existingPlaceholder = parent.querySelector(`.terminal-error-placeholder[data-session-id="${sessionId}"]`);
    if (existingPlaceholder) {
      existingPlaceholder.parentNode.removeChild(existingPlaceholder);
    }

    const errorPlaceholder = document.createElement('div');
    errorPlaceholder.className = 'terminal-error-placeholder'; // Defined in terminal.css
    errorPlaceholder.dataset.sessionId = sessionId; // For potential specific styling or identification
    errorPlaceholder.innerHTML = `
      <h3>Terminal Process Error</h3>
      <p>${errorMessage}</p>
      ${onRetry ? '<button class="btn btn-primary retry-terminal-error-btn">Retry</button>' : ''}
    `;
    
    // Insert placeholder after the original container (or as its sibling)
    parent.insertBefore(errorPlaceholder, terminalContainerElement.nextSibling);

    if (onRetry) {
      const retryBtn = errorPlaceholder.querySelector('.retry-terminal-error-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          if (errorPlaceholder.parentNode) { // Check if still in DOM
            errorPlaceholder.parentNode.removeChild(errorPlaceholder);
          }
          // It's up to the onRetry callback to make the original terminal container visible again if needed
          // or to create a new terminal which would replace it.
          onRetry();
        }, { once: true }); // Ensure the retry listener is only added and fired once
      }
    }
  }
}

/**
 * Displays a system-level error message.
 * @param {string | number} [errorCode] An optional error code.
 * @param {string} errorMessage The error message to display.
 */
export function showSystemError(errorCode, errorMessage) {
  const message = `System Error ${errorCode ? '[' + errorCode + ']' : ''}: ${errorMessage}`;
  logError(message, { errorCode, type: 'system' });
  showError(message, 'error'); // Uses the general showError UI for now
  // This could be expanded to show a modal or a more prominent UI for critical system errors.
}

/**
 * A utility to create a generic error placeholder if a terminal cannot be initialized
 * and there's no specific session context yet (e.g. initial load failure).
 * @param {HTMLElement} terminalsContainer The main container where terminals are usually placed.
 * @param {string} message The error message to display.
 * @param {() => void} [onRetry] Optional callback for a retry button.
 * @returns {HTMLElement} The created placeholder element.
 */
export function createGenericErrorPlaceholder(terminalsContainer, message, onRetry) {
    if (!terminalsContainer) {
        logError("Cannot create generic error placeholder: terminalsContainer is null.");
        return null;
    }
    // Clear previous placeholders
    const existing = terminalsContainer.querySelector('.terminal-error-placeholder');
    if (existing) existing.remove();

    const placeholder = document.createElement('div');
    placeholder.className = 'terminal-error-placeholder';
    placeholder.innerHTML = `
        <h3>Application Error</h3>
        <p>${message || 'Could not initialize the terminal environment.'}</p>
        ${onRetry ? '<button class="btn btn-primary retry-generic-error-btn">Retry</button>' : ''}
    `;
    terminalsContainer.appendChild(placeholder);

    if (onRetry) {
        const retryBtn = placeholder.querySelector('.retry-generic-error-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                if (placeholder.parentNode) placeholder.remove();
                onRetry();
            }, { once: true });
        }
    }
    return placeholder;
} 