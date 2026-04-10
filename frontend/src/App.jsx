import React, { useState } from 'react';
import VoiceAgent from './components/VoiceAgent';
import ShoppingView from './components/ShoppingView';
import ServiceView from './components/ServiceView';

function App() {
  const [currentView, setCurrentView] = useState('agent');
  const [searchType, setSearchType] = useState('shopping');

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
      {currentView === 'agent' && (
        <div className="flex-1 flex flex-col">
          {/* ── Hero Header ── */}
          <header className="relative pt-12 pb-4 text-center z-10">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-yellow-400/[0.06] border border-yellow-400/10">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-[11px] font-medium text-yellow-400/70 uppercase tracking-[0.15em]">Voice Activated</span>
            </div>
            <h1 className="text-5xl sm:text-7xl font-black tracking-tighter">
              <span className="bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
                VisualShape
              </span>
              <span className="text-yellow-400">.</span>
            </h1>
            <p className="mt-3 text-base sm:text-lg text-gray-500 font-light tracking-wide">
              Your accessible smart hub — powered by voice
            </p>
          </header>

          {/* ── Voice Agent ── */}
          <main className="flex-1 relative">
            <VoiceAgent
              onIntent={(intent, data) => {
                if (intent === 'SHOPPING_QUERY') {
                  setSearchType('shopping');
                  setCurrentView('shopping');
                } else if (intent === 'FOOD_QUERY') {
                  setSearchType('food');
                  setCurrentView('shopping');
                } else if (intent === 'SERVICE_QUERY') {
                  setCurrentView('service');
                }
              }}
            />
          </main>

          {/* ── Footer ── */}
          <footer className="pb-6 pt-2 text-center">
            <p className="text-[11px] text-gray-800 tracking-wider">
              Built for accessibility · Speak naturally · Chrome Extension Enhanced
            </p>
          </footer>
        </div>
      )}

      {currentView === 'shopping' && (
        <ShoppingView
          searchType={searchType}
          onBack={() => setCurrentView('agent')}
        />
      )}

      {currentView === 'service' && (
        <ServiceView
          onBack={() => setCurrentView('agent')}
        />
      )}
    </div>
  );
}

export default App;
