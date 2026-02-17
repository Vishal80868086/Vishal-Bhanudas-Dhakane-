import React from 'react';
import Logo from './Logo';

interface HeaderProps {
  currentMode: 'video' | 'image';
  setMode: (mode: 'video' | 'image') => void;
}

const Header: React.FC<HeaderProps> = ({ currentMode, setMode }) => {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <Logo className="w-9 h-9 shadow-lg shadow-indigo-500/20" />
            <span className="hidden md:block text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">
              AI Creative Studio
            </span>
            <span className="md:hidden text-xl font-bold text-indigo-400">AI Studio</span>
          </div>
          
          <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50">
            <button
              onClick={() => setMode('video')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                currentMode === 'video'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Video Captions
            </button>
            <button
              onClick={() => setMode('image')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200 ${
                currentMode === 'image'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Image Editor
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;