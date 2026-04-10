import express from 'express';
import cors from 'cors';
import scrapeFlipkart from './scrapers/flipkart.js';
import scrapeFood from './scrapers/food.js';
import scrapeServices from './scrapers/services.js';

const app = express();
const port = 3000;

const PLACEHOLDER_IMG = 'https://via.placeholder.com/300x300/1a1a2e/facc15?text=Item';

app.use(cors());
app.use(express.json());

/**
 * Server-side image fallback enforcer.
 * Ensures NO result ever reaches the frontend with a broken image.
 */
function enforceImageFallback(results, fallbackImg = PLACEHOLDER_IMG) {
  return results.map(item => ({
    ...item,
    image: (item.image && typeof item.image === 'string' && item.image.startsWith('http'))
      ? item.image
      : fallbackImg
  }));
}

// POST /api/search — used by VoiceAgent (intent-based)
app.post('/api/search', async (req, res) => {
  const { intent, entities } = req.body;
  
  try {
    const query = entities && entities.length > 0 ? entities[0] : 'default';
    let results = [];

    if (intent === 'SHOPPING_QUERY') {
      results = await scrapeFlipkart(query);
    } else if (intent === 'FOOD_QUERY') {
      results = await scrapeFood(query);
    } else if (intent === 'SERVICE_QUERY') {
      results = await scrapeServices(query);
    }

    results = enforceImageFallback(results);
    res.json({ success: true, results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Failed to scrape data.' });
  }
});

// GET /api/search/:type/:query — used by ShoppingView/ServiceView search bar
app.get('/api/search/:type/:query', async (req, res) => {
  const { type, query } = req.params;
  
  try {
    let results = [];

    if (type === 'shopping') {
      results = await scrapeFlipkart(query);
    } else if (type === 'food') {
      results = await scrapeFood(query);
    } else if (type === 'service') {
      results = await scrapeServices(query);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid type. Use "shopping", "food", or "service".' });
    }

    results = enforceImageFallback(results);
    res.json({ success: true, results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Failed to scrape data.' });
  }
});

app.listen(port, () => {
  console.log(`VisualShape Backend listening on port ${port}`);
});
