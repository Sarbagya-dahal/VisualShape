// ─── Aura E-Commerce Content Script ─────────────────────────────────
// Injected into Flipkart, Amazon, BigBasket, and all e-commerce sites.
//
// KEY FIX: Standard .click() fails on React/Vue/Angular checkout buttons.
// This script implements a 3-STRIKE CLICK ASSAULT:
//   Strike 1: element.click()
//   Strike 2: Full MouseEvent sequence (mousedown → mouseup → click)
//   Strike 3: Find parent form and submit it
//
// Also queries EVERY button, a, li, div, span, and input element.

let isAuraActive = true;

// ─── TTS ─────────────────────────────────────────────────────────────
const speak = (text) => {
  return new Promise((resolve) => {
    if (!isAuraActive) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.lang = 'en-US';
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
};

const stopSpeaking = () => {
  window.speechSynthesis.cancel();
};

// ═════════════════════════════════════════════════════════════════════
// ─── 3-STRIKE CLICK ASSAULT ──────────────────────────────────────────
// Standard .click() fails on modern React/Vue sites because they use
// synthetic event systems. This function executes 3 escalating attacks:
//
//   Strike 1: Native .click()
//   Strike 2: Full MouseEvent sequence (mousedown → mouseup → click)
//              with bubbles:true so React's event delegation catches it
//   Strike 3: If wrapped in a <form>, trigger form.submit()
// ═════════════════════════════════════════════════════════════════════

function aggressiveClick(element) {
  console.log(`[Aura EC] 3-Strike clicking: <${element.tagName}> "${(element.innerText || '').substring(0, 40)}"`);

  // Scroll into view first
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });

  setTimeout(() => {
    // ── Strike 1: Native click ──
    element.click();
    console.log('[Aura EC] Strike 1: .click()');

    // ── Strike 2: Full MouseEvent sequence ──
    const eventOpts = { bubbles: true, cancelable: true, view: window };

    element.dispatchEvent(new MouseEvent('mousedown', eventOpts));
    element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
    element.dispatchEvent(new MouseEvent('click', eventOpts));
    console.log('[Aura EC] Strike 2: mousedown → mouseup → click');

    // Also try pointer events (some modern frameworks use these)
    element.dispatchEvent(new PointerEvent('pointerdown', { ...eventOpts, pointerId: 1 }));
    element.dispatchEvent(new PointerEvent('pointerup', { ...eventOpts, pointerId: 1 }));

    // ── Strike 3: Form submit ──
    const form = element.closest('form');
    if (form) {
      try {
        form.submit();
        console.log('[Aura EC] Strike 3: form.submit()');
      } catch (e) {
        console.warn('[Aura EC] form.submit() failed:', e);
      }
    }
  }, 400);
}

/**
 * Find and aggressively click a button by text content.
 * Queries EVERY button, a, li, div, span, input element.
 */
function universalButtonClick(searchTerms) {
  // Query absolutely everything that could be clickable
  const allElements = document.querySelectorAll(
    'button, a, input[type="submit"], input[type="button"], ' +
    '[role="button"], li[role="button"], div[role="button"], ' +
    'span[role="button"], span.a-button-text, div.a-button-inner, ' +
    'span._2KpZ6l, div._2KpZ6l, span._9tvil0'
  );

  for (const el of allElements) {
    const innerText = (el.innerText || el.textContent || el.value || '').toLowerCase().trim();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();

    for (const term of searchTerms) {
      if (innerText === term || innerText.includes(term) ||
          ariaLabel.includes(term) || title.includes(term)) {

        // Verify visible
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden') {

          console.log(`[Aura EC] ✓ Found: "${innerText.substring(0, 50)}" via "${term}"`);
          aggressiveClick(el);
          return { clicked: true, text: innerText.substring(0, 80) };
        }
      }
    }
  }

  // Aggressive fallback: scan ALL DOM elements for exact text match
  const everything = document.querySelectorAll('*');
  for (const el of everything) {
    if (el.children.length > 5) continue; // Skip containers
    const text = (el.innerText || '').toLowerCase().trim();
    for (const term of searchTerms) {
      if (text === term) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log(`[Aura EC] ✓ Aggressive fallback: "${text}" on <${el.tagName}>`);
          aggressiveClick(el);
          return { clicked: true, text };
        }
      }
    }
  }

  return { clicked: false, text: '' };
}

