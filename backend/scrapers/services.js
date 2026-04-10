import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const PLACEHOLDER_IMG = 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Service+Provider';

// ─── Service Query Augmentation ──────────────────────────────────────
// Intercepts the user's task and appends accessibility modifiers.
const SERVICE_QUERY_MAP = [
  { match: ['clean', 'cleaning', 'maid', 'housekeeping'],
    query: 'house cleaning helper for blind visually impaired' },
  { match: ['plumb', 'plumber', 'pipe', 'tap', 'leak'],
    query: 'plumber home service for elderly blind' },
  { match: ['electric', 'electrician', 'wiring', 'switch'],
    query: 'electrician home service for visually impaired' },
  { match: ['cook', 'cooking', 'chef', 'meal'],
    query: 'home cook meal preparation helper for blind' },
  { match: ['read', 'reader', 'mail', 'letter', 'document'],
    query: 'assistant to read documents for blind visually impaired' },
  { match: ['drive', 'driver', 'transport', 'travel', 'cab'],
    query: 'personal driver assistant for blind visually impaired' },
  { match: ['shop', 'shopping', 'errand', 'grocery'],
    query: 'personal shopping assistant for blind visually impaired' },
  { match: ['repair', 'fix', 'handyman', 'maintenance'],
    query: 'home repair handyman for elderly blind assistance' },
  { match: ['tutor', 'teach', 'lesson', 'learn'],
    query: 'home tutor for visually impaired students' },
  { match: ['massage', 'therapy', 'physio', 'health'],
    query: 'massage therapy home service for visually impaired' },
  { match: ['paint', 'painter', 'wall'],
    query: 'house painter decorator home service' },
  { match: ['pest', 'termite', 'cockroach'],
    query: 'pest control home service' },
  { match: ['move', 'moving', 'packer', 'shifting'],
    query: 'packers movers relocation assistance for disabled' },
  { match: ['laundry', 'wash', 'iron', 'clothes'],
    query: 'laundry ironing pickup service for blind elderly' },
  { match: ['care', 'caregiver', 'nurse', 'attendant', 'companion'],
    query: 'home caregiver attendant for blind visually impaired' },
];

function augmentServiceQuery(rawQuery) {
  const lower = rawQuery.toLowerCase().trim();
  
  // Already has accessibility terms
  if (['blind', 'visually impaired', 'disabled', 'accessibility'].some(t => lower.includes(t))) {
    return rawQuery;
  }

  for (const entry of SERVICE_QUERY_MAP) {
    if (entry.match.some(kw => lower.includes(kw))) {
      console.log(`[ServiceMapper] Mapped: "${rawQuery}" → "${entry.query}"`);
      return entry.query;
    }
  }

  const fallback = `${rawQuery} helper for blind and visually impaired`;
  console.log(`[ServiceMapper] Default: "${rawQuery}" → "${fallback}"`);
  return fallback;
}

/**
 * Scrape LIVE service/gig data from JustDial using Puppeteer.
 * Falls back to UrbanCompany if JustDial fails.
 */
