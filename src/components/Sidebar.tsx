'use client';

import React, { memo, useCallback, useState, useEffect } from 'react';
import { useDashboardStore, useDeviceStore } from '@/store';
import type { DashboardView } from '@/types';
import ProfilePopup from './ProfilePopup';

interface NavItem {
  id: DashboardView;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    id: 'overview',
    label: 'Обзор',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
      </svg>
    ),
  },
  {
    id: 'device',
    label: 'Информация о ПК',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'processes',
    label: 'Процессы',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm0 5h16" />
      </svg>
    ),
  },
  {
    id: 'files',
    label: 'Файлы',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    id: 'terminal',
    label: 'Терминал',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'screenshots',
    label: 'Удалённый экран',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'camera',
    label: 'Камера',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'control',
    label: 'Управление ПК',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'logs',
    label: 'Логи',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'builder',
    label: 'Сборка клиента',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'forensics',
    label: 'Цифровая экспертиза',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 12a2 2 0 104 0 2 2 0 00-4 0z" />
      </svg>
    ),
  },
  {
    id: 'licenses',
    label: 'Лицензии',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    id: 'updates',
    label: 'Обновление',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
];

interface UpdateInfo {
  version: string;
  file_size: number;
  download_url: string;
}

interface UpdateProgress {
  stage: string;
  percent: number;
  message: string;
  error: string;
}

const LAUNCHER_PORT = 3333;

