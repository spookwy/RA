'use client';

import React, { memo, useState, useEffect } from 'react';

const Header = memo(function Header() {
  const [isElectron, setIsElectron] = useState(false);
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    setIsElectron(Boolean(window.electronAPI?.isElectron));
    setDateStr(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }, []);

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <header className="relative h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6 animate-fade-in app-drag">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-medium text-zinc-300">
          Панель администрирования
        </h1>
        <span className="text-xs text-zinc-600">|</span>
        <span className="text-xs text-zinc-500">
          {dateStr}
        </span>
      </div>

      {isElectron && (
        <div className="flex items-center gap-1 app-no-drag">
          <button
            type="button"
            onClick={handleMinimize}
            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Свернуть"
            title="Свернуть"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleMaximize}
            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Во весь экран"
            title="Во весь экран"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="5" width="14" height="14" rx="1" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 transition-colors"
            aria-label="Закрыть"
            title="Закрыть"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
});

export default Header;
