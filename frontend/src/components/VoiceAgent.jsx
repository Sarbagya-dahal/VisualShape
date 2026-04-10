import React, { useEffect, useState, useRef } from 'react';
import { Mic, Activity, Loader2, ShoppingCart, Utensils, Youtube, Sparkles, Briefcase } from 'lucide-react';
import { listen, speak, stopSpeaking, stopListening } from '../utils/speech';
import { parseIntent } from '../utils/llm';

// ── Animated Sound Wave Bars ─────────────────────────────────────────
const SoundWave = ({ active }) => (
  <div className="flex items-end gap-[3px] h-8" aria-hidden="true">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className={`w-[4px] rounded-full transition-all duration-300 ${
          active
            ? 'bg-yellow-400 animate-sound-bar'
            : 'bg-gray-700 h-1'
        }`}
        style={{
          animationDelay: active ? `${i * 0.12}s` : '0s',
          height: active ? undefined : '4px',
        }}
      />
    ))}
  </div>
);

// ── Floating Particle ────────────────────────────────────────────────
const Particle = ({ delay, duration, size, x, y }) => (
  <div
    className="absolute rounded-full bg-yellow-400/20 animate-float-particle"
    style={{
      width: size,
      height: size,
      left: x,
      top: y,
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
    }}
    aria-hidden="true"
  />
);

// ── Quick Action Card ────────────────────────────────────────────────
const ActionCard = ({ icon: Icon, label, example, onClick, color }) => (
  <button
    onClick={onClick}
    className={`group relative flex flex-col items-center gap-3 p-5 rounded-2xl border border-white/[0.06]
               bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.07]
               transition-all duration-500 cursor-pointer
               hover:border-${color}-400/30 hover:shadow-[0_0_40px_rgba(250,204,21,0.06)]
               hover:-translate-y-1 active:translate-y-0
               focus-ring w-full`}
    aria-label={`Say: ${example}`}
  >
    <div className={`w-12 h-12 rounded-xl bg-${color}-400/10 flex items-center justify-center
                    group-hover:bg-${color}-400/20 transition-colors duration-300`}>
      <Icon size={22} className={`text-${color}-400`} />
    </div>
    <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">{label}</span>
    <span className="text-[11px] text-gray-600 group-hover:text-gray-400 transition-colors italic">"{example}"</span>
  </button>
);

