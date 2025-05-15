/**
 * Handles CSS-based animations for the terminal application.
 */

/**
 * Triggers a CSS animation on an element and removes the class after completion.
 * Relies on the CSS animation/transition to define its own duration.
 * Listens for 'animationend' or 'transitionend'.
 * @param {HTMLElement} element The element to animate.
 * @param {string} animationClass The CSS class that applies the animation.
 * @param {() => void} [onComplete] Optional callback to execute after animation.
 */
export function triggerAnimation(element, animationClass, onComplete) {
  if (!element || !animationClass) {
    if (onComplete) onComplete();
    return;
  }

  let eventFired = false;

  const listener = (event) => {
    // Ensure the event is for the element itself and not a child
    if (event.target !== element) {
        return;
    }
    
    element.classList.remove(animationClass);
    element.removeEventListener('animationend', listener);
    element.removeEventListener('transitionend', listener);
    
    if (!eventFired) {
        eventFired = true;
        if (onComplete) {
            onComplete();
        }
    }
  };

  element.classList.add(animationClass);
  element.addEventListener('animationend', listener);
  element.addEventListener('transitionend', listener);

  // Fallback: Check if the animation/transition has a duration.
  // If not, or if it's 0, execute cleanup immediately.
  const style = getComputedStyle(element);
  const duration = Math.max(
    parseFloat(style.animationDuration || '0'),
    parseFloat(style.transitionDuration || '0')
  ) * 1000;

  if (duration === 0) {
    // If no duration, the event might not fire reliably or immediately.
    // Execute listener logic after a very short timeout to allow class application.
    setTimeout(() => {
        if (element.classList.contains(animationClass) && !eventFired) { // Check if still relevant
             // console.warn(\`Immediate cleanup for ${animationClass} on ${element.id || element.className}\`);
             listener({target: element}); // Simulate event
        } else if (!eventFired && onComplete) {
            // If class was removed by other means or never properly applied, still call onComplete
            onComplete();
        }
    }, 20); // Small delay
  } else {
    // Safety timeout if transitionend/animationend doesn't fire for some reason
    setTimeout(() => {
      if (element.classList.contains(animationClass) && !eventFired) {
        // console.warn(\`Fallback cleanup for ${animationClass} on ${element.id || element.className}\`);
        listener({target: element}); // Simulate event
      }
    }, duration + 100); // Add a buffer
  }
}


/**
 * Fades in an element by adding an active class that triggers a CSS transition.
 * @param {HTMLElement} element The element to fade in.
 * @param {string} activeClass The class to make it visible (e.g., 'active', 'show').
 * @param {string} [transitionClass] Optional class to define the fade-in transition properties. 
 *                                   If not provided, assumes base style of element or activeClass handles transition.
 * @param {() => void} [onComplete] Optional callback.
 */
export function fadeIn(element, activeClass, transitionClass, onComplete) {
  if (!element) {
    if (onComplete) onComplete();
    return;
  }

  if (transitionClass) {
    element.classList.add(transitionClass);
  }
  
  // Ensure initial styles (opacity 0 etc.) are set before adding active class
  // This might require the element to have a base class that sets opacity: 0
  // or the transitionClass itself could set initial opacity: 0.
  
  requestAnimationFrame(() => {
    element.classList.add(activeClass);
    
    let eventFired = false;
    const listener = (event) => {
      if (event.target !== element) return;
      if (transitionClass) {
        element.classList.remove(transitionClass);
      }
      element.removeEventListener('transitionend', listener);
      if (!eventFired) {
        eventFired = true;
        if (onComplete) onComplete();
      }
    };
    element.addEventListener('transitionend', listener);

    const style = getComputedStyle(element);
    const duration = parseFloat(style.transitionDuration || '0') * 1000;

    if (duration === 0) {
        setTimeout(() => {
            if (!eventFired) listener({target: element});
        }, 20);
    } else {
        setTimeout(() => {
            if (!eventFired && element.classList.contains(activeClass)) {
                // console.warn(\`FadeIn fallback for ${element.id || element.className}\`);
                listener({target: element});
            }
        }, duration + 50);
    }
  });
}

/**
 * Fades out an element by removing an active class that triggers a CSS transition.
 * @param {HTMLElement} element The element to fade out.
 * @param {string} activeClass The class that makes it visible (will be removed).
 * @param {string} [transitionClass] Optional class to define the fade-out transition properties.
 * @param {() => void} [onComplete] Callback after fade out (e.g., element.remove()).
 */
