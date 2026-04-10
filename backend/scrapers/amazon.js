import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { augmentQueryForAccessibility } from './queryAugment.js';

puppeteer.use(StealthPlugin());

/**
 * Scrape Amazon.in search results for a given query.
 * Query is auto-augmented for blind/visually impaired accessibility.
 * Returns up to 12 products with real images and absolute /dp/ASIN URLs.
 */
export default async function scrapeAmazon(rawQuery) {
  const query = augmentQueryForAccessibility(rawQuery, 'shopping');
  console.log(`[Amazon Scraper] Original: "${rawQuery}" → Augmented: "${query}"`);

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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setViewport({ width: 1920, height: 1080 });

    const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
    console.log(`[Amazon Scraper] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for search results to render
    await page.waitForSelector('[data-component-type="s-search-result"]', {
      timeout: 15000
    }).catch(() => {
      console.warn('[Amazon Scraper] Primary selector not found');
    });

    // Scroll in steps to trigger ALL lazy-loaded images
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 800));
      await new Promise(r => setTimeout(r, 800));
    }
    // Scroll back to top so we get full DOM
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    const products = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('[data-component-type="s-search-result"]');

      for (const card of cards) {
        if (items.length >= 12) break;

        const asin = card.getAttribute('data-asin');
        if (!asin || asin.length < 5) continue; // Skip ad placeholders with empty ASINs

        // ── Title ──
        const titleEl = card.querySelector('h2 a span') ||
                         card.querySelector('h2 span') ||
                         card.querySelector('.a-text-normal');
        const title = titleEl ? titleEl.textContent.trim() : null;
        if (!title) continue;

        // ── Price ──
        let price = null;
        // Try offscreen price first (most reliable, includes symbol)
        const offscreen = card.querySelector('.a-price .a-offscreen');
        if (offscreen) {
          price = offscreen.textContent.trim();
        } else {
          const priceWhole = card.querySelector('.a-price-whole');
          if (priceWhole) {
            price = `₹${priceWhole.textContent.replace(/[.,\s]$/g, '')}`;
          }
        }
        if (!price) continue;

        // ── Image — MULTI-LAYER extraction ──
        let image = null;
        const imgEl = card.querySelector('img.s-image');
        if (imgEl) {
          const src = imgEl.getAttribute('src');
          const dataSrc = imgEl.getAttribute('data-src');
          const srcset = imgEl.getAttribute('srcset');

          // Priority: real src > data-src > highest-res from srcset
          if (src && src.startsWith('http') && !src.includes('data:image') && src.length > 40) {
            image = src;
          } else if (dataSrc && dataSrc.startsWith('http')) {
            image = dataSrc;
          } else if (srcset) {
            // Parse srcset: "url1 1x, url2 2x" — take last (highest res)
            const entries = srcset.split(',').map(s => s.trim().split(/\s+/));
            image = entries[entries.length - 1][0];
          } else if (src) {
            image = src; // Fallback to whatever we have
          }

          // Upgrade to higher resolution if it's an Amazon CDN image
          if (image && image.includes('m.media-amazon.com') && image.includes('._')) {
            // Replace size variant with large: ._AC_UL320_ → ._AC_UL600_
            image = image.replace(/\._[A-Z0-9_]+_\./, '._AC_UL600_FMwebp_QL65_.');
          }
        }

        // ── URL — absolute URL from ASIN (guaranteed to work) ──
        const url = `https://www.amazon.in/dp/${asin}`;

        items.push({ title, price, image, url });
      }

      return items;
    });

    await browser.close();
    browser = null;

    if (products.length > 0) {
      console.log(`[Amazon Scraper] Extracted ${products.length} products`);
      return products;
    }

    console.warn('[Amazon Scraper] No products extracted, using mock data');
    return getMockData(rawQuery);

  } catch (error) {
    console.error('[Amazon Scraper] Scraping failed:', error.message);
    if (browser) await browser.close().catch(() => {});
    return getMockData(rawQuery);
  }
}

/**
 * Fallback mock data with accessibility-augmented titles
 */
function getMockData(query) {
  const augmented = augmentQueryForAccessibility(query, 'shopping');
  console.log('[Amazon Scraper] Using mock fallback data');
  return [
    { title: `${augmented} - Premium Quality (Best Seller)`, price: '₹599', image: 'https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Professional Grade with Warranty`, price: '₹1,299', image: 'https://m.media-amazon.com/images/I/71pMu9gAqlL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Budget Friendly Option`, price: '₹349', image: 'https://m.media-amazon.com/images/I/61L5QgPvgqL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Top Rated by Customers`, price: '₹899', image: 'https://m.media-amazon.com/images/I/71s4pBNqAgL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Lightweight & Portable`, price: '₹449', image: 'https://m.media-amazon.com/images/I/61wjKIMzX1L._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Heavy Duty Deluxe Edition`, price: '₹2,499', image: 'https://m.media-amazon.com/images/I/71GpWwi7rFL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Ergonomic Design`, price: '₹799', image: 'https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Smart Assistive Tech`, price: '₹1,599', image: 'https://m.media-amazon.com/images/I/71pMu9gAqlL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Compact Travel Edition`, price: '₹499', image: 'https://m.media-amazon.com/images/I/61L5QgPvgqL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Premium Accessible`, price: '₹1,099', image: 'https://m.media-amazon.com/images/I/71s4pBNqAgL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Starter Kit for Beginners`, price: '₹299', image: 'https://m.media-amazon.com/images/I/61wjKIMzX1L._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
    { title: `${augmented} - Deluxe Accessibility Pack`, price: '₹3,299', image: 'https://m.media-amazon.com/images/I/71GpWwi7rFL._AC_UL600_FMwebp_QL65_.jpg', url: `https://www.amazon.in/s?k=${encodeURIComponent(augmented)}`, mock: true },
  ];
}
