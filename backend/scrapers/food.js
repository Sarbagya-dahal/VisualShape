import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const PLACEHOLDER_IMG = 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Grocery+Item';

/**
 * Scrape LIVE grocery data from Blinkit using Puppeteer.
 * 
 * HARD-ROUTED: Food/grocery queries ALWAYS target Blinkit.
 * BigBasket has aggressive bot protection. Blinkit is more scrapable.
 *
 * STRATEGY (structural selectors):
 *   - Product card: div[role="button"][id] (each has numeric ID)
 *   - Title: text content inside nested divs
 *   - Price: text containing ₹ symbol
 *   - Image: img tag within the card (check src, data-src)
 *   - URL: https://blinkit.com/prn/{slug}/prid/{id}
 *
 * Returns up to 12 products with REAL data.
 */
export default async function scrapeFood(rawQuery) {
  const query = rawQuery.trim();
  console.log(`[Food Scraper] Searching Blinkit for: "${query}"`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Block heavy assets but keep images
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['font', 'media', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ── TARGET: Blinkit search ──
    const searchUrl = `https://blinkit.com/s/?q=${encodeURIComponent(query)}`;
    console.log(`[Food Scraper] Navigating: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 35000 });

    // Blinkit may ask for location. Try setting one.
    // Wait a moment for SPA to hydrate
    await new Promise(r => setTimeout(r, 3000));

    // Look for location prompt and try to dismiss/handle it
    await page.evaluate(() => {
      // Try clicking "Detect my location" or close button if present
      const detectBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.toLowerCase().includes('detect'));
      if (detectBtn) detectBtn.click();
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 2000));

    // Wait for product cards (structural selector)
    await page.waitForSelector('div[role="button"], a[href*="/prn/"], div[class*="Product"]', {
      timeout: 12000
    }).catch(() => {
      console.warn('[Food Scraper] Product selector not found on Blinkit');
    });

    // Scroll to trigger lazy images
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 800));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    // ═══════════════════════════════════════════════════════════════════
    // EXTRACTION: Structural selectors for Blinkit
    // ═══════════════════════════════════════════════════════════════════
    const products = await page.evaluate((placeholder) => {
      const items = [];
      const seenIds = new Set();

      // STRATEGY 1: div[role="button"][id] — Blinkit product cards
      let cards = document.querySelectorAll('div[role="button"][id]');
      
      // STRATEGY 2: Links to product pages
      if (cards.length === 0) {
        const links = document.querySelectorAll('a[href*="/prn/"]');
        const parents = new Set();
        links.forEach(a => {
          const parent = a.closest('div[role="button"]') || a.closest('div[id]') || a.parentElement;
          if (parent) parents.add(parent);
        });
        cards = Array.from(parents);
      }

      // STRATEGY 3: Any container with images and price text
      if (cards.length === 0) {
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          const hasImg = div.querySelector('img');
          const hasPrice = div.textContent.includes('₹');
          const isSmall = div.querySelectorAll('div').length < 15;
          if (hasImg && hasPrice && isSmall) {
            cards = [div, ...Array.from(div.parentElement?.children || [])].filter(c => 
              c.querySelector('img') && c.textContent.includes('₹')
            );
            if (cards.length > 2) break;
          }
        }
      }

      for (const card of cards) {
        if (items.length >= 12) break;

        const id = card.getAttribute('id') || card.getAttribute('data-id') || `gen-${items.length}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        // ── TITLE: Extract from text content ──
        let title = null;
        // Look for the product name — usually a div/span with moderate text
        const allText = card.querySelectorAll('div, span, p');
        const textCandidates = [];
        for (const el of allText) {
          const text = el.textContent.trim();
          // Product names are typically 5-100 chars, no ₹ symbol
          if (text.length >= 5 && text.length <= 120 &&
              !text.includes('₹') && !text.includes('Add') &&
              !text.includes('OFF') && !text.includes('%') &&
              el.children.length <= 2) {
            textCandidates.push({ el, text, len: text.length });
          }
        }
        // Take the longest reasonable text as the title
        textCandidates.sort((a, b) => b.len - a.len);
        if (textCandidates.length > 0) {
          title = textCandidates[0].text;
        }

        // Fallback: check for aria-label
        if (!title) {
          const ariaLabel = card.getAttribute('aria-label');
          if (ariaLabel && ariaLabel.length > 5) title = ariaLabel;
        }

        if (!title || title.length < 3) continue;

        // ── PRICE: Find ₹ symbol ──
        let price = null;
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
          const text = walker.currentNode.textContent.trim();
          if (text.startsWith('₹') && text.length < 12) {
            price = text;
            break;
          }
        }
        if (!price) {
          // Regex fallback on card's full text
          const priceMatch = card.textContent.match(/₹\s*[\d,]+/);
          if (priceMatch) price = priceMatch[0].trim();
        }
        if (!price) continue;

        // ── IMAGE: img inside card ──
        let image = null;
        const imgs = card.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.getAttribute('src');
          const dataSrc = img.getAttribute('data-src');

          if (src && src.startsWith('http') && !src.includes('data:image') &&
              !src.includes('placeholder') && src.length > 30) {
            image = src;
            break;
          } else if (dataSrc && dataSrc.startsWith('http')) {
            image = dataSrc;
            break;
          } else if (src && src.startsWith('//')) {
            image = `https:${src}`;
            break;
          }
        }

        // ★ MANDATORY IMAGE FALLBACK ★
        if (!image || !image.startsWith('http')) {
          image = placeholder;
        }

        // ── URL: Build from ID or find link ──
        let url = null;
        const linkEl = card.querySelector('a[href*="/prn/"]') || card.querySelector('a[href]');
        if (linkEl) {
          const href = linkEl.getAttribute('href');
          if (href && href.startsWith('http')) url = href;
          else if (href && href.startsWith('/')) url = `https://blinkit.com${href}`;
        }
        if (!url) {
          // Build URL from title slug
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          url = `https://blinkit.com/prn/${slug}/prid/${id}`;
        }

        items.push({ title, price, image, url });
      }

      return items;
    }, PLACEHOLDER_IMG);

    await browser.close();
    browser = null;

    if (products.length > 0) {
      console.log(`[Food Scraper] ✓ Extracted ${products.length} LIVE products from Blinkit`);
      // Server-side image safety net
      return products.map(p => ({
        ...p,
        image: (p.image && p.image.startsWith('http')) ? p.image : PLACEHOLDER_IMG
      }));
    }

    // ═══════════════════════════════════════════════════════════════════
    // FALLBACK: If Blinkit fails, try BigBasket
    // ═══════════════════════════════════════════════════════════════════
    console.warn('[Food Scraper] Blinkit returned no products, trying BigBasket...');
    return await scrapeBigBasketFallback(query);

  } catch (error) {
    console.error('[Food Scraper] Blinkit failed:', error.message);
    if (browser) await browser.close().catch(() => {});
    return await scrapeBigBasketFallback(query);
  }
}

