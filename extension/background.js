// ─── Aura Extension Background Service Worker (Manifest V3) ─────────
// Central message router for all Aura extension communication.
//
// Handles messages from:
//   1. relay.js (localhost React app → postMessage → relay → here)
//   2. External messaging (chrome.runtime.sendMessage with extension ID)
//   3. Content scripts (youtube.js, ecommerce.js)

// ── External messaging (from React app via externally_connectable) ──
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('[Aura BG] External message from:', sender.origin, request);
  handleAuraMessage(request, sender, sendResponse);
  return true;
});

// ── Internal messaging (from content scripts: relay, youtube, ecommerce) ──
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Aura BG] Internal message from:', sender.tab?.url || 'unknown', request);
  handleAuraMessage(request, sender, sendResponse);
  return true;
});

function handleAuraMessage(request, sender, sendResponse) {
  if (request.type === 'AURA_INTENT') {
    const { intent, entities } = request.payload || {};

    if (intent === 'OPEN_YOUTUBE') {
      const query = entities && entities.length > 0 ? entities[0] : '';
      const url = query
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : 'https://www.youtube.com';

      console.log(`[Aura BG] Opening YouTube: ${url}`);

      chrome.tabs.create({ url }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('[Aura BG] Tab creation failed:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log(`[Aura BG] YouTube tab created: ${tab.id}`);
          sendResponse({ success: true, tabId: tab.id });
        }
      });
      return;
    }

    if (intent === 'OPEN_URL') {
      const url = entities && entities.length > 0 ? entities[0] : '';
      if (url) {
        chrome.tabs.create({ url }, (tab) => {
          sendResponse({ success: true, tabId: tab.id });
        });
      } else {
        sendResponse({ success: false, error: 'No URL provided' });
      }
      return;
    }

    sendResponse({ success: false, error: `Unknown intent: ${intent}` });
  }
}

// ── Log install/update ──
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Aura BG] Extension ${details.reason}. ID: ${chrome.runtime.id}`);
});
