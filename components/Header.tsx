import React from 'react';
import Logo from './Logo';

const Header: React.FC = () => {
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
        </div>
      </div>
    </header>
  );
};

export default Header;