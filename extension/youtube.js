// ─── Aura YouTube Content Script ────────────────────────────────────
// KEY FIX: Play/Pause uses DIRECT <video> element manipulation.
// No more .ytp-play-button UI nonsense. document.querySelector('video')
// gives us the raw HTML5 video element which we control directly.
//
// Commands:
//   "search for [query]"   → type into search, click search icon
//   "read videos"          → read video titles via TTS
//   "play first video"     → click first a#thumbnail
//   "play video [N]"       → click Nth video
//   "play" / "resume"      → document.querySelector('video').play()
//   "pause" / "stop video" → document.querySelector('video').pause()
//   "like"                 → aria-label selector + 3-strike click
//   "dislike"              → aria-label selector + 3-strike click
//   "read comments"        → scroll + read comments
//   "subscribe"            → click subscribe button
//   "next video"           → click next button
//   "fullscreen"           → toggle fullscreen
//   "help"                 → list commands

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

// ─── 3-Strike Click (for UI buttons) ────────────────────────────────
function aggressiveClick(el) {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    el.click();
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }, 300);
}

// ─── Video Click Helper ──────────────────────────────────────────────
function clickVideoByIndex(index) {
  const renderers = document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer');
  if (index < 0 || index >= renderers.length) return null;

  const renderer = renderers[index];
  const titleEl = renderer.querySelector('#video-title');
  const title = titleEl ? titleEl.textContent.trim() : 'Unknown';

  // Priority: a#thumbnail → a#video-title → any /watch link
  const target = renderer.querySelector('a#thumbnail') ||
                 renderer.querySelector('a#video-title') ||
                 renderer.querySelector('a[href*="/watch"]');
  if (target) {
    target.click();
    return title;
  }
  return null;
}

