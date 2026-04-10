import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Search, Briefcase, Mic, MicOff, Loader2, Volume2, VolumeX, Phone } from 'lucide-react';
import { speak, stopSpeaking, isSpeaking, listenContinuous, stopListening } from '../utils/speech';

// ─── Voice States ────────────────────────────────────────────────────
const VOICE_STATE = {
  IDLE: 'IDLE',
  GREETING: 'GREETING',
  LISTENING_QUERY: 'LISTENING_QUERY',
  SEARCHING: 'SEARCHING',
  READING_RESULTS: 'READING_RESULTS',
  LISTENING_ACTION: 'LISTENING_ACTION',
};

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};

function parseBookCommand(text) {
  const lower = text.toLowerCase().trim();
  const numMatch = lower.match(/(?:book|hire|contact|select|open|service|number)\s*(\d+)/);
  if (numMatch) return parseInt(numMatch[1]);
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    if (lower.includes(word)) return num;
  }
  const bareNum = lower.match(/(\d+)\s*$/);
  if (bareNum) return parseInt(bareNum[1]);
  return null;
}

// ─── Skeleton Card ───────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="bg-gray-900/80 border-2 border-gray-800 rounded-2xl overflow-hidden animate-fade-in-up">
    <div className="w-full aspect-square skeleton-shimmer" />
    <div className="p-4 space-y-3">
      <div className="h-4 w-3/4 rounded skeleton-shimmer" />
      <div className="h-4 w-1/2 rounded skeleton-shimmer" />
      <div className="h-8 w-1/3 rounded skeleton-shimmer" />
      <div className="h-10 w-full rounded-xl skeleton-shimmer" />
    </div>
  </div>
);

// ─── Service Card ────────────────────────────────────────────────────
const ServiceCard = ({ item, index, onBook }) => (
  <div
    className="card-enter bg-gray-900/80 backdrop-blur border-2 border-gray-800 rounded-2xl overflow-hidden
               hover:border-teal-400/60 hover:shadow-[0_0_30px_rgba(45,212,191,0.12)] transition-all duration-300
               group focus-ring outline-none"
    style={{ animationDelay: `${index * 80}ms` }}
    tabIndex="0"
    role="article"
    aria-label={`Service ${index + 1}: ${item.title}, ${item.price}`}
  >
    <div className="relative w-full aspect-square bg-white/5 overflow-hidden">
      {item.image ? (
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = `https://placehold.co/400x400/1a1a2e/2dd4bf?text=${encodeURIComponent('Service')}`;
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">
          No Image
        </div>
      )}
      <div className="absolute top-3 left-3 bg-teal-400 text-black w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-sm shadow-lg">
        {index + 1}
      </div>
    </div>

    <div className="p-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-100 line-clamp-2 leading-snug min-h-[2.25rem]">
        {item.title}
      </h3>

      <div className="text-xl font-extrabold text-teal-400 tracking-tight">
        {item.price}
      </div>

      <button
        onClick={() => onBook(item, index)}
        className="w-full mt-1 py-2.5 px-4 bg-teal-400 hover:bg-teal-300 active:bg-teal-500
                   text-black font-bold text-sm rounded-xl transition-all duration-200
                   flex items-center justify-center gap-2 focus-ring
                   shadow-[0_2px_16px_rgba(45,212,191,0.25)] hover:shadow-[0_4px_24px_rgba(45,212,191,0.4)]"
        aria-label={`Book ${item.title} for ${item.price}`}
      >
        <Phone size={16} /> Book Now
      </button>
    </div>
  </div>
);

