// ─── Aura Relay Content Script (MV3 Compliant) ─────────────────────
// Injected into localhost pages (the React frontend).
// Bridges window.postMessage from the React app to
// chrome.runtime.sendMessage for the background service worker.
//
// ⚠ NO INLINE SCRIPT INJECTION — uses DOM custom events instead
//   to share the extension ID with the React app.

// ── Relay: React postMessage → Extension background ──
window.addEventListener('message', (event) => {
  // Only accept messages from the same window (our React app)
  if (event.source !== window) return;

  if (event.data && event.data.type === 'AURA_INTENT') {
    console.log('[Aura Relay] Forwarding message to background:', event.data);

    chrome.runtime.sendMessage(event.data, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Aura Relay] Error:', chrome.runtime.lastError);
        // Post the error back so the React app knows
        window.postMessage({
          type: 'AURA_RESPONSE',
          success: false,
          error: chrome.runtime.lastError.message
        }, '*');
      } else {
        console.log('[Aura Relay] Background response:', response);
        // Post the success back to the React app
        window.postMessage({
          type: 'AURA_RESPONSE',
          ...response
        }, '*');
      }
    });
  }
});

// ── Share Extension ID via CustomEvent (CSP-safe, no inline script) ──
// The React app listens for this event to get the extension ID
document.dispatchEvent(new CustomEvent('AURA_EXTENSION_READY', {
  detail: { extensionId: chrome.runtime.id }
}));

// Also set a data attribute on <html> — React can read this synchronously
document.documentElement.setAttribute('data-aura-extension-id', chrome.runtime.id);

console.log('[Aura Relay] Relay content script loaded. Extension ID:', chrome.runtime.id);
