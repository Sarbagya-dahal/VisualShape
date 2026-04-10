// ─── Aura Speech Utilities ───────────────────────────────────────────
// Promise-based TTS + continuous speech recognition for accessibility
// KEY: STT stays active WHILE TTS is talking so user can interrupt.

let activeRecognition = null;
let shouldKeepListening = false;
let currentUtterance = null;
let isSpeakingNow = false;

/**
 * Check if TTS is currently speaking.
 */
export const isSpeaking = () => isSpeakingNow;

/**
 * Speak text via Web Speech API.
 * Returns a Promise that resolves when the utterance finishes.
 * DOES NOT cancel active STT — user can interrupt by speaking "stop".
 */
export const speak = (text) => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    isSpeakingNow = true;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';
    currentUtterance = utterance;

    utterance.onend = () => {
      isSpeakingNow = false;
      currentUtterance = null;
      resolve();
    };
    utterance.onerror = () => {
      isSpeakingNow = false;
      currentUtterance = null;
      resolve();
    };

    window.speechSynthesis.speak(utterance);
  });
};

/**
 * Cancel any ongoing speech synthesis immediately (emergency halt).
 */
export const stopSpeaking = () => {
  isSpeakingNow = false;
  currentUtterance = null;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

/**
 * Listen for a single voice input (one-shot).
 * @param {Function} onResult  - called with transcript string
 * @param {Function} onEnd     - called when recognition ends
 */
export const listen = (onResult, onEnd) => {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.error('Speech recognition not supported');
    if (onEnd) onEnd();
    return;
  }

  // Stop any existing recognition first
  stopListening();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (onResult) onResult(transcript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    if (onEnd) onEnd();
  };

  recognition.onend = () => {
    activeRecognition = null;
    if (onEnd) onEnd();
  };

  activeRecognition = recognition;
  recognition.start();
};

/**
 * Start continuous listening loop.
 * Recognition auto-restarts on end until stopListening() is called.
 * This runs IN PARALLEL with TTS so the user can interrupt at any time.
 *
 * @param {Function} onResult  - called with transcript string each time a phrase is recognized
 * @param {Function} onError   - optional error callback
 * @returns {Function} stop    - call this to stop the loop
 */
export const listenContinuous = (onResult, onError) => {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.error('Speech recognition not supported');
    return () => {};
  }

  // Stop any existing recognition first
  stopListening();

  shouldKeepListening = true;

  const startRecognition = () => {
    if (!shouldKeepListening) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (onResult) onResult(transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        if (onError) onError(event.error);
      }
    };

    recognition.onend = () => {
      // Auto-restart if we should keep listening
      if (shouldKeepListening) {
        setTimeout(() => {
          if (shouldKeepListening) {
            startRecognition();
          } else {
            activeRecognition = null;
          }
        }, 150);
      } else {
        activeRecognition = null;
      }
    };

    activeRecognition = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      // Retry after a delay
      setTimeout(() => {
        if (shouldKeepListening) startRecognition();
      }, 500);
    }
  };

  startRecognition();

  // Return a stop function
  return () => stopListening();
};

/**
 * Stop any active speech recognition.
 */
export const stopListening = () => {
  shouldKeepListening = false;
  if (activeRecognition) {
    try {
      activeRecognition.abort();
    } catch (e) {
      // Already stopped
    }
    activeRecognition = null;
  }
};
