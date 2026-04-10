export const parseIntent = async (transcript) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // Try real LLM execution if a key is present
  if (apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are an AI intent parser for a visually impaired user's voice assistant. 
They just said: "${transcript}".
Identify the intent. The possible intents are: OPEN_YOUTUBE, SHOPPING_QUERY, FOOD_QUERY, SERVICE_QUERY, or UNKNOWN.

CRITICAL RULES:
- If the user says "open YouTube" or just "YouTube" with NO specific search topic, return OPEN_YOUTUBE with an EMPTY entities array []. Do NOT put "youtube" as an entity.
- If the user says "open YouTube and search for cats", return OPEN_YOUTUBE with entities ["cats"].
- For SHOPPING_QUERY, the entity is what to buy (e.g., "blind walking stick").
- For FOOD_QUERY, the entity is the food to order (e.g., "pizza").
- For SERVICE_QUERY, the entity is the task/service needed (e.g., "house cleaning", "plumber", "read my mail"). Trigger this for "hire someone", "find a service", "book a cleaner", "get help with", "find me a helper", etc.

Return ONLY a valid JSON object exactly like this format (no markdown tags):
{"intent": "SERVICE_QUERY", "entities": ["house cleaning"]}`
            }]
          }]
        })
      });
      
      const data = await response.json();
      if (data.candidates && data.candidates.length > 0) {
        let textResult = data.candidates[0].content.parts[0].text;
        textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(textResult);
      }
    } catch (e) {
      console.error("Gemini API error, falling back to mock logic:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // MOCK FALLBACK (Used if no VITE_GEMINI_API_KEY is found in .env)
  // ═══════════════════════════════════════════════════════════════════
  const text = transcript.toLowerCase().trim();
  let intent = 'UNKNOWN';
  let entities = [];

  // ── YouTube detection ──
  if (text.includes('youtube') || text.includes('you tube')) {
    intent = 'OPEN_YOUTUBE';
    const cleaned = text
      .replace(/\b(open|go to|launch|play on|show me|navigate to)\b/gi, '')
      .replace(/\b(youtube|you tube)\b/gi, '')
      .replace(/\b(and|then|also)\b/gi, '')
      .replace(/\b(search for|search|look for|find)\b/gi, '')
      .trim();
    if (cleaned && cleaned.length > 2 && cleaned !== 'video' && cleaned !== 'videos') {
      entities.push(cleaned);
    }

  } else if (text.includes('video') && !text.includes('youtube')) {
    intent = 'OPEN_YOUTUBE';
    const cleaned = text
      .replace(/\b(play|watch|show|some|me)\b/gi, '')
      .replace(/\b(videos?)\b/gi, '')
      .trim();
    if (cleaned && cleaned.length > 2) entities.push(cleaned);

  // ── SERVICE detection (MUST come before shopping to catch "hire", "book a") ──
  } else if (
    text.includes('service') || text.includes('hire') || text.includes('helper') ||
    text.includes('book a') || text.includes('book an') || text.includes('get help') ||
    text.includes('find a plumber') || text.includes('find a cleaner') ||
    text.includes('find me a') || text.includes('need a') ||
    text.includes('caregiver') || text.includes('attendant') || text.includes('companion') ||
    text.includes('clean my') || text.includes('fix my') || text.includes('repair my') ||
    text.includes('read my') || text.includes('cook for') || text.includes('drive me') ||
    text.includes('gig') || text.includes('freelancer') || text.includes('handyman')
  ) {
    intent = 'SERVICE_QUERY';
    const cleaned = text
      .replace(/\b(find|get|hire|book|need|me|a|an|the|some|service|services|help|helper|with|for|someone|to|my|please|i want|i need)\b/gi, '')
      .trim();
    if (cleaned) entities.push(cleaned);

  // ── Shopping detection ──
  } else if (text.includes('buy') || text.includes('shop') || text.includes('search for') || text.includes('find me')) {
    intent = 'SHOPPING_QUERY';
    const cleaned = text
      .replace(/\b(buy|shop|search for|find me|find|get|order|i want|i need|some|a|the|on flipkart|on amazon)\b/gi, '')
      .trim();
    if (cleaned) entities.push(cleaned);

  // ── Food detection ──
  } else if (text.includes('food') || text.includes('order') || text.includes('eat') || text.includes('hungry') || text.includes('grocer')) {
    intent = 'FOOD_QUERY';
    const cleaned = text
      .replace(/\b(order|request|eat|some|food|from zomato|from|i want|i need|get me|hungry|groceries?)\b/gi, '')
      .trim();
    if (cleaned) entities.push(cleaned);
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    intent,
    entities: entities.filter(e => e.length > 0)
  };
};
