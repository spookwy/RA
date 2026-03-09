'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardStore } from '@/store';

interface ProfilePopupProps {
  open: boolean;
  onClose: () => void;
  anchorCollapsed: boolean;
}

function getCookies(): Record<string, string> {
  return Object.fromEntries(
    document.cookie.split('; ').filter(Boolean).map(c => {
      const [k, ...v] = c.split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}



const ProfilePopup = memo(function ProfilePopup({ open, onClose, anchorCollapsed }: ProfilePopupProps) {
  const { setView } = useDashboardStore();
  const popupRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState({ nick: '', type: '', expires: '', days: '' });
  const [nowTs, setNowTs] = useState(Date.now());
  const [showActivate, setShowActivate] = useState(false);
  const [activateKey, setActivateKey] = useState('');
  const [activateError, setActivateError] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = getCookies();
    setInfo({
      nick: c['license_nick'] || 'User',
      type: c['license_type'] || 'user',
      expires: c['license_expires'] || '',
      days: c['license_days'] || '—',
    });
    setShowActivate(false);
    setActivateKey('');
    setActivateError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    document.cookie = 'license_active=; path=/; max-age=0';
    document.cookie = 'license_nick=; path=/; max-age=0';
    document.cookie = 'license_type=; path=/; max-age=0';
    document.cookie = 'license_plan=; path=/; max-age=0';
    document.cookie = 'license_expires=; path=/; max-age=0';
    document.cookie = 'license_days=; path=/; max-age=0';
    document.cookie = 'user_id=; path=/; max-age=0';
    const launcherHost = window.location.hostname || 'localhost';
    window.location.href = `${window.location.protocol}//${launcherHost}:3333/logout`;
  }, []);

  const handleSettings = useCallback(() => {
    setView('settings');
    onClose();
  }, [setView, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const daysNum = parseInt(info.days) || 0;
  const expiresMs = info.expires ? new Date(info.expires).getTime() : 0;
  const isInfinite = info.days === '\u221e' || daysNum > 3650;
  const isExpired = !isInfinite && expiresMs > 0 && expiresMs <= nowTs;
  const leftMs = Math.max(0, expiresMs - nowTs);
  const leftDays = Math.floor(leftMs / 86400000);
  const leftHours = Math.floor((leftMs % 86400000) / 3600000);
  const expiresDate = isExpired
    ? 'Free'
    : isInfinite
    ? '\u221e'
    : (expiresMs ? new Date(expiresMs).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014');
  const daysDisplay = isExpired ? 'Free' : isInfinite ? '\u221e' : (expiresMs ? `${leftDays} дн. ${leftHours} ч.` : '\u2014');

  const handleActivateSubmit = async () => {
    if (!activateKey.trim()) return;
    setActivateLoading(true);
    setActivateError('');
    try {
      // Try launcher API first (port 3333)
      const launcherHost = window.location.hostname || 'localhost';
      const resp = await fetch(`${window.location.protocol}//${launcherHost}:3333/api/activate-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: activateKey.trim() }),
        credentials: 'include',
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        // Update cookies with new subscription info
        document.cookie = 'license_expires=' + (data.expiresAt || '') + '; Path=/; Max-Age=31536000';
        const dl = data.daysLeft;
        document.cookie = 'license_days=' + (dl && dl > 3650 ? '\u221e' : dl || '0') + '; Path=/; Max-Age=31536000';
        // Also try Next.js API
        await fetch('/api/auth/activate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: activateKey.trim() }),
        }).catch(() => {});
        // Reload the page to apply changes
        window.location.reload();
      } else {
        setActivateError(data.error || 'Ошибка активации');
      }
    } catch {
      setActivateError('Ошибка соединения');
    } finally {
      setActivateLoading(false);
    }
  };

  return (
    <div
      ref={popupRef}
      className={`absolute bottom-full mb-2 ${anchorCollapsed ? 'left-1' : 'left-2 right-2'} min-w-[220px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in-scale z-50`}
    >
      {/* Profile header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-zinc-600 to-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-zinc-700">
            <span className="text-base font-bold text-white uppercase">
              {info.nick.charAt(0)}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{info.nick}</div>
            <div className="text-xs text-zinc-400 truncate">
              {info.type === 'admin' ? 'Администратор' : 'Пользователь'}
            </div>
          </div>
        </div>
      </div>

      {/* License details */}
      <div className="p-3 space-y-2.5 border-b border-zinc-800">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Действует до</span>
          <span className={`${isExpired ? 'text-red-400 font-medium' : isInfinite ? 'text-emerald-400' : daysNum <= 30 ? 'text-yellow-400' : 'text-zinc-300'}`}>
            {expiresDate}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Осталось</span>
          <span className={`font-medium ${isExpired ? 'text-red-400' : isInfinite ? 'text-emerald-400' : daysNum <= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
            {daysDisplay}
          </span>
        </div>
      </div>

      {/* Activate subscription form */}
      {showActivate ? (
        <div className="p-3 border-b border-zinc-800 space-y-2">
          <input
            type="text"
            value={activateKey}
            onChange={(e) => setActivateKey(e.target.value)}
            placeholder="VI-XXXX-XXXX-XXXX-XXXX"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleActivateSubmit()}
            autoFocus
          />
          {activateError && (
            <p className="text-xs text-red-400">{activateError}</p>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={handleActivateSubmit}
              disabled={activateLoading || !activateKey.trim()}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs py-1.5 rounded-lg transition-colors"
            >
              {activateLoading ? 'Проверка...' : 'Активировать'}
            </button>
            <button
              onClick={() => { setShowActivate(false); setActivateError(''); }}
              className="px-3 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="p-1.5">
        {/* Buy key button (always visible when expired) */}
        {isExpired && !showActivate && (
          <a
            href="https://t.me/SWAGA_HE_PA3PEIIIEHA"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-900/20 rounded-lg transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Купить ключ
          </a>
        )}
        {/* Activate subscription button */}
        {!showActivate && (
          <button
            onClick={() => setShowActivate(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-violet-400 hover:bg-violet-900/20 rounded-lg transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Активировать подписку
          </button>
        )}
        <button
          onClick={handleSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-lg transition-all duration-150"
        >
          <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Настройки
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-all duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
});

export default ProfilePopup;