/**
 * BigBasket fallback scraper.
 * Used when Blinkit fails. Same structural extraction approach.
 */
async function scrapeBigBasketFallback(query) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    const searchUrl = `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`;
    console.log(`[Food Scraper] BigBasket fallback: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait & scroll
    await new Promise(r => setTimeout(r, 3000));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 800));
    }

    const products = await page.evaluate((placeholder) => {
      const items = [];

      // Find product links (structural)
      const productLinks = document.querySelectorAll('a[href*="/pd/"]');
      const seenHrefs = new Set();

      for (const link of productLinks) {
        if (items.length >= 12) break;

        const href = link.getAttribute('href');
        if (!href || seenHrefs.has(href)) continue;
        seenHrefs.add(href);

        const parent = link.closest('div') || link.parentElement;
        if (!parent) continue;

        // Title
        const title = link.getAttribute('title') || link.textContent.trim();
        if (!title || title.length < 3) continue;

        // Price — walk parent for ₹
        let price = null;
        const container = link.closest('div')?.parentElement || parent;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent.trim();
          if (t.startsWith('₹') && t.length < 12) { price = t; break; }
        }
        if (!price) {
          const pm = container.textContent.match(/₹\s*[\d,.]+/);
          if (pm) price = pm[0];
        }
        if (!price) continue;

        // Image
        let image = null;
        const img = parent.querySelector('img') || container.querySelector('img');
        if (img) {
          const src = img.getAttribute('src');
          const ds = img.getAttribute('data-src');
          if (src && src.startsWith('http') && !src.includes('data:image') && src.length > 30) image = src;
          else if (ds && ds.startsWith('http')) image = ds;
          else if (src && src.startsWith('//')) image = `https:${src}`;
        }
        if (!image || !image.startsWith('http')) image = placeholder;

        // URL
        let url = href.startsWith('http') ? href : `https://www.bigbasket.com${href}`;

        items.push({ title: title.substring(0, 120), price, image, url });
      }

      return items;
    }, PLACEHOLDER_IMG);

    await browser.close();

    if (products.length > 0) {
      console.log(`[Food Scraper] ✓ BigBasket fallback: ${products.length} products`);
      return products.map(p => ({
        ...p,
        image: (p.image && p.image.startsWith('http')) ? p.image : PLACEHOLDER_IMG
      }));
    }

    // Final fallback: single redirect item
    return getSearchRedirect(query);

  } catch (error) {
    console.error('[Food Scraper] BigBasket fallback failed:', error.message);
    if (browser) await browser.close().catch(() => {});
    return getSearchRedirect(query);
  }
}

/**
 * Last resort: return a single "Open on Blinkit" item.
 * No fake template data. User clicks to go to the actual site.
 */
function getSearchRedirect(query) {
  console.warn('[Food Scraper] All scrapers failed, returning search redirect');
  return [
    {
      title: `Search Blinkit for: "${query}"`,
      price: 'View on Blinkit',
      image: 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Open+Blinkit',
      url: `https://blinkit.com/s/?q=${encodeURIComponent(query)}`,
      fallback: true
    },
    {
      title: `Search BigBasket for: "${query}"`,
      price: 'View on BigBasket',
      image: 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Open+BigBasket',
      url: `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
      fallback: true
    }
  ];
}