function findTextBySelectors(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    } catch (e) {}
  }
  return null;
}

// ─── Site Config ─────────────────────────────────────────────────────
function getSiteConfig() {
  const host = window.location.hostname;

  if (host.includes('flipkart')) {
    return {
      name: 'Flipkart',
      addToCartTerms: ['add to cart'],
      buyNowTerms: ['buy now'],
      titleSelectors: ['h1 span', '.VU-ZEz', '.B_NuCI', '._35KyD6', 'h1'],
      priceSelectors: ['._30jeq3', '.Nx9bqj', '._16Jk6d', '.CEmiEU div'],
      descriptionSelectors: ['._1mXcCf', '._2418kt', '.X3BRps'],
      cartUrl: 'https://www.flipkart.com/viewcart'
    };
  }

  if (host.includes('amazon')) {
    return {
      name: 'Amazon',
      addToCartTerms: ['add to cart', 'add to basket'],
      buyNowTerms: ['buy now', 'proceed to buy'],
      titleSelectors: ['#productTitle', 'h1 span#productTitle', 'h1'],
      priceSelectors: ['.priceToPay .a-offscreen', '.a-price .a-offscreen', '.a-price-whole'],
      descriptionSelectors: ['#feature-bullets ul', '#productDescription p'],
      cartUrl: 'https://www.amazon.in/gp/cart/view.html'
    };
  }

  if (host.includes('bigbasket')) {
    return {
      name: 'BigBasket',
      addToCartTerms: ['add to basket', 'add to bag', 'add', 'add to cart'],
      buyNowTerms: ['buy now'],
      titleSelectors: ['h1', '[data-qa="product-name"]', '.prod-name'],
      priceSelectors: ['[data-qa="product-price"]', '.discnt-price', '.sp'],
      descriptionSelectors: ['.description-text', '.prod-desc'],
      cartUrl: 'https://www.bigbasket.com/basket/'
    };
  }

  if (host.includes('justdial')) {
    return {
      name: 'JustDial',
      addToCartTerms: [],
      buyNowTerms: [],
      bookNowTerms: ['book now', 'contact', 'get quotes', 'call now', 'enquire', 'request callback'],
      titleSelectors: ['h1', 'span.lng_cont_name', 'a.lng_cont_name', 'h2'],
      priceSelectors: ['span[class*="price"]', 'span[class*="cost"]'],
      descriptionSelectors: ['.store-details', '.about-info'],
      cartUrl: null
    };
  }

  if (host.includes('urbancompany') || host.includes('urbanclap')) {
    return {
      name: 'UrbanCompany',
      addToCartTerms: ['add'],
      buyNowTerms: [],
      bookNowTerms: ['book now', 'add to cart', 'select', 'view details', 'book'],
      titleSelectors: ['h1', '[data-testid="service-name"]', '.service-name'],
      priceSelectors: ['[data-testid="service-price"]', '.price', '.amount'],
      descriptionSelectors: ['.service-description', '.about-service'],
      cartUrl: null
    };
  }

  return {
    name: 'Store',
    addToCartTerms: ['add to cart', 'add to bag', 'add to basket'],
    buyNowTerms: ['buy now', 'buy this', 'purchase', 'checkout'],
    bookNowTerms: ['book now', 'hire', 'contact', 'request', 'enquire', 'get quote'],
    titleSelectors: ['h1', '[itemprop="name"]', '.product-title'],
    priceSelectors: ['[itemprop="price"]', '.price', '.product-price'],
    descriptionSelectors: ['[itemprop="description"]', '.product-description'],
    cartUrl: null
  };
}

