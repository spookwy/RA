'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDeviceStore, useDashboardStore, useProcessStore, useFileStore, useLogStore, useScreenshotStore, useScreenStreamStore, useCameraStore, useForensicsStore, useTerminalStore, setGlobalWsSend, getPendingDownloadCallback } from '@/store';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Device, WSMessage } from '@/types';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import DeviceList from '@/components/DeviceList';
import SystemInfo from '@/components/SystemInfo';
import ProcessManager from '@/components/ProcessManager';
import FileManager from '@/components/FileManager';
import RemoteTerminal from '@/components/RemoteTerminal';
import LogsViewer from '@/components/LogsViewer';
import ScreenViewer from '@/components/ScreenViewer';
import Settings from '@/components/Settings';
import ClientBuilder from '@/components/ClientBuilder';
import LicenseManager from '@/components/LicenseManager';
import ComputerControl from '@/components/ComputerControl';
import CameraViewer from '@/components/CameraViewer';
import ForensicExpert from '@/components/ForensicExpert';
import UpdateManager from '@/components/UpdateManager';
import ErrorBoundary from '@/components/ErrorBoundary';

const viewTitles: Record<string, string> = {
  overview: 'Обзор устройств',
  device: 'Системная информация',
  processes: 'Диспетчер процессов',
  files: 'Файловый менеджер',
  terminal: 'Удаленный терминал',
  screenshots: 'Удалённый экран',
  camera: 'Камера',
  control: 'Управление компьютером',
  logs: 'Журнал событий',
  settings: 'Настройки',
  builder: 'Сборка клиента',
  licenses: 'Управление лицензиями',
  forensics: 'Цифровая экспертиза',
  updates: 'Управление обновлениями',
};

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [activateKey, setActivateKey] = useState('');
  const [activateError, setActivateError] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const { addOrUpdateDevice, updateDevice } = useDeviceStore();
  const { currentView, setView } = useDashboardStore();

  const [wsUrl, setWsUrl] = useState(() => {
    if (typeof window === 'undefined') return 'ws://localhost:3001';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${window.location.hostname}:3001`;
  });

  // Fetch the actual WS URL from server (handles tunnel URLs)
  useEffect(() => {
    setMounted(true);
    const cookies = Object.fromEntries(
      document.cookie
        .split('; ')
        .filter(Boolean)
        .map((cookie) => {
          const [k, ...v] = cookie.split('=');
          return [k, decodeURIComponent(v.join('='))];
        })
    );
    setIsAdmin((cookies['license_type'] || '') === 'admin');
    // Check subscription expiry
    const expiresAt = cookies['license_expires'] || '';
    const daysLeft = cookies['license_days'] || '';
    const isInfinite = daysLeft === '∞' || (parseInt(daysLeft) || 0) > 3650;
    if (!isInfinite && expiresAt) {
      const expiresMs = new Date(expiresAt).getTime();
      if (expiresMs <= Date.now()) {
        setIsExpired(true);
      }
    }
    // Ensure user_id cookie exists (needed for WS auth & device ownership)
    if (!cookies['user_id']) {
      fetch('/api/auth/me').then(r => r.json()).then(data => {
        if (data.user?.id) {
          document.cookie = `user_id=${encodeURIComponent(data.user.id)}; Path=/; Max-Age=31536000`;
          setUserId(data.user.id);
        }
      }).catch(() => { /* ignore */ });
    } else {
      // Verify user_id is still valid (not stale from a deleted account)
      fetch(`/api/auth/verify-user?id=${encodeURIComponent(cookies['user_id'])}`)
        .then(r => r.json())
        .then(data => {
          if (data.valid) {
            setUserId(cookies['user_id']);
          } else {
            // user_id is stale — try to get the correct one from JWT
            console.warn('[Dashboard] user_id cookie points to non-existent user, attempting recovery...');
            fetch('/api/auth/me').then(r => r.json()).then(meData => {
              if (meData.user?.id) {
                document.cookie = `user_id=${encodeURIComponent(meData.user.id)}; Path=/; Max-Age=31536000`;
                setUserId(meData.user.id);
              } else {
                // Can't recover — clear and redirect to login
                document.cookie = 'user_id=; Path=/; Max-Age=0';
                setUserId(cookies['user_id']); // still try, WS will reject if invalid
              }
            }).catch(() => {
              setUserId(cookies['user_id']); // still try
            });
          }
        })
        .catch(() => {
          setUserId(cookies['user_id']); // on error, try anyway
        });
    }
    fetch('/api/ws-url').then(r => r.json()).then(data => {
      if (data.url) {
        console.log('[Dashboard] WS URL from server:', data.url);
        setWsUrl(data.url);
      }
    }).catch(() => { /* keep default */ });
  }, []);

  useEffect(() => {
    if (!isAdmin && currentView === 'licenses') {
      setView('overview');
    }
  }, [currentView, isAdmin, setView]);

  // ==================== WebSocket: connect as admin ====================
  const handleWsMessage = useCallback((message: WSMessage) => {
    const msg = message as WSMessage & { deviceId?: string; payload?: Record<string, unknown> };
    const { type, deviceId, payload } = msg;

    switch (type) {
      // Full list of currently connected agents (sent on admin connect)
      case 'agent_list': {
        const agents = (payload as unknown) as Array<{
          deviceId: string; hostname: string; ip: string;
          os: string; agentVersion: string; clientName: string;
          status?: string; lastSeen?: string;
          country?: string; countryCode?: string; city?: string;
        }>;
        if (Array.isArray(agents)) {
          agents.forEach((a) => {
            const isOnline = a.status !== 'offline';
            const dev: Device = {
              id: a.deviceId,
              hostname: a.hostname || a.clientName || 'Unknown',
              ip: a.ip || '0.0.0.0',
              mac: '—',
              status: isOnline ? 'online' : 'offline',
              os: a.os || 'Unknown',
              lastSeen: a.lastSeen || new Date().toISOString(),
              uptime: 0,
              agentVersion: a.agentVersion,
              country: a.country || '',
              countryCode: a.countryCode || '',
            };
            addOrUpdateDevice(dev);
          });

          // Log only online agents
          agents.filter(a => a.status !== 'offline').forEach((a) => {
            useLogStore.getState().addLog({
              id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: new Date().toISOString(),
              deviceId: a.deviceId,
              deviceName: a.hostname || a.clientName || 'Unknown',
              level: 'info',
              category: 'connection',
              message: `Устройство подключено: ${a.hostname || a.clientName} (${a.ip})`,
            });
          });
        }
        break;
      }

      // Agent connected or disconnected
      case 'device_status': {
        const p = payload as Record<string, unknown> | undefined;
        if (!p) break;
        const status = p.status as string;
        if (status === 'online') {
          const dev: Device = {
            id: (p.deviceId as string) || deviceId || '',
            hostname: (p.hostname as string) || (p.clientName as string) || 'Unknown',
            ip: (p.ip as string) || '0.0.0.0',
            mac: '—',
            status: 'online',
            os: (p.os as string) || 'Unknown',
            lastSeen: new Date().toISOString(),
            uptime: (p.uptime as number) || 0,
            agentVersion: (p.agentVersion as string) || '1.0.0',
            country: (p.country as string) || '',
            countryCode: (p.countryCode as string) || '',
          };
          addOrUpdateDevice(dev);

          // Log connection
          useLogStore.getState().addLog({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            deviceId: dev.id,
            deviceName: dev.hostname,
            level: 'info',
            category: 'connection',
            message: `Устройство подключено: ${dev.hostname} (${dev.ip})`,
          });
        } else if (status === 'offline' && deviceId) {
          updateDevice(deviceId, { status: 'offline', lastSeen: new Date().toISOString() });

          // Log disconnection
          const device = useDeviceStore.getState().devices.find(d => d.id === deviceId);
          useLogStore.getState().addLog({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            deviceId: deviceId,
            deviceName: device?.hostname || 'Unknown',
            level: 'warning',
            category: 'connection',
            message: `Устройство отключено: ${device?.hostname || deviceId}`,
          });
        }
        break;
      }

      // Real-time system info from agent
      case 'system_info': {
        if (deviceId && payload) {
          const sysInfo = payload as unknown as Device['systemInfo'];
          updateDevice(deviceId, {
            systemInfo: sysInfo,
            lastSeen: new Date().toISOString(),
            status: 'online',
            uptime: (payload as Record<string, unknown>).uptime as number || 0,
          });
        }
        break;
      }

      // Process list from agent
      case 'process_list': {
        if (deviceId && payload) {
          const selectedId = useDeviceStore.getState().selectedDeviceId;
          if (selectedId === deviceId) {
            useProcessStore.getState().setProcesses(payload as unknown as import('@/types').ProcessInfo[]);
          }
        }
        break;
      }

      // File list from agent
      case 'file_list': {
        if (deviceId && payload) {
          const selectedId = useDeviceStore.getState().selectedDeviceId;
          if (selectedId === deviceId) {
            const p = payload as Record<string, unknown>;
            if (p.error) {
              console.error('[Files] Error:', p.error);
            }
            const files = (p.files || []) as import('@/types').FileEntry[];
            useFileStore.getState().setFiles(files);

            // Log file browsing
            const device = useDeviceStore.getState().devices.find(d => d.id === deviceId);
            useLogStore.getState().addLog({
              id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: new Date().toISOString(),
              deviceId: deviceId,
              deviceName: device?.hostname || 'Unknown',
              level: 'info',
              category: 'file',
              message: `Просмотр папки: ${p.path || '/'} (${files.length} файлов)`,
            });
          }
        }
        break;
      }

      // Screenshot from agent
      case 'screenshot': {
        if (deviceId && payload) {
          const p = payload as Record<string, unknown>;
          if (p.error) {
            useScreenshotStore.getState().setError(deviceId, p.error as string);
          } else {
            useScreenshotStore.getState().setScreenshot(deviceId, {
              image: p.image as string,
              width: (p.width as number) || 1920,
              height: (p.height as number) || 1080,
              timestamp: (p.timestamp as string) || new Date().toISOString(),
            });

            // Log screenshot captured
            const device = useDeviceStore.getState().devices.find(d => d.id === deviceId);
            useLogStore.getState().addLog({
              id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: new Date().toISOString(),
              deviceId: deviceId,
              deviceName: device?.hostname || 'Unknown',
              level: 'info',
              category: 'security',
              message: `Снимок экрана получен (${p.width}x${p.height})`,
            });
          }
        }
        break;
      }

      // Camera list from agent
      case 'camera_list': {
        if (deviceId && payload) {
          const p = payload as Record<string, unknown>;
          const cameras = (p.cameras || []) as Array<{id: string; name: string}>;
          useCameraStore.getState().setCameras(deviceId, cameras);
        }
        break;
      }

      // Camera frame from agent
      case 'camera_frame': {
        if (deviceId && payload) {
          const p = payload as Record<string, unknown>;
          if (p.error) {
            useCameraStore.getState().setError(deviceId, p.error as string);
          } else if (p.image) {
            useCameraStore.getState().setFrame(deviceId, p.image as string);
          }
        }
        break;
      }

      // Screen stream frame from agent
      case 'screen_frame': {
        if (deviceId && payload) {
          const p = payload as Record<string, unknown>;
          if (p.error) {
            useScreenStreamStore.getState().setError(deviceId, p.error as string);
          } else if (p.image) {
            useScreenStreamStore.getState().setFrame(
              deviceId,
              p.image as string,
              (p.width as number) || 1920,
              (p.height as number) || 1080
            );
          }
        }
        break;
      }

      // Command result (logs + terminal)
      case 'command_result': {
        if (deviceId && payload) {
          const p = payload as Record<string, unknown>;
          const device = useDeviceStore.getState().devices.find(d => d.id === deviceId);
          useLogStore.getState().addLog({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            deviceId: deviceId,
            deviceName: device?.hostname || 'Unknown',
            level: p.error ? 'error' : 'info',
            category: 'system',
            message: `Команда выполнена: ${p.command} (код: ${p.exitCode})`,
          });
          // Also update terminal with actual output
          const stdout = (p.stdout as string) || '';
          const stderr = (p.stderr as string) || '';
          const output = stdout + (stderr ? (stdout ? '\n' : '') + stderr : '');
          useTerminalStore.getState().addResult({
            id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            deviceId,
            command: (p.command as string) || '',
            output: output || (p.error as string) || 'Команда выполнена без вывода',
            exitCode: (p.exitCode as number) ?? 0,
            timestamp: new Date().toISOString(),
            duration: 0,
          });
          useTerminalStore.getState().setExecuting(false);
        }
        break;
      }

      // Agent console log output → Terminal tab
      case 'agent_log': {
        if (deviceId && payload) {
          const p = payload as Record<string, unknown>;
          useTerminalStore.getState().addAgentLog(deviceId, {
            id: `alog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            level: (p.level as 'info' | 'warn' | 'error') || 'info',
            text: (p.text as string) || '',
            ts: (p.ts as string) || new Date().toISOString(),
          });
        }
        break;
      }

      // Forensic result from agent
      case 'forensic_result': {
        if (deviceId && payload) {
          const p = payload as Record<string, unknown>;
          useForensicsStore.getState().setResult(deviceId, {
            scanId: (p.scanId as string) || `scan-${Date.now()}`,
            deviceId,
            timestamp: (p.timestamp as string) || new Date().toISOString(),
            scanType: (p.scanType as 'sessions' | 'inventory' | 'full') || 'full',
            sessions: p.sessions as import('@/types').ForensicSessionData | undefined,
            inventory: p.inventory as import('@/types').ForensicInventoryData | undefined,
            files: (p.files as import('@/types').ForensicFileEntry[]) || [],
            archiveReady: !!p.archiveData,
            archiveData: p.archiveData as string | undefined,
            archiveName: p.archiveName as string | undefined,
            reportText: p.reportText as string | undefined,
            error: p.error as string | undefined,
            progress: (p.progress as number) || 100,
            status: (p.status as 'scanning' | 'complete' | 'error') || 'complete',
          });
        }
        break;
      }

      // Download result from agent
      case 'download_result': {
        if (payload) {
          const p = payload as Record<string, unknown>;
          const cb = getPendingDownloadCallback();
          if (cb) {
            cb({
              name: (p.name as string) || 'file',
              data: (p.data as string) || '',
              mime: (p.mime as string) || 'application/octet-stream',
              size: (p.size as number) || 0,
              error: p.error as string | undefined,
            });
          }
        }
        break;
      }

      // Device removed by admin
      case 'device_removed': {
        if (deviceId) {
          useDeviceStore.getState().removeDevice(deviceId);
        }
        break;
      }

      // Auth error from WS server — user_id is invalid/stale
      case 'auth_error': {
        console.error('[Dashboard] WS auth error — clearing stale user_id cookie');
        // Clear stale user_id cookie and redirect to login
        document.cookie = 'user_id=; Path=/; Max-Age=0';
        document.cookie = 'license_active=; Path=/; Max-Age=0';
        window.location.href = '/login';
        break;
      }
    }
  }, [addOrUpdateDevice, updateDevice]);

  const wsActions = useWebSocket({
    url: wsUrl,
    onConnect: (send) => {
      // Read user identity from cookies for per-user device isolation
      const ck = Object.fromEntries(
        document.cookie.split('; ').filter(Boolean).map((c) => {
          const [k, ...v] = c.split('=');
          return [k, decodeURIComponent(v.join('='))];
        })
      );
      send({
        type: 'register_admin',
        payload: { userId: ck['user_id'] || userId || '', role: ck['license_type'] || 'user' },
        timestamp: new Date().toISOString(),
      });
    },
    onMessage: handleWsMessage,
    enabled: !!userId,
  });

  // Expose WS send globally so components can request data from agents
  useEffect(() => {
    setGlobalWsSend(wsActions.send as unknown as (message: Record<string, unknown>) => void);
  }, [wsActions.send]);

  // Don't clear devices on mount — we want to preserve offline devices
  // The agent_list from WS server will update states properly

  const ViewComponent = useMemo(() => {
    switch (currentView) {
      case 'overview':
        return DeviceList;
      case 'device':
        return SystemInfo;
      case 'processes':
        return ProcessManager;
      case 'files':
        return FileManager;
      case 'terminal':
        return RemoteTerminal;
      case 'screenshots':
        return ScreenViewer;
      case 'camera':
        return CameraViewer;
      case 'forensics':
        return ForensicExpert;
      case 'control':
        return ComputerControl;
      case 'logs':
        return LogsViewer;
      case 'settings':
        return Settings;
      case 'builder':
        return ClientBuilder;
      case 'licenses':
        return isAdmin ? LicenseManager : DeviceList;
      case 'updates':
        return isAdmin ? UpdateManager : DeviceList;
      default:
        return DeviceList;
    }
  }, [currentView]);

  // Skip SSR/hydration — render only on the client to avoid React #418 in Electron
  if (!mounted) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  const handleActivateSubmit = async () => {
    if (!activateKey.trim()) return;
    setActivateLoading(true);
    setActivateError('');
    try {
      const launcherHost = window.location.hostname || 'localhost';
      const resp = await fetch(`${window.location.protocol}//${launcherHost}:3333/api/activate-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: activateKey.trim() }),
        credentials: 'include',
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        document.cookie = 'license_expires=' + (data.expiresAt || '') + '; Path=/; Max-Age=31536000';
        const dl = data.daysLeft;
        document.cookie = 'license_days=' + (dl && dl > 3650 ? '∞' : dl || '0') + '; Path=/; Max-Age=31536000';
        await fetch('/api/auth/activate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: activateKey.trim() }),
        }).catch(() => {});
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
    <div className="h-screen bg-zinc-950 flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="mb-6 animate-fade-in" key={currentView}>
            <h2 className="text-lg font-semibold text-white">{viewTitles[currentView]}</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              {currentView === 'overview' && 'Список всех рабочих станций и серверов в сети'}
              {currentView === 'device' && 'Подробная информация о выбранном устройстве'}
              {currentView === 'processes' && 'Управление запущенными процессами на удаленной машине'}
              {currentView === 'files' && 'Навигация по файловой системе удаленного устройства'}
              {currentView === 'terminal' && 'Выполнение команд на удаленной машине'}
              {currentView === 'screenshots' && 'Просмотр и управление экраном удалённого устройства в реальном времени'}
              {currentView === 'camera' && 'Просмотр веб-камеры удалённого устройства в реальном времени'}
              {currentView === 'forensics' && 'Анализ сессий, инвентаризация данных и экспорт результатов'}
              {currentView === 'control' && 'Удалённое управление питанием, приложениями, сетью и медиа'}
              {currentView === 'logs' && 'Журнал событий и активности на всех устройствах'}
              {currentView === 'settings' && 'Управление профилем, уведомлениями, безопасностью и внешним видом'}
              {currentView === 'builder' && 'Генерация исполняемых файлов агента для удалённых машин'}
              {currentView === 'licenses' && 'Генерация и управление лицензионными ключами'}
              {currentView === 'updates' && 'Публикация обновлений для всех пользователей'}
            </p>
          </div>
          <div className="animate-fade-in" key={`view-${currentView}`}>
            <ErrorBoundary key={`eb-${currentView}`} fallbackLabel={viewTitles[currentView]}>
              <ViewComponent />
            </ErrorBoundary>
          </div>
        </main>

        {/* Expired subscription overlay */}
        {isExpired && (
          <div className="absolute inset-0 top-14 bg-zinc-950/80 backdrop-blur-sm z-40 flex items-center justify-center">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl animate-fade-in-scale text-center">
              {/* Lock icon */}
              <div className="w-16 h-16 mx-auto mb-4 bg-zinc-800 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>

              <div className="inline-block bg-red-900/30 border border-red-800/50 text-red-400 text-xs font-medium px-3 py-1 rounded-full mb-4">
                Free
              </div>

              <h3 className="text-xl font-semibold text-white mb-2">Подписка закончилась</h3>
              <p className="text-sm text-zinc-400 mb-6">
                Для доступа ко всем функциям панели необходимо приобрести или активировать лицензионный ключ.
              </p>

              <div className="space-y-3">
                <a
                  href="https://t.me/SWAGA_HE_PA3PEIIIEHA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Купить ключ
                </a>
                <button
                  onClick={() => setShowActivateModal(true)}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 text-sm border border-zinc-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Активировать подписку
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Activate subscription modal */}
        {showActivateModal && (
          <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => { setShowActivateModal(false); setActivateError(''); }}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-white mb-1">Активировать подписку</h3>
              <p className="text-xs text-zinc-400 mb-4">Введите лицензионный ключ для активации</p>

              <input
                type="text"
                value={activateKey}
                onChange={(e) => setActivateKey(e.target.value)}
                placeholder="VI-XXXX-XXXX-XXXX-XXXX"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono mb-3"
                onKeyDown={(e) => e.key === 'Enter' && handleActivateSubmit()}
                autoFocus
              />

              {activateError && (
                <div className="bg-red-900/20 border border-red-900/50 rounded-lg px-3 py-2 text-xs text-red-400 mb-3">
                  {activateError}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleActivateSubmit}
                  disabled={activateLoading || !activateKey.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-all text-sm"
                >
                  {activateLoading ? 'Проверка...' : 'Активировать'}
                </button>
                <button
                  onClick={() => { setShowActivateModal(false); setActivateError(''); }}
                  className="px-4 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all border border-zinc-700"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
