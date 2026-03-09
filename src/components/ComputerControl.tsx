'use client';

import React, { memo, useState, useCallback } from 'react';
import { useDeviceStore, getGlobalWsSend } from '@/store';

type ActionCategory = 'power' | 'apps' | 'media' | 'web' | 'system' | 'network';

interface ActionResult {
  id: string;
  action: string;
  status: 'pending' | 'sent' | 'error';
  timestamp: string;
}

function sendCommand(deviceId: string, command: string, shell: 'cmd' | 'powershell' = 'cmd') {
  const send = getGlobalWsSend();
  if (send) {
    send({
      type: 'command_request',
      payload: { deviceId, command, shell },
    });
    return true;
  }
  return false;
}

const ComputerControl = memo(function ComputerControl() {
  const { selectedDeviceId } = useDeviceStore();
  const device = useDeviceStore((s) => s.getSelectedDevice());
  const [activeCategory, setActiveCategory] = useState<ActionCategory>('power');
  const [results, setResults] = useState<ActionResult[]>([]);
  const [customUrl, setCustomUrl] = useState('');
  const [customApp, setCustomApp] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [volumeLevel, setVolumeLevel] = useState(50);
  const [wallpaperUrl, setWallpaperUrl] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ label: string; cmd: string; shell: 'cmd' | 'powershell' } | null>(null);

  const addResult = useCallback((action: string, status: 'sent' | 'error') => {
    setResults((prev) => [
      { id: `r-${Date.now()}`, action, status, timestamp: new Date().toLocaleTimeString() },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const exec = useCallback(
    (label: string, command: string, shell: 'cmd' | 'powershell' = 'cmd') => {
      if (!selectedDeviceId) return;
      const ok = sendCommand(selectedDeviceId, command, shell);
      addResult(label, ok ? 'sent' : 'error');
    },
    [selectedDeviceId, addResult]
  );

  const execWithConfirm = useCallback(
    (label: string, command: string, shell: 'cmd' | 'powershell' = 'cmd') => {
      setConfirmAction({ label, cmd: command, shell });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (confirmAction && selectedDeviceId) {
      const ok = sendCommand(selectedDeviceId, confirmAction.cmd, confirmAction.shell);
      addResult(confirmAction.label, ok ? 'sent' : 'error');
    }
    setConfirmAction(null);
  }, [confirmAction, selectedDeviceId, addResult]);

  const categories: { id: ActionCategory; label: string; icon: React.ReactNode }[] = [
    {
      id: 'power',
      label: 'Питание',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: 'apps',
      label: 'Приложения',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'media',
      label: 'Медиа',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      ),
    },
    {
      id: 'web',
      label: 'Веб',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      ),
    },
    {
      id: 'system',
      label: 'Система',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'network',
      label: 'Сеть',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
        </svg>
      ),
    },
  ];

  if (!device || !selectedDeviceId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
        <svg className="w-16 h-16 mb-4 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">Выберите устройство для управления</p>
      </div>
    );
  }

  const ActionButton = ({ label, icon, onClick, color = 'zinc', danger = false }: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    color?: string;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all active:scale-[0.97] ${
        danger
          ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40 text-red-400'
          : color === 'emerald'
          ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-emerald-400'
          : color === 'blue'
          ? 'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10 hover:border-blue-500/40 text-blue-400'
          : color === 'amber'
          ? 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/40 text-amber-400'
          : color === 'purple'
          ? 'bg-purple-500/5 border-purple-500/20 hover:bg-purple-500/10 hover:border-purple-500/40 text-purple-400'
          : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600 text-zinc-300'
      }`}
    >
      <div className="w-8 h-8 flex items-center justify-center">{icon}</div>
      <span className="text-xs font-medium text-center leading-tight">{label}</span>
    </button>
  );

  const renderContent = () => {
    switch (activeCategory) {
      case 'power':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <ActionButton
              label="Выключить ПК"
              color="zinc"
              danger
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>}
              onClick={() => execWithConfirm('Выключение ПК', 'shutdown /s /f /t 5')}
            />
            <ActionButton
              label="Перезагрузить"
              color="amber"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              onClick={() => execWithConfirm('Перезагрузка ПК', 'shutdown /r /f /t 5')}
            />
            <ActionButton
              label="Заблокировать"
              color="blue"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
              onClick={() => exec('Блокировка экрана', 'rundll32.exe user32.dll,LockWorkStation')}
            />
            <ActionButton
              label="Спящий режим"
              color="purple"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
              onClick={() => exec('Спящий режим', 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0')}
            />
            <ActionButton
              label="Гибернация"
              color="purple"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>}
              onClick={() => execWithConfirm('Гибернация', 'shutdown /h')}
            />
            <ActionButton
              label="Выйти из учётной записи"
              color="amber"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>}
              onClick={() => execWithConfirm('Выход из учётки', 'shutdown /l')}
            />
            <ActionButton
              label="Отмена выключения"
              color="emerald"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>}
              onClick={() => exec('Отмена выключения', 'shutdown /a')}
            />
          </div>
        );

      case 'apps':
        return (
          <div className="space-y-4">
            {/* Launch custom app */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-3">Запустить приложение</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customApp}
                  onChange={(e) => setCustomApp(e.target.value)}
                  placeholder="notepad.exe, calc, mspaint..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customApp.trim()) {
                      exec(`Запуск: ${customApp}`, `start "" "${customApp}"`, 'cmd');
                      setCustomApp('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (customApp.trim()) {
                      exec(`Запуск: ${customApp}`, `start "" "${customApp}"`, 'cmd');
                      setCustomApp('');
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                >
                  Запустить
                </button>
              </div>
            </div>

            {/* Quick launch buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <ActionButton label="Блокнот" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                onClick={() => exec('Открыт Блокнот', 'start notepad')}
              />
              <ActionButton label="Калькулятор" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
                onClick={() => exec('Открыт Калькулятор', 'start calc')}
              />
              <ActionButton label="Диспетчер задач" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                onClick={() => exec('Открыт Диспетчер задач', 'start taskmgr')}
              />
              <ActionButton label="Проводник" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                onClick={() => exec('Открыт Проводник', 'start explorer')}
              />
              <ActionButton label="CMD" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                onClick={() => exec('Открыт CMD', 'start cmd')}
              />
              <ActionButton label="PowerShell" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                onClick={() => exec('Открыт PowerShell', 'start powershell')}
              />
              <ActionButton label="Paint" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                onClick={() => exec('Открыт Paint', 'start mspaint')}
              />
              <ActionButton label="Панель управления" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>}
                onClick={() => exec('Открыта Панель управления', 'start control')}
              />
              <ActionButton label="Параметры Windows" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                onClick={() => exec('Открыты Параметры', 'start ms-settings:')}
              />
              <ActionButton label="Удаление программ" color="amber"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                onClick={() => exec('Открыто Удаление программ', 'start appwiz.cpl')}
              />
              <ActionButton label="Реестр" color="amber"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7zm0 5h16" /></svg>}
                onClick={() => exec('Открыт Реестр', 'start regedit')}
              />
              <ActionButton label="Информация о системе" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                onClick={() => exec('Открыта Информация о системе', 'start msinfo32')}
              />
            </div>
          </div>
        );

      case 'media':
        return (
          <div className="space-y-4">
            {/* Volume control */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-3">Управление громкостью</h4>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => exec('Звук выключен', 'powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"', 'cmd')}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volumeLevel}
                  onChange={(e) => setVolumeLevel(Number(e.target.value))}
                  className="flex-1 accent-emerald-500 h-2"
                />
                <span className="text-sm font-mono text-zinc-300 w-10 text-right">{volumeLevel}%</span>
                <button
                  onClick={() => {
                    exec(`Громкость: ${volumeLevel}%`, `powershell -c "$vol = ${volumeLevel}; $wshell = New-Object -ComObject WScript.Shell; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Multimedia\\Audio' -Name 'Volume' -Value $vol -ErrorAction SilentlyContinue; $obj = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $obj.SendKeys([char]174) }; 1..${Math.round(volumeLevel / 2)} | ForEach-Object { $obj.SendKeys([char]175) }"`, 'cmd');
                  }}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                >
                  Применить
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <ActionButton label="Mute / Unmute" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>}
                onClick={() => exec('Mute/Unmute', 'powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"', 'cmd')}
              />
              <ActionButton label="Play / Pause" color="emerald"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                onClick={() => exec('Play/Pause', 'powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"', 'cmd')}
              />
              <ActionButton label="Следующий трек" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5l7 7-7 7" /></svg>}
                onClick={() => exec('Следующий трек', 'powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]176)"', 'cmd')}
              />
              <ActionButton label="Предыдущий трек" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19l-7-7 7-7" /></svg>}
                onClick={() => exec('Предыдущий трек', 'powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]177)"', 'cmd')}
              />
            </div>

            {/* Message popup */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-3">Показать сообщение на экране</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Текст сообщения..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customMessage.trim()) {
                      exec(`Сообщение: ${customMessage.slice(0, 30)}...`, `powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${customMessage.replace(/'/g, "''")}', 'Сообщение', 'OK', 'Information')"`, 'cmd');
                      setCustomMessage('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (customMessage.trim()) {
                      exec(`Сообщение: ${customMessage.slice(0, 30)}...`, `powershell -c "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${customMessage.replace(/'/g, "''")}', 'Сообщение', 'OK', 'Information')"`, 'cmd');
                      setCustomMessage('');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                >
                  Отправить
                </button>
              </div>
            </div>
          </div>
        );

      case 'web':
        return (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-3">Открыть сайт</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customUrl.trim()) {
                      const url = customUrl.startsWith('http') ? customUrl : `https://${customUrl}`;
                      exec(`Открыт: ${url}`, `start ${url}`, 'cmd');
                      setCustomUrl('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (customUrl.trim()) {
                      const url = customUrl.startsWith('http') ? customUrl : `https://${customUrl}`;
                      exec(`Открыт: ${url}`, `start ${url}`, 'cmd');
                      setCustomUrl('');
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                >
                  Открыть
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <ActionButton label="Google" color="blue"
                icon={<span className="text-xl font-bold">G</span>}
                onClick={() => exec('Открыт Google', 'start https://google.com', 'cmd')}
              />
              <ActionButton label="YouTube" color="zinc"
                icon={<span className="text-xl">▶</span>}
                onClick={() => exec('Открыт YouTube', 'start https://youtube.com', 'cmd')}
              />
              <ActionButton label="GitHub" color="zinc"
                icon={<span className="text-xl">⚙</span>}
                onClick={() => exec('Открыт GitHub', 'start https://github.com', 'cmd')}
              />
              <ActionButton label="Reddit" color="amber"
                icon={<span className="text-xl font-bold">R</span>}
                onClick={() => exec('Открыт Reddit', 'start https://reddit.com', 'cmd')}
              />
            </div>
          </div>
        );

      case 'system':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <ActionButton label="Очистить корзину" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                onClick={() => exec('Корзина очищена', 'powershell -c "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"', 'cmd')}
              />
              <ActionButton label="Очистить TEMP" color="zinc"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
                onClick={() => exec('TEMP очищен', 'del /q/f/s %TEMP%\\* 2>nul', 'cmd')}
              />
              <ActionButton label="Очистка диска" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>}
                onClick={() => exec('Очистка диска запущена', 'cleanmgr /d C', 'cmd')}
              />
              <ActionButton label="Проверка диска" color="amber"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                onClick={() => exec('sfc /scannow', 'sfc /scannow', 'cmd')}
              />
              <ActionButton label="IP конфигурация" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                onClick={() => exec('ipconfig /all', 'ipconfig /all', 'cmd')}
              />
              <ActionButton label="Обновить DNS" color="emerald"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                onClick={() => exec('DNS обновлён', 'ipconfig /flushdns', 'cmd')}
              />
              <ActionButton label="Отключить брандмауэр" color="zinc" danger
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                onClick={() => execWithConfirm('Брандмауэр отключен', 'netsh advfirewall set allprofiles state off')}
              />
              <ActionButton label="Включить брандмауэр" color="emerald"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                onClick={() => exec('Брандмауэр включен', 'netsh advfirewall set allprofiles state on')}
              />
              <ActionButton label="Скрыть панель задач" color="purple"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>}
                onClick={() => exec('Панель задач скрыта', 'powershell -c "$p = \'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3\'; $v = (Get-ItemProperty -Path $p).Settings; $v[8] = 3; Set-ItemProperty -Path $p -Name Settings -Value $v; Stop-Process -Name explorer -Force"', 'cmd')}
              />
              <ActionButton label="Показать панель задач" color="emerald"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                onClick={() => exec('Панель задач восстановлена', 'powershell -c "$p = \'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StuckRects3\'; $v = (Get-ItemProperty -Path $p).Settings; $v[8] = 2; Set-ItemProperty -Path $p -Name Settings -Value $v; Stop-Process -Name explorer -Force"', 'cmd')}
              />
              <ActionButton label="Перезапустить Explorer" color="amber"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                onClick={() => exec('Explorer перезапущен', 'taskkill /f /im explorer.exe & start explorer.exe', 'cmd')}
              />
              <ActionButton label="Убить все Chrome" color="zinc" danger
                icon={<span className="text-lg font-bold">✕</span>}
                onClick={() => exec('Chrome убит', 'taskkill /f /im chrome.exe', 'cmd')}
              />
            </div>

            {/* Wallpaper */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <h4 className="text-sm font-medium text-white mb-3">Сменить обои (URL изображения)</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wallpaperUrl}
                  onChange={(e) => setWallpaperUrl(e.target.value)}
                  placeholder="https://example.com/wallpaper.jpg"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && wallpaperUrl.trim()) {
                      exec('Обои обновлены', `powershell -c "$url='${wallpaperUrl}'; $path=\\"$env:TEMP\\\\wallpaper.jpg\\"; (New-Object Net.WebClient).DownloadFile($url,$path); Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\",CharSet=CharSet.Auto)]public static extern int SystemParametersInfo(int a,int b,string c,int d);}'; [W]::SystemParametersInfo(20,0,$path,3)"`, 'cmd');
                      setWallpaperUrl('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (wallpaperUrl.trim()) {
                      exec('Обои обновлены', `powershell -c "$url='${wallpaperUrl}'; $path=\\"$env:TEMP\\\\wallpaper.jpg\\"; (New-Object Net.WebClient).DownloadFile($url,$path); Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\",CharSet=CharSet.Auto)]public static extern int SystemParametersInfo(int a,int b,string c,int d);}'; [W]::SystemParametersInfo(20,0,$path,3)"`, 'cmd');
                      setWallpaperUrl('');
                    }
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        );

      case 'network':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <ActionButton label="Отключить Wi-Fi" color="zinc" danger
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829" /></svg>}
                onClick={() => exec('Wi-Fi отключен', 'netsh interface set interface "Wi-Fi" disable', 'cmd')}
              />
              <ActionButton label="Включить Wi-Fi" color="emerald"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" /></svg>}
                onClick={() => exec('Wi-Fi включен', 'netsh interface set interface "Wi-Fi" enable', 'cmd')}
              />
              <ActionButton label="Список Wi-Fi сетей" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" /></svg>}
                onClick={() => exec('Список Wi-Fi сетей', 'netsh wlan show networks', 'cmd')}
              />
              <ActionButton label="Сохранённые пароли Wi-Fi" color="amber"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>}
                onClick={() => exec('Wi-Fi пароли', 'powershell -c "(netsh wlan show profiles) | Select-String \'\\:\\s+(.+)$\' | ForEach-Object { $name=$_.Matches.Groups[1].Value.Trim(); $pass=(netsh wlan show profile name=$name key=clear) | Select-String \'Key Content\\s+:\\s+(.+)$\'; Write-Host ($name + \' : \' + $(if($pass){$pass.Matches.Groups[1].Value.Trim()} else {\'<нет>\'})) }"', 'cmd')}
              />
              <ActionButton label="Сбросить DNS" color="emerald"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                onClick={() => exec('DNS сброшен', 'ipconfig /flushdns', 'cmd')}
              />
              <ActionButton label="Сбросить сеть" color="zinc" danger
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                onClick={() => execWithConfirm('Сброс сети', 'netsh int ip reset & netsh winsock reset')}
              />
              <ActionButton label="Открытые порты" color="blue"
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                onClick={() => exec('Открытые порты', 'netstat -an | findstr LISTENING', 'cmd')}
              />
              <ActionButton label="Ping Google" color="zinc"
                icon={<span className="text-lg">🏓</span>}
                onClick={() => exec('Ping Google', 'ping google.com -n 4', 'cmd')}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Device info bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">{device.hostname}</h3>
            <p className="text-xs text-zinc-500">{device.ip} · {device.os}</p>
          </div>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          device.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
        }`}>
          {device.status === 'online' ? 'В сети' : 'Не в сети'}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeCategory === cat.id
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Actions content */}
      <div>{renderContent()}</div>

      {/* Action log */}
      {results.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="text-sm font-medium text-zinc-400">История действий</h4>
            </div>
            <button
              onClick={() => setResults([])}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Очистить
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-zinc-800/50">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${r.status === 'sent' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-xs text-zinc-300">{r.action}</span>
                </div>
                <span className="text-[10px] text-zinc-600">{r.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmAction(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold">Подтверждение</h3>
                <p className="text-xs text-zinc-500">Это действие может повлиять на работу устройства</p>
              </div>
            </div>
            <p className="text-sm text-zinc-300 mb-6">
              Вы уверены, что хотите выполнить <span className="text-white font-medium">&quot;{confirmAction.label}&quot;</span> на <span className="text-white font-medium">{device.hostname}</span>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Выполнить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ComputerControl;