const VoiceAgent = ({ onIntent }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusText, setStatusText] = useState('Ready to assist.');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extensionId, setExtensionId] = useState(null);
  const hasGreetedRef = useRef(false);
  const isMountedRef = useRef(true);

  // ── Detect extension ID via CSP-safe methods ──
  useEffect(() => {
    const idFromAttr = document.documentElement.getAttribute('data-aura-extension-id');
    if (idFromAttr) {
      setExtensionId(idFromAttr);
    }

    const handleExtReady = (e) => {
      if (e.detail && e.detail.extensionId) {
        setExtensionId(e.detail.extensionId);
      }
    };
    document.addEventListener('AURA_EXTENSION_READY', handleExtReady);

    const handleResponse = (event) => {
      if (event.data && event.data.type === 'AURA_RESPONSE') {
        console.log('[VoiceAgent] Extension response:', event.data);
      }
    };
    window.addEventListener('message', handleResponse);

    return () => {
      document.removeEventListener('AURA_EXTENSION_READY', handleExtReady);
      window.removeEventListener('message', handleResponse);
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopSpeaking();
      stopListening();
    };
  }, []);

  // Auto-greet on mount
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    const greet = async () => {
      setStatusText('Welcome!');
      await speak('Welcome to VisualShape. What would you like to do? You can say shop, food, services, or open YouTube.');
      if (isMountedRef.current) startListening();
    };

    const timer = setTimeout(greet, 300);
    return () => clearTimeout(timer);
  }, []);

  const startListening = () => {
    setIsListening(true);
    setStatusText('Listening...');

    listen(
      (text) => {
        setTranscript(text);
        setIsListening(false);
        handleTranscript(text);
      },
      () => {
        if (isMountedRef.current) setIsListening(false);
      }
    );
  };

  const toggleListening = () => {
    if (isProcessing) return;
    if (!isListening) {
      stopSpeaking();
      startListening();
    } else {
      stopListening();
      setIsListening(false);
      setStatusText('Tap to speak.');
    }
  };

  const openYouTube = async (entities) => {
    const query = entities && entities.length > 0 ? entities[0] : '';
    const url = query
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : 'https://www.youtube.com';

    if (extensionId && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(
          extensionId,
          { type: 'AURA_INTENT', payload: { intent: 'OPEN_YOUTUBE', entities: entities || [] } },
          (response) => {
            if (chrome.runtime.lastError) {
              sendViaPostMessage(entities);
            }
          }
        );
        return;
      } catch (e) { /* fallthrough */ }
    }

    sendViaPostMessage(entities);
    setTimeout(() => { window.open(url, '_blank'); }, 500);
  };

  const sendViaPostMessage = (entities) => {
    try {
      window.postMessage({
        type: 'AURA_INTENT',
        payload: { intent: 'OPEN_YOUTUBE', entities: entities || [] }
      }, '*');
    } catch (e) { /* silent */ }
  };

  const handleTranscript = async (text) => {
    setStatusText('Processing...');
    setIsProcessing(true);

    try {
      const result = await parseIntent(text);
      setStatusText(`Intent: ${result.intent}`);

      if (result.intent === 'OPEN_YOUTUBE') {
        await speak('Opening YouTube for you now.');
        await openYouTube(result.entities);
        setIsProcessing(false);
        setTimeout(() => { if (isMountedRef.current) startListening(); }, 1500);
      } else if (result.intent === 'SHOPPING_QUERY' || result.intent === 'FOOD_QUERY' || result.intent === 'SERVICE_QUERY') {
        const label = result.intent === 'FOOD_QUERY' ? 'food' : result.intent === 'SERVICE_QUERY' ? 'services' : 'shopping';
        await speak(`Opening ${label} view.`);
        setIsProcessing(false);
        onIntent(result.intent);
      } else {
        await speak('Try saying shop, food, services, or YouTube.');
        setIsProcessing(false);
        if (isMountedRef.current) startListening();
      }
    } catch (error) {
      await speak('Something went wrong. Please try again.');
      setIsProcessing(false);
      if (isMountedRef.current) startListening();
    }
  };

  const handleQuickAction = (intentText) => {
    setTranscript(intentText);
    handleTranscript(intentText);
  };

  // ── Determine visual state ──
  const isActive = isListening;
  const orbColor = isProcessing
    ? 'rgba(107, 114, 128, 0.3)'
    : isActive
      ? 'rgba(250, 204, 21, 0.4)'
      : 'rgba(250, 204, 21, 0.08)';

  return (
    <div className="voice-agent-container relative flex flex-col items-center justify-center min-h-[70vh] px-6 py-10 overflow-hidden">

      {/* ── Background: Floating Particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <Particle delay={0} duration={8} size="6px" x="10%" y="15%" />
        <Particle delay={1.5} duration={10} size="4px" x="85%" y="20%" />
        <Particle delay={3} duration={7} size="5px" x="70%" y="70%" />
        <Particle delay={0.5} duration={9} size="3px" x="25%" y="80%" />
        <Particle delay={2} duration={11} size="4px" x="55%" y="10%" />
        <Particle delay={4} duration={8} size="6px" x="15%" y="55%" />
        <Particle delay={1} duration={12} size="3px" x="90%" y="60%" />
        <Particle delay={3.5} duration={9} size="5px" x="40%" y="85%" />
      </div>

      {/* ── Background: Radial Gradient Glow ── */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(circle, ${orbColor} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          transform: isActive ? 'scale(1.3)' : 'scale(0.8)',
        }}
        aria-hidden="true"
      />

      {/* ── Central Voice Orb ── */}
      <div className="relative flex items-center justify-center z-10">

        {/* Orbital Ring 1 — Slow */}
        <div
          className={`absolute w-52 h-52 sm:w-72 sm:h-72 rounded-full border transition-all duration-700 ${
            isActive
              ? 'border-yellow-400/30 animate-orbit-slow'
              : isProcessing
                ? 'border-gray-600/30 animate-orbit-slow'
                : 'border-white/[0.04]'
          }`}
          aria-hidden="true"
        >
          {isActive && (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.8)]" />
          )}
        </div>

        {/* Orbital Ring 2 — Medium */}
        <div
          className={`absolute w-64 h-64 sm:w-80 sm:h-80 rounded-full border transition-all duration-700 ${
            isActive
              ? 'border-yellow-400/15 animate-orbit-medium'
              : isProcessing
                ? 'border-gray-700/20 animate-orbit-medium'
                : 'border-white/[0.02]'
          }`}
          aria-hidden="true"
        >
          {isActive && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
          )}
        </div>

        {/* Orbital Ring 3 — Fast (only when active) */}
        {(isActive || isProcessing) && (
          <div
            className={`absolute w-44 h-44 sm:w-56 sm:h-56 rounded-full border ${
              isProcessing ? 'border-gray-600/20' : 'border-yellow-400/20'
            } animate-orbit-fast`}
            aria-hidden="true"
          >
            <div className={`absolute top-1/2 -right-1 w-1.5 h-1.5 rounded-full ${
              isProcessing ? 'bg-gray-400' : 'bg-yellow-300'
            } shadow-[0_0_8px_currentColor]`} />
          </div>
        )}

        {/* ── The Main Button ── */}
        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`relative z-20 w-32 h-32 sm:w-40 sm:h-40 rounded-full flex flex-col items-center justify-center gap-2
                     cursor-pointer transition-all duration-500 ease-out focus-ring group
                     ${isProcessing
                       ? 'bg-gray-800/90 text-gray-500 border-2 border-gray-700 cursor-wait'
                       : isActive
                         ? 'bg-gradient-to-br from-yellow-400 via-amber-400 to-orange-400 text-gray-900 border-2 border-yellow-200/50 shadow-[0_0_60px_rgba(250,204,21,0.35)] scale-105'
                         : 'bg-gray-900/90 text-yellow-400 border border-white/[0.08] hover:border-yellow-400/30 hover:shadow-[0_0_50px_rgba(250,204,21,0.1)] hover:scale-105 active:scale-95'
                     }`}
          aria-label={isProcessing ? 'Processing' : isListening ? 'Stop listening' : 'Start listening'}
          aria-live="polite"
        >
          {/* Breathing ring behind the button */}
          {isActive && (
            <>
              <span className="absolute inset-0 rounded-full animate-ping-slow bg-yellow-400/10" />
              <span className="absolute -inset-3 rounded-full animate-ping-slower bg-yellow-400/5" />
            </>
          )}

          {/* Icon */}
          {isProcessing ? (
            <Loader2 size={44} className="animate-spin" />
          ) : isActive ? (
            <Activity size={44} className="animate-pulse drop-shadow-lg" />
          ) : (
            <Mic size={44} className="group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.4)] transition-all" />
          )}

          {/* Sound wave inside the button */}
          <SoundWave active={isActive} />
        </button>
      </div>

      {/* ── Status Text ── */}
      <div className="relative z-10 mt-8 flex flex-col items-center gap-2">
        <p className={`text-lg sm:text-xl font-semibold tracking-wide transition-colors duration-500 ${
          isActive ? 'text-yellow-400' : isProcessing ? 'text-gray-400' : 'text-gray-300'
        }`}>
          {statusText}
        </p>

        {/* Extension status - subtle */}
        <div className={`flex items-center gap-1.5 text-xs ${extensionId ? 'text-emerald-600' : 'text-gray-700'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${extensionId ? 'bg-emerald-500 animate-pulse' : 'bg-gray-700'}`} />
          {extensionId ? 'Extension linked' : 'No extension'}
        </div>
      </div>

      {/* ── Transcript Bubble ── */}
      {transcript && (
        <div className="relative z-10 mt-6 w-full max-w-md animate-fade-in-up">
          <div className="relative p-4 bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-2xl">
            <Sparkles size={14} className="absolute top-3 right-3 text-yellow-400/40" />
            <p className="text-base text-gray-300 italic leading-relaxed">
              "{transcript}"
            </p>
          </div>
        </div>
      )}

      {/* ── Quick Action Cards ── */}
      <div className="relative z-10 mt-10 w-full max-w-lg">
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-gray-700 mb-4 font-medium">
          Quick Actions
        </p>
        <div className="grid grid-cols-4 gap-3">
          <ActionCard
            icon={ShoppingCart}
            label="Shop"
            example="Shop for headphones"
            color="yellow"
            onClick={() => handleQuickAction('shop for headphones')}
          />
          <ActionCard
            icon={Utensils}
            label="Food"
            example="Order food"
            color="yellow"
            onClick={() => handleQuickAction('order food')}
          />
          <ActionCard
            icon={Briefcase}
            label="Services"
            example="Hire a cleaner"
            color="yellow"
            onClick={() => handleQuickAction('hire a cleaner')}
          />
          <ActionCard
            icon={Youtube}
            label="YouTube"
            example="Open YouTube"
            color="yellow"
            onClick={() => handleQuickAction('open youtube')}
          />
        </div>
      </div>
    </div>
  );
};

export default VoiceAgent;