export function fadeOut(element, activeClass, transitionClass, onComplete) {
  if (!element) {
    if (onComplete) onComplete();
    return;
  }

  if (transitionClass) {
    element.classList.add(transitionClass);
  }
  
  requestAnimationFrame(() => {
    element.classList.remove(activeClass); // Trigger transition by removing active state

    let eventFired = false;
    const listener = (event) => {
      if (event.target !== element) return;
      if (transitionClass) {
        element.classList.remove(transitionClass);
      }
      element.removeEventListener('transitionend', listener);
      if (!eventFired) {
        eventFired = true;
        if (onComplete) onComplete();
      }
    };
    element.addEventListener('transitionend', listener);

    const style = getComputedStyle(element);
    const duration = parseFloat(style.transitionDuration || '0') * 1000;
    
    if (duration === 0) {
        setTimeout(() => {
            if (!eventFired) listener({target: element});
        }, 20);
    } else {
        setTimeout(() => {
            if (!eventFired && !element.classList.contains(activeClass)) {
                // console.warn(\`FadeOut fallback for ${element.id || element.className}\`);
                listener({target: element});
            }
        }, duration + 50);
    }
  });
}

/**
 * Animates a tab appearing.
 * @param {HTMLElement} tabElement The tab element.
 */
export function animateTabAppear(tabElement) {
  if (!tabElement) return;
  // Assumes CSS:
  // .tab { opacity: 0; transform: translateY(-10px); /* initial state */ }
  // .tab-appear-setup { /* might not be needed if base .tab style is sufficient */ }
  // .tab-appear-active { opacity: 1; transform: translateY(0); transition: opacity .3s, transform .3s; }
  
  // Set initial state if not handled by base CSS
  tabElement.style.opacity = '0';
  tabElement.style.transform = 'translateY(-10px)';
  
  requestAnimationFrame(() => { // Ensure initial styles are applied
      triggerAnimation(tabElement, 'tab-appear-active', () => {
        // Cleanup: remove style overrides if 'tab-appear-active' is temporary
        // and final state is handled by .tab.active or similar
        tabElement.style.opacity = '';
        tabElement.style.transform = '';
      });
  });
}

/**
 * Animates a tab closing.
 * @param {HTMLElement} tabElement The tab element.
 * @param {() => void} onComplete Callback after animation.
 */
export function animateTabClose(tabElement, onComplete) {
  if (!tabElement) {
    if (onComplete) onComplete();
    return;
  }
  // Assumes CSS:
  // .tab-closing-active { opacity: 0; transform: scale(0.9); transition: opacity .2s, transform .2s; }
  triggerAnimation(tabElement, 'tab-closing-active', onComplete);
}

/**
 * Handles theme transition by adding/removing a class on the body.
 * CSS should define transitions for elements affected by the theme change.
 * @param {() => void} applyThemeCallback Callback to apply the theme changes (e.g., changing class on root).
 * @param {number} [transitionDurationHint] Optional hint for CSS transition duration, used for fallback.
 */
export function animateThemeChange(applyThemeCallback, transitionDurationHint = 300) {
  document.body.classList.add('theme-transition-active');
  
  // Apply theme changes. CSS will handle the visual transition.
  if (applyThemeCallback) {
    applyThemeCallback();
  }
  
  // Remove the class after the transition is expected to be done.
  // Relies on CSS to define the actual transition duration.
  // The 'triggerAnimation' pattern isn't ideal here as we're not animating the body itself
  // but rather enabling transitions on child elements.
  setTimeout(() => {
    document.body.classList.remove('theme-transition-active');
  }, transitionDurationHint + 50); // Add a small buffer
}

/**
 * Shows a feedback message with animation.
 * @param {HTMLElement} feedbackElement The feedback message element.
 * @param {number} autoHideDelay Delay in ms before automatically hiding. 0 to disable auto-hide.
 */
export function animateFeedbackMessageShow(feedbackElement, autoHideDelay = 3000) {
    if (!feedbackElement) return;

    // Ensure it's ready for animation (e.g., display: flex or block)
    // feedbackElement.style.display = 'flex'; // Or whatever its display type is
    
    // Add class to trigger appear animation.
    // Assumes .feedback-message-show sets opacity: 1, transform: translateY(0)
    // and .feedback-message (base) has opacity:0, transform: translateY(100%) and transition properties
    triggerAnimation(feedbackElement, 'feedback-message-show', () => {
        // Animation to show is complete. If autoHideDelay is set, start hide timer.
        if (autoHideDelay > 0) {
            setTimeout(() => {
                // Check if element still exists and is visible before hiding
                if (feedbackElement && feedbackElement.classList.contains('feedback-message-show')) {
                    animateFeedbackMessageHide(feedbackElement);
                }
            }, autoHideDelay);
        }
    });
}