// ─── Number Parsing ──────────────────────────────────────────────────
const NUM_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function parseNumber(text) {
  const digitMatch = text.match(/(\d+)/);
  if (digitMatch) return parseInt(digitMatch[1]);
  for (const [word, num] of Object.entries(NUM_WORDS)) {
    if (text.includes(word)) return num;
  }
  return null;
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
      console.log('[Aura YT] Heard:', transcript);
      handleCommand(transcript);
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('[Aura YT] Error:', event.error);
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

  // ── STOP TTS ──
  if (command.includes('stop') && !command.includes('video') || command.includes('quiet') || command.includes('shut up')) {
    stopSpeaking();
    return;
  }

  // ── SEARCH ──
  if (command.includes('search for') || command.includes('search')) {
    const query = command.replace(/^.*?search\s*(for)?\s*/i, '').trim();
    if (!query) { await speak('What would you like to search for?'); return; }

    await speak(`Searching for ${query}`);
    const input = document.querySelector('input#search');
    if (input) {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        const btn = document.querySelector('button#search-icon-legacy') ||
                    document.querySelector('button[aria-label="Search"]');
        if (btn) btn.click();
        else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      }, 300);
    } else {
      window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    }
    return;
  }

  // ── READ VIDEOS ──
  if (command.includes('read video') || command.includes('read results') || command.includes('read titles')) {
    await new Promise(r => setTimeout(r, 500));
    const renderers = document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer');
    if (renderers.length === 0) { await speak('No videos found.'); return; }

    const titles = [];
    for (let i = 0; i < Math.min(renderers.length, 10); i++) {
      const t = renderers[i].querySelector('#video-title');
      if (t && t.textContent.trim()) titles.push(t.textContent.trim());
    }

    if (titles.length === 0) { await speak('Could not read titles.'); return; }

    let text = `Found ${titles.length} videos. `;
    titles.forEach((t, i) => { text += `Video ${i + 1}: ${t}. `; });
    text += 'Say play first video or play video number.';
    await speak(text);
    return;
  }

  // ── PLAY FIRST VIDEO ──
  if (command.includes('first video') || command.includes('play first') ||
      command.includes('click first') || command.includes('watch first')) {
    await new Promise(r => setTimeout(r, 500));
    const title = clickVideoByIndex(0);
    await speak(title ? `Playing: ${title}` : 'No video found to play.');
    return;
  }

  // ── PLAY VIDEO N ──
  if (command.match(/(?:play|open|watch|click)\s*(?:video)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third)/)) {
    const num = parseNumber(command);
    if (num && num >= 1) {
      await new Promise(r => setTimeout(r, 500));
      const renderers = document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer');
      if (num <= renderers.length) {
        const title = clickVideoByIndex(num - 1);
        await speak(title ? `Playing video ${num}: ${title}` : `Could not click video ${num}.`);
      } else {
        await speak(`Video ${num} doesn't exist. ${renderers.length} videos on page.`);
      }
    }
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // ── PAUSE — DIRECT <video> ELEMENT MANIPULATION ──
  // NO MORE .ytp-play-button UI nonsense.
  // ════════════════════════════════════════════════════════════════════
  if (command === 'pause' || command.includes('pause video') || command.includes('pause the')) {
    const video = document.querySelector('video');
    if (video) {
      video.pause();
      await speak('Paused.');
    } else {
      await speak('No video player found.');
    }
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // ── PLAY/RESUME — DIRECT <video> ELEMENT MANIPULATION ──
  // ════════════════════════════════════════════════════════════════════
  if (command === 'play' || command === 'resume' || command.includes('play the') ||
      command.includes('resume video') || command.includes('continue')) {
    const video = document.querySelector('video');
    if (video) {
      video.play();
      await speak('Playing.');
    } else {
      await speak('No video player found.');
    }
    return;
  }

  // ── LIKE — aria-label selector ──
  if (command.includes('like') && !command.includes('dislike')) {
    const likeBtn = document.querySelector('button[aria-label*="like this video" i]') ||
                    document.querySelector('like-button-view-model button') ||
                    document.querySelector('#segmented-like-button button') ||
                    document.querySelector('#segmented-like-button yt-button-shape button');
    if (likeBtn) {
      aggressiveClick(likeBtn);
      await speak('Liked.');
    } else {
      await speak('Could not find like button.');
    }
    return;
  }

  // ── DISLIKE ──
  if (command.includes('dislike')) {
    const btn = document.querySelector('button[aria-label*="dislike this video" i]') ||
                document.querySelector('dislike-button-view-model button') ||
                document.querySelector('#segmented-dislike-button button');
    if (btn) {
      aggressiveClick(btn);
      await speak('Disliked.');
    } else {
      await speak('Could not find dislike button.');
    }
    return;
  }

  // ── READ COMMENTS ──
  if (command.includes('comment')) {
    await speak('Loading comments...');
    window.scrollBy(0, 800);
    await new Promise(r => setTimeout(r, 2000));
    window.scrollBy(0, 400);
    await new Promise(r => setTimeout(r, 1500));

    const comments = document.querySelectorAll('ytd-comment-thread-renderer #content-text');
    if (comments.length > 0) {
      const count = Math.min(comments.length, 5);
      let text = `Top ${count} comments. `;
      for (let i = 0; i < count; i++) {
        text += `Comment ${i + 1}: ${comments[i].innerText.substring(0, 200)}. `;
      }
      await speak(text);
    } else {
      await speak('Comments not loaded or unavailable.');
    }
    return;
  }

  // ── NEXT VIDEO ──
  if (command.includes('next')) {
    const btn = document.querySelector('.ytp-next-button');
    if (btn) { btn.click(); await speak('Next video.'); }
    return;
  }

  // ── FULLSCREEN ──
  if (command.includes('full screen') || command.includes('fullscreen')) {
    const btn = document.querySelector('.ytp-fullscreen-button');
    if (btn) { btn.click(); await speak('Fullscreen toggled.'); }
    return;
  }

  // ── SUBSCRIBE ──
  if (command.includes('subscribe')) {
    const btn = document.querySelector('ytd-subscribe-button-renderer button') ||
                document.querySelector('#subscribe-button button');
    if (btn) { aggressiveClick(btn); await speak('Subscribed.'); }
    else await speak('Subscribe button not found.');
    return;
  }

  // ── HELP ──
  if (command.includes('help') || command.includes('what can i say')) {
    await speak('Commands: search for, read videos, play first video, play, pause, like, dislike, read comments, next, fullscreen, subscribe, stop.');
    return;
  }
};

// ─── Init ────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (!window.location.hostname.includes('youtube.com')) return;
  console.log('[Aura YT] YouTube content script loaded');

  setTimeout(() => {
    if (location.href.includes('/watch')) {
      speak('Video page loaded. Say play, pause, like, or help.');
    } else if (location.href.includes('/results')) {
      speak('Search results. Say read videos or play first video.');
    } else {
      speak('YouTube loaded. Say search for something, or help.');
    }
    setupVoiceListener();
  }, 1500);
});

// SPA navigation detection
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => {
      if (lastUrl.includes('/watch')) speak('Video loaded. Say play, pause, like, or help.');
      else if (lastUrl.includes('/results')) speak('Results loaded. Say read videos.');
    }, 2000);
  }
}).observe(document.body, { childList: true, subtree: true });