const Sidebar = memo(function Sidebar() {
  const { currentView, setView, sidebarCollapsed, toggleSidebar } = useDashboardStore();
  const { selectedDeviceId } = useDeviceStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [daysLeft, setDaysLeft] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [licenseType, setLicenseType] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const [appVersion, setAppVersion] = useState('');

  // Update state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress>({ stage: 'idle', percent: 0, message: '', error: '' });

  // Read license info from cookies
  useEffect(() => {
    function parseCookies() {
      const cookies = Object.fromEntries(
        document.cookie.split('; ').filter(Boolean).map(c => {
          const [k, ...v] = c.split('=');
          return [k, decodeURIComponent(v.join('='))];
        })
      );
      setNickname(cookies['license_nick'] || 'User');
      setDaysLeft(cookies['license_days'] || '—');
      setExpiresAt(cookies['license_expires'] || '');
      setLicenseType(cookies['license_type'] || '');
      setIsAdmin((cookies['license_type'] || '') === 'admin');
    }
    parseCookies();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Check for updates from launcher
  useEffect(() => {
    let cancelled = false;
    async function checkUpdate() {
      try {
        const res = await fetch(`http://localhost:${LAUNCHER_PORT}/api/check-update`);
        const data = await res.json();
        // Set app version from response
        if (data.currentVersion && !cancelled) {
          setAppVersion(data.currentVersion);
        }
        if (!cancelled && data.hasUpdate && data.version) {
          setUpdateInfo({
            version: data.version,
            file_size: data.file_size || 0,
            download_url: data.download_url || '',
          });
        } else if (!cancelled) {
          setUpdateInfo(null);
        }
      } catch {
        // Launcher not running or update check failed
      }
    }
    checkUpdate();
    const interval = setInterval(checkUpdate, 10 * 60 * 1000); // every 10 min
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const startUpdate = useCallback(async () => {
    if (!updateInfo || isUpdating) return;
    setIsUpdating(true);
    setUpdateProgress({ stage: 'downloading', percent: 0, message: 'Подготовка...', error: '' });
    try {
      const res = await fetch(`http://localhost:${LAUNCHER_PORT}/api/apply-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: updateInfo.version }),
      });
      const data = await res.json();
      if (!data.success) {
        setUpdateProgress({ stage: 'error', percent: 0, message: '', error: data.error || 'Ошибка' });
        setIsUpdating(false);
        return;
      }
      // Poll progress
      const pollId = setInterval(async () => {
        try {
          const pr = await fetch(`http://localhost:${LAUNCHER_PORT}/api/update-progress`);
          const pd: UpdateProgress = await pr.json();
          setUpdateProgress(pd);
          if (pd.stage === 'restarting' || pd.stage === 'error') {
            clearInterval(pollId);
            if (pd.stage === 'error') setIsUpdating(false);
          }
        } catch {
          // App might be restarting
          clearInterval(pollId);
        }
      }, 500);
    } catch {
      setUpdateProgress({ stage: 'error', percent: 0, message: '', error: 'Нет связи с приложением' });
      setIsUpdating(false);
    }
  }, [updateInfo, isUpdating]);

  const daysNum = parseInt(daysLeft) || 0;
  const isInfinite = daysLeft === '∞' || daysNum > 3650;
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const isExpired = !isInfinite && expiresMs > 0 && expiresMs <= nowTs;
  const leftMs = Math.max(0, expiresMs - nowTs);
  const leftDays = Math.floor(leftMs / 86400000);
  const leftHours = Math.floor((leftMs % 86400000) / 3600000);
  const remainingLabel = isExpired ? 'Free' : isInfinite ? '∞' : (expiresMs ? `${leftDays} дн. ${leftHours} ч.` : '—');

  const visibleNavItems = isAdmin ? navItems : navItems.filter((item) => item.id !== 'licenses' && item.id !== 'updates');

  const toggleProfile = useCallback(() => setProfileOpen(prev => !prev), []);

  return (
    <aside
      className={`flex flex-col bg-zinc-900 border-r border-zinc-800 transition-all duration-300 ease-in-out h-screen sticky top-0 ${
        sidebarCollapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-zinc-800">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/visualillusion_white_n.png" alt="VisualIllusion" className="w-9 h-9 object-contain" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] font-semibold text-white truncate leading-tight">VisualIllusion</span>
              {appVersion && <span className="text-[10px] text-zinc-500 leading-tight">v{appVersion}</span>}
            </div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-all duration-200"
          title={sidebarCollapsed ? 'Развернуть' : 'Свернуть'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarCollapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            )}
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = currentView === item.id;
          const needsDevice = ['device', 'processes', 'files', 'terminal', 'screenshots', 'camera', 'forensics'].includes(item.id);
          const disabled = needsDevice && !selectedDeviceId;

          return (
            <button
              key={item.id}
              onClick={() => !disabled && setView(item.id)}
              disabled={disabled}
              title={sidebarCollapsed ? item.label : disabled ? 'Выберите устройство' : undefined}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-zinc-800 text-white border-r-2 border-white'
                  : disabled
                  ? 'text-zinc-600 cursor-not-allowed'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>{item.icon}</span>
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Update Button */}
      {updateInfo && (
        <div className={`px-3 mb-2 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          <button
            onClick={startUpdate}
            disabled={isUpdating && updateProgress.stage === 'restarting'}
            className={`flex items-center gap-2 w-full rounded-lg transition-all duration-200 ${
              sidebarCollapsed ? 'p-2 justify-center' : 'px-3 py-2'
            } ${
              isUpdating
                ? 'bg-zinc-800 border border-zinc-700 cursor-wait'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30'
            }`}
            title={sidebarCollapsed ? `Обновление v${updateInfo.version}` : undefined}
          >
            <svg className={`w-4 h-4 flex-shrink-0 ${isUpdating ? 'text-zinc-400 animate-pulse' : 'text-emerald-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className={`text-xs font-medium truncate ${isUpdating ? 'text-zinc-300' : 'text-emerald-400'}`}>
                  {isUpdating ? (updateProgress.message || 'Загрузка...') : `Обновление v${updateInfo.version}`}
                </span>
                {isUpdating && (
                  <div className="w-full mt-1">
                    <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${updateProgress.percent || 0}%` }}
                      />
                    </div>
                  </div>
                )}
                {!isUpdating && (
                  <span className="text-[10px] text-zinc-500 truncate">
                    {(updateInfo.file_size / 1048576).toFixed(0)} МБ
                  </span>
                )}
                {updateProgress.stage === 'error' && (
                  <span className="text-[10px] text-red-400 truncate">{updateProgress.error}</span>
                )}
              </div>
            )}
          </button>
        </div>
      )}

      {/* Telegram Channel Link */}
      <div className={`px-3 mb-2 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
        <a
          href="https://t.me/+eetQNoVO8qc0Yjlh"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2.5 rounded-lg transition-all duration-200 group ${
            sidebarCollapsed
              ? 'p-2 justify-center hover:bg-[#2AABEE]/10'
              : 'px-3 py-2 hover:bg-[#2AABEE]/10'
          }`}
          title={sidebarCollapsed ? 'Telegram канал' : undefined}
        >
          <svg className="w-5 h-5 text-[#2AABEE] flex-shrink-0 group-hover:scale-110 transition-transform duration-200" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-[#2AABEE] truncate">Telegram канал</span>
              <span className="text-[10px] text-zinc-500 truncate">Новости и обновления</span>
            </div>
          )}
        </a>
      </div>

      {/* User Profile Footer */}
      <div className="border-t border-zinc-800 p-3 relative">
        <ProfilePopup open={profileOpen} onClose={() => setProfileOpen(false)} anchorCollapsed={sidebarCollapsed} />
        {sidebarCollapsed ? (
          <button
            onClick={toggleProfile}
            className="w-full flex items-center justify-center p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-all duration-200"
            title={nickname}
          >
            <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-300 uppercase">{nickname.charAt(0)}</span>
            </div>
          </button>
        ) : (
          <button
            onClick={toggleProfile}
            className="w-full flex items-center gap-2.5 p-1 rounded-lg hover:bg-zinc-800/70 transition-all duration-200 group"
          >
            <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center flex-shrink-0 group-hover:ring-2 group-hover:ring-zinc-600 transition-all">
              <span className="text-xs font-bold text-zinc-300 uppercase">{nickname.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm text-zinc-200 font-medium truncate">{nickname}</div>
              <div className="text-xs text-zinc-500 truncate">
                {licenseType === 'admin' ? 'Админ' : 'Пользователь'} · <span className={isExpired ? 'text-red-400 font-medium' : ''}>{remainingLabel}</span>
              </div>
            </div>
            <svg className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
});

export default Sidebar;
