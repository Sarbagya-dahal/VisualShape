import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { augmentQueryForAccessibility } from './queryAugment.js';

puppeteer.use(StealthPlugin());

const PLACEHOLDER_IMG = 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Product';

/**
 * Scrape LIVE Flipkart search results using Puppeteer.
 * 
 * STRATEGY: Uses attribute-based and structural selectors instead of
 * Flipkart's obfuscated CSS class names (which rotate every deployment).
 * 
 * Key structural selectors:
 *   - Product link: a[href*="/p/"][title]  (title attr = full product name)
 *   - Image: img inside first a[href*="/p/"]
 *   - Price: text node containing ₹ symbol near the title
 *   - URL: prepend https://www.flipkart.com to the href
 * 
 * Returns up to 12 products with REAL titles, images, prices, and URLs.
 */
export default async function scrapeFlipkart(rawQuery) {
  const query = augmentQueryForAccessibility(rawQuery, 'shopping');
  console.log(`[Flipkart] Original: "${rawQuery}" → Augmented: "${query}"`);

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

    // Block heavy assets but KEEP images (we need them)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['font', 'media', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
    console.log(`[Flipkart] Navigating: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Close login popup if present
    await page.evaluate(() => {
      // Try multiple close button selectors
      const closeBtns = document.querySelectorAll('button._2KpZ6l._2doB4z, button[class*="close"], span._30XB89');
      closeBtns.forEach(b => b.click());
    }).catch(() => {});

    // Wait for product links to appear (structural — not class-based)
    await page.waitForSelector('a[href*="/p/"]', { timeout: 15000 }).catch(() => {
      console.warn('[Flipkart] No product links found via a[href*="/p/"]');
    });

    // Scroll slowly to trigger ALL lazy-loaded images
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 600));
    }
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    // ═══════════════════════════════════════════════════════════════════
    // EXTRACTION: Uses STRUCTURAL selectors that survive class rotation
    // ═══════════════════════════════════════════════════════════════════
    const products = await page.evaluate((placeholder) => {
      const items = [];
      const seenUrls = new Set(); // Deduplicate

      // STRATEGY 1: Find all product links with title attributes
      // Flipkart puts the full product name in the <a> tag's title attribute
      const productLinks = document.querySelectorAll('a[href*="/p/"]');
      
      // Group links by their href (multiple links per product card)
      const productMap = new Map();
      productLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || !href.includes('/p/')) return;
        
        // Normalize: strip query params for grouping
        const baseHref = href.split('?')[0];
        if (!productMap.has(baseHref)) {
          productMap.set(baseHref, []);
        }
        productMap.get(baseHref).push(link);
      });

      for (const [baseHref, links] of productMap) {
        if (items.length >= 12) break;
        
        const fullUrl = `https://www.flipkart.com${baseHref}`;
        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);

        // ── TITLE: Get from title attribute, or innerText ──
        let title = null;
        for (const link of links) {
          const titleAttr = link.getAttribute('title');
          if (titleAttr && titleAttr.length > 5) {
            title = titleAttr.trim();
            break;
          }
        }
        // Fallback: longest text content among the links
        if (!title) {
          for (const link of links) {
            const text = link.textContent.trim();
            if (text.length > 10 && (!title || text.length > title.length)) {
              title = text;
            }
          }
        }
        if (!title || title.length < 5) continue;

        // ── IMAGE: Find img inside any of this product's links ──
        let image = null;
        for (const link of links) {
          const img = link.querySelector('img');
          if (img) {
            const src = img.getAttribute('src');
            const dataSrc = img.getAttribute('data-src');
            const srcset = img.getAttribute('srcset');
            
            if (src && src.startsWith('http') && !src.includes('data:image') &&
                !src.includes('placeholder') && src.length > 30) {
              image = src;
            } else if (dataSrc && dataSrc.startsWith('http')) {
              image = dataSrc;
            } else if (srcset) {
              const entries = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
              image = entries[entries.length - 1]; // Highest res
            } else if (src && src.startsWith('//')) {
              image = `https:${src}`;
            }
            
            if (image) break;
          }
        }

        // Upgrade Flipkart image resolution
        if (image && image.includes('rukminim')) {
          image = image.replace(/\/\d+\/\d+\//, '/416/416/');
        }

        // ── PRICE: Find ₹ symbol near the product ──
        let price = null;
        // Look in the parent container of the first link
        const parentContainer = links[0].closest('div[data-id]') ||
                                 links[0].closest('[data-tkid]') ||
                                 links[0].parentElement?.parentElement?.parentElement;
        
        if (parentContainer) {
          // Walk all text nodes looking for ₹
          const walker = document.createTreeWalker(
            parentContainer, NodeFilter.SHOW_TEXT, null, false
          );
          while (walker.nextNode()) {
            const text = walker.currentNode.textContent.trim();
            if (text.startsWith('₹') && text.length < 15) {
              price = text;
              break; // Take the first price (usually the selling price)
            }
          }
          
          // Fallback: querySelector for common price patterns
          if (!price) {
            const priceEls = parentContainer.querySelectorAll('div, span');
            for (const el of priceEls) {
              const t = el.textContent.trim();
              if (t.startsWith('₹') && t.length < 15 && el.children.length === 0) {
                price = t;
                break;
              }
            }
          }
        }

        if (!price) continue; // Skip products without visible price

        // ★ MANDATORY IMAGE FALLBACK ★
        if (!image || !image.startsWith('http')) {
          image = placeholder;
        }

        items.push({ title, price, image, url: fullUrl });
      }

      return items;
    }, PLACEHOLDER_IMG);

    await browser.close();
    browser = null;

    if (products.length > 0) {
      console.log(`[Flipkart] ✓ Extracted ${products.length} LIVE products`);
      // Server-side image safety net
      return products.map(p => ({
        ...p,
        image: (p.image && p.image.startsWith('http')) ? p.image : PLACEHOLDER_IMG
      }));
    }

    console.warn('[Flipkart] No live products extracted, trying fallback');
    return getFallbackData(rawQuery, query);

  } catch (error) {
    console.error('[Flipkart] Scraping failed:', error.message);
    if (browser) await browser.close().catch(() => {});
    return getFallbackData(rawQuery, query);
  }
}

/**
 * Fallback: Only used when Puppeteer completely fails (CAPTCHA, timeout, etc.)
 * Returns search-link items so the user can at least navigate to Flipkart.
 */
function getFallbackData(rawQuery, augmentedQuery) {
  console.warn('[Flipkart] Using search-redirect fallback');
  const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(augmentedQuery)}`;
  
  // Return a single "Open on Flipkart" item instead of fake mock products
  return [
    {
      title: `Search Flipkart for: "${rawQuery}"`,
      price: 'View on Flipkart',
      image: 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Open+Flipkart',
      url: searchUrl,
      fallback: true
    }
  ];
}
