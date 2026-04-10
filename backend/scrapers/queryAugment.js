/**
 * ─── Smart Query Mapper for Accessibility ───────────────────────────
 * 
 * Replaces the previous blanket string concatenation with a clean
 * dictionary/switch-case mapper. Each category maps to a PROVEN
 * search string that returns real accessible products.
 *
 * The key difference from the old approach:
 *   OLD: Appended long keyword strings that confused search engines
 *   NEW: Maps to SHORT, SPECIFIC strings that actually work on Amazon
 *
 * Example mappings:
 *   "book"    → "braille books"
 *   "books"   → "braille books"
 *   "stick"   → "white cane blind walking stick"
 *   "phone"   → "mobile phones with braille for blind"
 *   "watch"   → "talking watch for blind"
 */

// ─── Query Map (dictionary approach) ─────────────────────────────────
// Keywords → exact search string. Ordered so more specific matches
// are checked first (e.g., "walking stick" before "stick").
const SHOPPING_QUERY_MAP = [
  // ── HIGH PRIORITY: User's specific requests ──
  { match: ['book', 'novel', 'textbook', 'reading'],
    query: 'braille books' },
  { match: ['stick', 'cane', 'walking stick', 'white cane'],
    query: 'white cane blind walking stick' },
  { match: ['phone', 'mobile', 'smartphone', 'cellphone'],
    query: 'mobile phones with braille for blind' },

  // ── Standard accessible products ──
  { match: ['watch', 'clock', 'alarm'],
    query: 'talking watch for blind' },
  { match: ['keyboard'],
    query: 'braille keyboard for blind' },
  { match: ['glasses', 'eyewear', 'specs'],
    query: 'smart glasses for blind assistive' },
  { match: ['headphone', 'earphone', 'earbuds', 'headset'],
    query: 'bone conduction headphones for blind' },
  { match: ['computer', 'laptop', 'pc', 'desktop'],
    query: 'laptop screen reader accessible for blind' },
  { match: ['tablet', 'ipad'],
    query: 'tablet for blind visually impaired accessible' },
  { match: ['game', 'toy', 'puzzle'],
    query: 'tactile games for blind visually impaired' },
  { match: ['pen', 'writing', 'stationery'],
    query: 'braille writing slate stylus for blind' },
  { match: ['label', 'tag', 'sticker'],
    query: 'tactile braille labels bump dots' },
  { match: ['kitchen', 'cook', 'utensil'],
    query: 'talking kitchen tools for blind' },
  { match: ['scale', 'thermometer', 'measure'],
    query: 'talking scale for blind voice output' },
  { match: ['magnifier', 'magnifying'],
    query: 'electronic magnifier for low vision' },
  { match: ['calculator', 'math'],
    query: 'talking calculator for blind' },
  { match: ['currency', 'money', 'cash', 'note detector'],
    query: 'talking money identifier for blind' },
  { match: ['chess', 'checkers', 'cards'],
    query: 'braille playing cards for blind' },
  { match: ['printer', 'print'],
    query: 'braille embosser printer' },
  { match: ['light', 'lamp', 'torch'],
    query: 'voice controlled smart light for blind' },
  { match: ['gps', 'navigation', 'map'],
    query: 'GPS navigation for blind talking directions' },
];

/**
 * Map a raw shopping query to an accessibility-focused search string.
 * Uses dictionary matching — no long keyword stuffing.
 *
 * @param {string} rawQuery - The user's original search query
 * @param {string} type     - 'shopping' or 'food'
 * @returns {string} The mapped query
 */
export function augmentQueryForAccessibility(rawQuery, type = 'shopping') {
  const query = rawQuery.trim();
  const lower = query.toLowerCase();

  // If user already specified accessibility terms, don't remap
  const accessibilityTerms = ['blind', 'visually impaired', 'braille', 'assistive', 'accessible', 'talking'];
  if (accessibilityTerms.some(term => lower.includes(term))) {
    console.log(`[QueryMapper] Pass-through (already accessible): "${query}"`);
    return query;
  }

  // Food queries: no accessibility rewrite (food is universally edible)
  if (type === 'food') {
    console.log(`[QueryMapper] Food pass-through: "${query}"`);
    return query;
  }

  // Shopping: match against the dictionary
  for (const entry of SHOPPING_QUERY_MAP) {
    if (entry.match.some(kw => lower.includes(kw))) {
      console.log(`[QueryMapper] Mapped: "${query}" → "${entry.query}"`);
      return entry.query;
    }
  }

  // Default fallback: simple and clean suffix
  const fallback = `${query} for blind and visually impaired`;
  console.log(`[QueryMapper] Default fallback: "${query}" → "${fallback}"`);
  return fallback;
}