export default async function scrapeServices(rawQuery) {
  const query = augmentServiceQuery(rawQuery);
  console.log(`[Service Scraper] Original: "${rawQuery}" → Augmented: "${query}"`);

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

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    // ── Try JustDial first ──
    const jdUrl = `https://www.justdial.com/Delhi/${encodeURIComponent(query.replace(/\s+/g, '-'))}`;
    console.log(`[Service Scraper] JustDial: ${jdUrl}`);

    await page.goto(jdUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    await new Promise(r => setTimeout(r, 2000));

    // Scroll for lazy images
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 600));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 500));

    const products = await page.evaluate((placeholder) => {
      const items = [];
      const seenNames = new Set();

      // JustDial listing selectors (structural)
      const cardSelectors = [
        'li.cntanr',
        'div.resultbox_info',
        'div.store-details',
        'div[class*="resultbox"]',
      ];

      let cards = [];
      for (const sel of cardSelectors) {
        cards = document.querySelectorAll(sel);
        if (cards.length > 2) break;
      }

      // Fallback: any container with rating + phone info
      if (cards.length === 0) {
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          const hasRating = div.querySelector('[class*="rating"], [class*="star"]');
          const hasName = div.querySelector('h2, h3, a[title]');
          if (hasRating && hasName && div.children.length < 20) {
            cards = div.parentElement ? div.parentElement.children : [div];
            if (cards.length > 2) break;
          }
        }
      }

      for (const card of cards) {
        if (items.length >= 12) break;

        // ── Title/Name ──
        let title = null;
        const titleEls = card.querySelectorAll('h2, h3, a[title], span.lng_cont_name, a.lng_cont_name');
        for (const el of titleEls) {
          const text = (el.getAttribute('title') || el.textContent || '').trim();
          if (text.length > 3 && text.length < 150) {
            title = text;
            break;
          }
        }
        if (!title || seenNames.has(title)) continue;
        seenNames.add(title);

        // ── Price/Rate ──
        let price = null;
        const priceEls = card.querySelectorAll('span[class*="price"], span[class*="cost"], span[class*="rate"]');
        for (const el of priceEls) {
          const text = el.textContent.trim();
          if (text.includes('₹') || text.match(/\d+/)) {
            price = text;
            break;
          }
        }
        // Fallback: look for ₹ in text
        if (!price) {
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const t = walker.currentNode.textContent.trim();
            if (t.startsWith('₹') && t.length < 15) { price = t; break; }
          }
        }
        if (!price) price = 'Contact for price';

        // ── Image ──
        let image = null;
        const imgs = card.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src && src.startsWith('http') && !src.includes('data:image') &&
              !src.includes('placeholder') && src.length > 30) {
            image = src;
            break;
          }
        }
        if (!image || !image.startsWith('http')) image = placeholder;

        // ── URL ──
        let url = null;
        const linkEl = card.querySelector('a[href*="justdial"], a[href]');
        if (linkEl) {
          const href = linkEl.getAttribute('href');
          if (href && href.startsWith('http')) url = href;
          else if (href && href.startsWith('/')) url = `https://www.justdial.com${href}`;
        }
        if (!url) url = `https://www.justdial.com/Delhi/${encodeURIComponent(title)}`;

        items.push({ title, price, image, url });
      }

      return items;
    }, PLACEHOLDER_IMG);

    await browser.close();
    browser = null;

    if (products.length > 0) {
      console.log(`[Service Scraper] ✓ Extracted ${products.length} LIVE services from JustDial`);
      return products.map(p => ({
        ...p,
        image: (p.image && p.image.startsWith('http')) ? p.image : PLACEHOLDER_IMG
      }));
    }

    // ── Fallback: UrbanCompany ──
    console.warn('[Service Scraper] JustDial failed, trying UrbanCompany...');
    return await scrapeUrbanCompanyFallback(rawQuery, query);

  } catch (error) {
    console.error('[Service Scraper] JustDial failed:', error.message);
    if (browser) await browser.close().catch(() => {});
    return await scrapeUrbanCompanyFallback(rawQuery, query);
  }
}

async function scrapeUrbanCompanyFallback(rawQuery, augmentedQuery) {
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

    const ucUrl = `https://www.urbancompany.com/search?q=${encodeURIComponent(rawQuery)}`;
    console.log(`[Service Scraper] UrbanCompany: ${ucUrl}`);

    await page.goto(ucUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise(r => setTimeout(r, 600));
    }

    const products = await page.evaluate((placeholder) => {
      const items = [];
      
      // UC uses React — look for service cards
      const links = document.querySelectorAll('a[href*="/service/"]');
      const seenHrefs = new Set();

      for (const link of links) {
        if (items.length >= 12) break;
        const href = link.getAttribute('href');
        if (!href || seenHrefs.has(href)) continue;
        seenHrefs.add(href);

        const parent = link.closest('div') || link.parentElement;

        const title = link.getAttribute('title') || link.textContent.trim();
        if (!title || title.length < 3) continue;

        let price = 'View pricing';
        const walker = document.createTreeWalker(parent || link, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent.trim();
          if (t.startsWith('₹') && t.length < 15) { price = t; break; }
        }

        let image = placeholder;
        const img = (parent || link).querySelector('img');
        if (img) {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src && src.startsWith('http') && src.length > 30) image = src;
        }

        let url = href.startsWith('http') ? href : `https://www.urbancompany.com${href}`;

        items.push({ title: title.substring(0, 120), price, image, url });
      }

      return items;
    }, PLACEHOLDER_IMG);

    await browser.close();

    if (products.length > 0) {
      console.log(`[Service Scraper] ✓ UrbanCompany: ${products.length} services`);
      return products.map(p => ({
        ...p,
        image: (p.image && p.image.startsWith('http')) ? p.image : PLACEHOLDER_IMG
      }));
    }

    return getSearchRedirect(rawQuery);

  } catch (error) {
    console.error('[Service Scraper] UrbanCompany failed:', error.message);
    if (browser) await browser.close().catch(() => {});
    return getSearchRedirect(rawQuery);
  }
}

function getSearchRedirect(query) {
  console.warn('[Service Scraper] All scrapers failed, returning search redirect');
  return [
    {
      title: `Find "${query}" services on JustDial`,
      price: 'View on JustDial',
      image: 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Open+JustDial',
      url: `https://www.justdial.com/Delhi/${encodeURIComponent(query.replace(/\s+/g, '-'))}`,
      fallback: true
    },
    {
      title: `Find "${query}" services on UrbanCompany`,
      price: 'View on UrbanCompany',
      image: 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Open+UrbanCompany',
      url: `https://www.urbancompany.com/search?q=${encodeURIComponent(query)}`,
      fallback: true
    }
  ];
}