// ─── Voice Listener ──────────────────────────────────────────────────
const setupVoiceListener = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const startRecognition = () => {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      console.log('[Aura EC] Heard:', transcript);
      handleCommand(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('[Aura EC] Error:', event.error);
      }
    };

    recognition.onend = () => {
      if (isAuraActive) {
        setTimeout(() => { if (isAuraActive) startRecognition(); }, 200);
      }
    };

    try { recognition.start(); }
    catch (e) { setTimeout(() => { if (isAuraActive) startRecognition(); }, 1000); }
  };

  startRecognition();
};

// ─── Command Handler ─────────────────────────────────────────────────
const handleCommand = async (command) => {
  const config = getSiteConfig();

  if (command.includes('stop') || command.includes('quiet') || command.includes('shut up')) {
    stopSpeaking(); return;
  }

  if (command.includes('add to cart') || command.includes('add to bag') || command.includes('add to basket')) {
    await speak('Finding add to cart button...');
    const r = universalButtonClick(config.addToCartTerms);
    await speak(r.clicked ? 'Added to cart.' : 'Could not find add to cart button. Try saying help.');
    return;
  }

  if (command.includes('buy now') || command.includes('buy this') || command.includes('purchase')) {
    await speak('Finding buy now button...');
    const r = universalButtonClick(config.buyNowTerms);
    await speak(r.clicked ? 'Processing purchase.' : 'Could not find buy now button.');
    return;
  }

  // ── BOOK NOW / HIRE / CONTACT ── (Service/Gig platforms)
  if (command.includes('book now') || command.includes('book this') ||
      command.includes('hire') || command.includes('contact') || command.includes('request')) {
    await speak('Finding the booking button...');
    const bookTerms = config.bookNowTerms || ['book now', 'hire', 'contact', 'request', 'enquire'];
    const r = universalButtonClick(bookTerms);
    await speak(r.clicked ? 'Booking initiated.' : 'Could not find the booking button. Try scrolling down or saying help.');
    return;
  }

  if (command.includes('price') || command.includes('how much') || command.includes('cost')) {
    const price = findTextBySelectors(config.priceSelectors);
    await speak(price ? `The price is ${price}` : 'Could not find the price.');
    return;
  }

  if (command.includes('title') || command.includes('what is this') || command.includes('what product')) {
    const title = findTextBySelectors(config.titleSelectors);
    await speak(title ? `This product is: ${title.substring(0, 200)}` : 'Could not find title.');
    return;
  }

  if (command.includes('description') || command.includes('details') || command.includes('features')) {
    const desc = findTextBySelectors(config.descriptionSelectors);
    await speak(desc ? `Details: ${desc.substring(0, 500)}` : 'Could not find description.');
    return;
  }

  if (command.includes('cart') || command.includes('checkout') || command.includes('basket')) {
    if (config.cartUrl) {
      await speak('Going to cart.');
      window.location.href = config.cartUrl;
    } else {
      const link = document.querySelector('a[href*="cart"], a[href*="basket"]');
      if (link) { await speak('Going to cart.'); link.click(); }
      else await speak('Could not find cart.');
    }
    return;
  }

  if (command.includes('go back') || command.includes('back')) {
    await speak('Going back.'); window.history.back(); return;
  }

  if (command.includes('scroll down') || command.includes('more')) {
    window.scrollBy({ top: 600, behavior: 'smooth' }); return;
  }

  if (command.includes('help') || command.includes('what can i say')) {
    await speak(`You are on ${config.name}. Say: add to cart, buy now, read price, read title, go to cart, go back, or stop.`);
    return;
  }
};

// ─── Init ────────────────────────────────────────────────────────────
(() => {
  const config = getSiteConfig();
  console.log(`[Aura EC] Loaded on ${config.name} (${window.location.hostname})`);

  setTimeout(async () => {
    const title = findTextBySelectors(config.titleSelectors);
    const price = findTextBySelectors(config.priceSelectors);

    let msg = `${config.name} page loaded. `;
    if (title) msg += `Product: ${title.substring(0, 100)}. `;
    if (price) msg += `Price: ${price}. `;
    msg += 'Say add to cart, buy now, or help.';

    await speak(msg);
    setupVoiceListener();
  }, 2500);
})();