/**
 * Hides a feedback message with animation.
 * @param {HTMLElement} feedbackElement The feedback message element.
 * @param {() => void} [onComplete] Optional callback after hiding (e.g., to remove element).
 */
export function animateFeedbackMessageHide(feedbackElement, onComplete) {
    if (!feedbackElement) {
        if (onComplete) onComplete();
        return;
    }
    
    // Add class to trigger hide animation.
    // Assumes .feedback-message-hide sets opacity: 0, transform: translateY(100%)
    // The actual removal of the element should happen in onComplete if needed.
    triggerAnimation(feedbackElement, 'feedback-message-hide', () => {
        // After hiding, remove the show class and hide class. Element might be reused.
        feedbackElement.classList.remove('feedback-message-show');
        // feedbackElement.style.display = 'none'; // Or remove from DOM
        if (feedbackElement.parentNode) { // Ensure it's still in DOM before trying to remove
            feedbackElement.parentNode.removeChild(feedbackElement);
        }

        if (onComplete) onComplete();
    });
}

/**
 * Animate terminal activation (fade in new, fade out old).
 * @param {HTMLElement} newTerminalContainer The terminal container to activate.
 * @param {HTMLElement | null} oldTerminalContainer The currently active terminal container (or null).
 * @param {() => void} onComplete Callback when all transitions are complete and new terminal is active.
 */
export function animateTerminalActivation(newTerminalContainer, oldTerminalContainer, onComplete) {
    const transitionDuration = 150; // ms, should match CSS transition-duration for terminals.

    const completeActivation = () => {
        newTerminalContainer.classList.remove('terminal-fade-in-active'); // Clean up animation class
        newTerminalContainer.classList.add('active'); // Ensure final active state
        if (onComplete) {
            onComplete();
        }
    };

    if (oldTerminalContainer) {
        // Start fade out of old terminal
        oldTerminalContainer.classList.add('terminal-fade-out-active'); // This class should trigger opacity:0 and perhaps visibility:hidden after transition
        oldTerminalContainer.classList.remove('active');

        // Prepare new terminal (initially hidden or opacity 0)
        newTerminalContainer.classList.remove('active'); // Ensure it's not 'active' yet if styles conflict
        newTerminalContainer.classList.add('terminal-fade-in-prepare'); // e.g., opacity: 0, visibility: visible (to allow transition)
        newTerminalContainer.style.display = 'block'; // Make sure it's not display:none

        // Use transitionend on the old terminal to sequence animations reliably
        let oldTerminalTransitionEnded = false;
        const oldTerminalListener = (event) => {
            if (event.target !== oldTerminalContainer || oldTerminalTransitionEnded) return;
            oldTerminalTransitionEnded = true;
            oldTerminalContainer.removeEventListener('transitionend', oldTerminalListener);
            oldTerminalContainer.classList.remove('terminal-fade-out-active'); // Clean up
            oldTerminalContainer.style.display = 'none'; // Hide it properly after fade out

            // Start fade in of new terminal
            newTerminalContainer.classList.remove('terminal-fade-in-prepare');
            triggerAnimation(newTerminalContainer, 'terminal-fade-in-active', completeActivation);
            // 'terminal-fade-in-active' should trigger opacity:1
        };
        oldTerminalContainer.addEventListener('transitionend', oldTerminalListener);
        
        // Fallback if transitionend doesn't fire for old terminal
        setTimeout(() => {
            if (!oldTerminalTransitionEnded) {
                // console.warn('Old terminal fade-out fallback triggered.');
                oldTerminalListener({target: oldTerminalContainer}); // Simulate event
            }
        }, transitionDuration + 50); 

    } else {
        // No old terminal, just fade in the new one
        newTerminalContainer.classList.remove('active');
        newTerminalContainer.classList.add('terminal-fade-in-prepare');
        newTerminalContainer.style.display = 'block'; // Make sure it's not display:none
        
        requestAnimationFrame(() => { // Ensure preparation styles are applied
            triggerAnimation(newTerminalContainer, 'terminal-fade-in-active', completeActivation);
        });
    }
}

/**
 * Animates a "copied" visual feedback on an element.
 * @param {HTMLElement} element The element to apply feedback to.
 * @param {string} activeClass The class to add for the "copied" state (e.g., 'copied-feedback-active').
 * @param {number} duration Duration to keep the feedback class (ms).
 */
export function animateCopiedFeedback(element, activeClass, duration) {
    if (!element || !activeClass) return;
    element.classList.add(activeClass);
    setTimeout(() => {
        element.classList.remove(activeClass);
    }, duration);
    // This one is simple enough that a CSS animation with 'forwards' and then JS removal
    // might be overkill, but triggerAnimation could be used if CSS defined a short animation.
} 