// ─── Voice Status Bar ────────────────────────────────────────────────
const VoiceStatusBar = ({ voiceState, isListening, onStopSpeaking }) => {
  const stateLabels = {
    [VOICE_STATE.IDLE]: 'Voice assistant ready',
    [VOICE_STATE.GREETING]: '🔊 Speaking... (say "stop" to interrupt)',
    [VOICE_STATE.LISTENING_QUERY]: '🎤 Listening for your request...',
    [VOICE_STATE.SEARCHING]: '⏳ Searching services...',
    [VOICE_STATE.READING_RESULTS]: '🔊 Reading results... (say "stop" to interrupt)',
    [VOICE_STATE.LISTENING_ACTION]: '🎤 Listening... say "book service 1" or "search for..."',
  };

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-300
        ${isListening
          ? 'bg-teal-400/10 border border-teal-400/30 text-teal-300 pulse-glow'
          : 'bg-gray-800/60 border border-gray-700/40 text-gray-400'
        }`}
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        {isListening ? (
          <Mic size={18} className="text-teal-400 animate-pulse" />
        ) : voiceState === VOICE_STATE.SEARCHING ? (
          <Loader2 size={18} className="text-teal-400 animate-spin" />
        ) : voiceState === VOICE_STATE.READING_RESULTS || voiceState === VOICE_STATE.GREETING ? (
          <Volume2 size={18} className="text-teal-400 animate-pulse" />
        ) : (
          <MicOff size={18} className="text-gray-500" />
        )}
      </div>
      <span className="flex-1">{stateLabels[voiceState] || 'Ready'}</span>
      {(voiceState === VOICE_STATE.READING_RESULTS || voiceState === VOICE_STATE.GREETING) && (
        <button
          onClick={onStopSpeaking}
          className="flex items-center gap-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-lg
                     hover:bg-red-500/30 transition-colors focus-ring"
          aria-label="Stop speaking"
        >
          <VolumeX size={14} /> Stop
        </button>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════
const ServiceView = ({ onBack }) => {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [voiceState, setVoiceState] = useState(VOICE_STATE.IDLE);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const searchInputRef = useRef(null);
  const isMountedRef = useRef(true);
  const hasGreetedRef = useRef(false);
  const itemsRef = useRef([]);
  const stopContinuousRef = useRef(null);

  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopSpeaking();
      stopListening();
      if (stopContinuousRef.current) {
        stopContinuousRef.current();
        stopContinuousRef.current = null;
      }
    };
  }, []);

  const emergencyHalt = useCallback(() => {
    stopSpeaking();
    setVoiceState(VOICE_STATE.LISTENING_ACTION);
  }, []);

  const handleVoiceInput = useCallback(async (transcript) => {
    if (!isMountedRef.current) return;
    const text = transcript.toLowerCase().trim();
    console.log('[Service Voice]', text);

    // STOP
    if (text.includes('stop') || text.includes('shut up') || text.includes('quiet')) {
      stopSpeaking();
      if (isMountedRef.current) setVoiceState(VOICE_STATE.LISTENING_ACTION);
      return;
    }

    const bookNum = parseBookCommand(text);

    if (isSpeaking() && !bookNum) return;
    if (isSpeaking() && bookNum) stopSpeaking();

    // BOOK SERVICE N
    if (bookNum !== null) {
      const currentItems = itemsRef.current;
      if (bookNum >= 1 && bookNum <= currentItems.length) {
        const selected = currentItems[bookNum - 1];
        await speak(`Opening ${selected.title} booking page.`);
        window.open(selected.url, '_blank');
        setTimeout(async () => {
          if (isMountedRef.current) {
            await speak('Booking page opened. Say the service provider what assistance you need.');
          }
        }, 1500);
        return;
      } else {
        await speak(`Service ${bookNum} does not exist. There are ${currentItems.length} services.`);
        return;
      }
    }

    // SEARCH FOR X
    if (text.includes('search') || text.includes('look for') || text.includes('find') || text.includes('hire') || text.includes('need')) {
      const searchMatch = text.match(/(?:search|look|find|hire|need)\s*(?:for|someone|a|an)?\s*(.*)/i);
      const newQuery = searchMatch && searchMatch[1] ? searchMatch[1].trim() : '';
      if (newQuery) {
        performSearch(newQuery);
      } else {
        await speak('What kind of service do you need?');
        setVoiceState(VOICE_STATE.LISTENING_QUERY);
      }
      return;
    }

    // GO BACK
    if (text.includes('back') || text.includes('home') || text.includes('menu') || text.includes('exit')) {
      await speak('Going back to the main menu.');
      stopListening();
      if (stopContinuousRef.current) { stopContinuousRef.current(); stopContinuousRef.current = null; }
      onBack();
      return;
    }

    // READ AGAIN
    if (text.includes('read') || text.includes('repeat') || text.includes('again')) {
      readResults(itemsRef.current);
      return;
    }

    // IF WAITING FOR QUERY, use as search
    if (voiceState === VOICE_STATE.LISTENING_QUERY || itemsRef.current.length === 0) {
      performSearch(text);
      return;
    }
  }, [voiceState, onBack]);

  const startContinuousListening = useCallback(() => {
    if (!isMountedRef.current) return;
    if (stopContinuousRef.current) stopContinuousRef.current();
    setIsListening(true);
    stopContinuousRef.current = listenContinuous(
      (transcript) => handleVoiceInput(transcript),
      (error) => console.error('[Service Listen Error]', error)
    );
  }, [handleVoiceInput]);

  const performSearch = useCallback(async (query) => {
    if (!query || !query.trim()) return;
    const trimmedQuery = query.trim();
    setSearchQuery(trimmedQuery);
    setIsLoading(true);
    setVoiceState(VOICE_STATE.SEARCHING);
    setItems([]);

    await speak(`Searching for ${trimmedQuery} services`);

    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(
        `${API_BASE}/api/search/service/${encodeURIComponent(trimmedQuery)}`
      );
      const data = await response.json();

      if (!isMountedRef.current) return;

      if (data.success && data.results && data.results.length > 0) {
        setItems(data.results);
        setIsLoading(false);
        readResults(data.results);
      } else {
        setIsLoading(false);
        await speak('No services found. Please describe what help you need.');
        setVoiceState(VOICE_STATE.LISTENING_QUERY);
      }
    } catch (error) {
      console.error('Service search failed:', error);
      if (!isMountedRef.current) return;
      setIsLoading(false);
      await speak('Server unreachable. Please try again.');
      setVoiceState(VOICE_STATE.LISTENING_QUERY);
    }
  }, []);

  const readResults = useCallback(async (results) => {
    if (!isMountedRef.current || !results || results.length === 0) return;
    setVoiceState(VOICE_STATE.READING_RESULTS);

    const count = results.length;
    let readingText = `Found ${count} service${count !== 1 ? 's' : ''}. `;
    results.forEach((item, i) => {
      readingText += `Service ${i + 1} is ${item.title}, ${item.price}. `;
    });
    readingText += 'Say book service number to contact them, or search for something else.';

    await speak(readingText);
    if (!isMountedRef.current) return;
    setVoiceState(VOICE_STATE.LISTENING_ACTION);
  }, []);

  // Greeting on mount
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const greet = async () => {
      setVoiceState(VOICE_STATE.GREETING);
      startContinuousListening();
      await speak('Service menu open. What kind of help do you need today?');
      if (isMountedRef.current) setVoiceState(VOICE_STATE.LISTENING_QUERY);
    };

    const timer = setTimeout(greet, 400);
    return () => clearTimeout(timer);
  }, [startContinuousListening]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) { stopSpeaking(); performSearch(searchQuery); }
  };

  const handleBook = (item, index) => {
    stopSpeaking();
    speak(`Opening ${item.title}`).then(() => { window.open(item.url, '_blank'); });
  };

  const toggleMic = () => {
    if (isListening) {
      stopListening();
      if (stopContinuousRef.current) { stopContinuousRef.current(); stopContinuousRef.current = null; }
      setIsListening(false);
      setVoiceState(VOICE_STATE.IDLE);
    } else {
      startContinuousListening();
      setVoiceState(items.length > 0 ? VOICE_STATE.LISTENING_ACTION : VOICE_STATE.LISTENING_QUERY);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => { stopSpeaking(); stopListening(); if (stopContinuousRef.current) stopContinuousRef.current(); onBack(); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-gray-800/80 hover:bg-gray-700
                       rounded-xl transition-all duration-200 text-teal-300 focus-ring shrink-0"
            aria-label="Go back to main menu"
          >
            <ArrowLeft size={20} /> Back
          </button>

          <form onSubmit={handleSearchSubmit} className="flex-1 relative">
            <div className="relative group">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-teal-400 transition-colors" />
              <input
                ref={searchInputRef}
                id="service-search-input"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for services... (e.g., house cleaning, plumber)"
                className="w-full pl-12 pr-4 py-3 bg-gray-900/80 border-2 border-gray-700/60 rounded-2xl
                           text-white text-base placeholder-gray-500
                           focus:border-teal-400/60 focus:bg-gray-900 focus:shadow-[0_0_20px_rgba(45,212,191,0.1)]
                           transition-all duration-300 outline-none"
                aria-label="Search services"
              />
            </div>
          </form>

          <button
            onClick={toggleMic}
            className={`relative p-3 rounded-xl transition-all duration-300 shrink-0 focus-ring
              ${isListening
                ? 'bg-teal-400 text-black shadow-[0_0_20px_rgba(45,212,191,0.4)]'
                : 'bg-gray-800/80 text-gray-400 hover:text-teal-300 hover:bg-gray-700'
              }`}
            aria-label={isListening ? 'Stop listening' : 'Start voice search'}
          >
            {isListening ? (
              <>
                <Mic size={22} className="animate-pulse" />
                <span className="absolute inset-0 rounded-xl mic-breathing" />
              </>
            ) : (
              <MicOff size={22} />
            )}
          </button>
        </div>
      </header>

      {/* Voice Status */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 w-full">
        <VoiceStatusBar voiceState={voiceState} isListening={isListening} onStopSpeaking={emergencyHalt} />
      </div>

      {/* Service Grid */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 pb-8 w-full">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(12)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : items.length > 0 ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-gray-400 text-sm font-medium">
                Showing <span className="text-teal-400 font-bold">{items.length}</span> results
                {searchQuery && <> for "<span className="text-white">{searchQuery}</span>"</>}
              </p>
              <button
                onClick={() => readResults(items)}
                className="flex items-center gap-2 text-sm text-teal-400/80 hover:text-teal-300 transition-colors focus-ring rounded-lg px-2 py-1"
                aria-label="Read all results aloud"
              >
                <Volume2 size={16} /> Read aloud
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 custom-scrollbar">
              {items.map((item, index) => (
                <ServiceCard key={`${item.url}-${index}`} item={item} index={index} onBook={handleBook} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-24 h-24 rounded-full bg-gray-800/60 flex items-center justify-center mb-6">
              <Briefcase size={40} className="text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-300 mb-2">
              Find services & helpers
            </h2>
            <p className="text-gray-500 text-lg max-w-md">
              Say what you need help with — cleaning, plumbing, reading, cooking, or any task.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/40 bg-black/40 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-4 justify-center text-xs text-gray-600">
          <span>Say <strong className="text-gray-400">"Stop"</strong> to interrupt</span>
          <span className="text-gray-700">|</span>
          <span>Say <strong className="text-gray-400">"Book service 1"</strong> to contact</span>
          <span className="text-gray-700">|</span>
          <span>Say <strong className="text-gray-400">"Search for..."</strong> to find more</span>
          <span className="text-gray-700">|</span>
          <span>Say <strong className="text-gray-400">"Go back"</strong> to return</span>
        </div>
      </footer>
    </div>
  );
};

export default ServiceView;
