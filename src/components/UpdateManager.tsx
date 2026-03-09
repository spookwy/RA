'use client';

import React, { useState, useCallback, useEffect } from 'react';

const GITHUB_REPO = 'spookwy/RA';

interface AppUpdate {
  id: string;
  version: string;
  download_url: string;
  file_size: number | null;
  sha256: string | null;
  changelog: string | null;
  published_at: string;
}

export default function UpdateManager() {
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch('/api/updates');
      const data = await res.json();
      if (res.ok && data.updates) {
        setUpdates(data.updates);
      }
    } catch {
      console.error('Failed to fetch updates');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  // Auto-generate GitHub Release download URL
  const githubUrl = version.trim()
    ? `https://github.com/${GITHUB_REPO}/releases/download/v${version.trim()}/update-${version.trim()}.tar`
    : '';

  const publishUpdate = useCallback(async () => {
    if (!version.trim()) {
      setError('Укажите версию');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${version.trim()}/update-${version.trim()}.tar`;

      const res = await fetch('/api/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: version.trim(),
          download_url: downloadUrl,
          changelog: changelog.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка сохранения');
        return;
      }

      setSuccess(`Обновление v${version} опубликовано! Убедитесь, что файл загружен в GitHub Release.`);
      setVersion('');
      setChangelog('');
      await fetchUpdates();
    } catch (e: unknown) {
      setError((e as Error).message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [version, changelog, fetchUpdates]);

  const deleteUpdate = useCallback(async (id: string) => {
    if (!confirm('Удалить это обновление?')) return;
    try {
      const res = await fetch('/api/updates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setUpdates(prev => prev.filter(u => u.id !== id));
      }
    } catch {
      console.error('Delete failed');
    }
  }, []);

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' ГБ';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + ' МБ';
    return (bytes / 1024).toFixed(0) + ' КБ';
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Publisher */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Опубликовать обновление
        </h3>

        {/* Instructions */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs text-zinc-400 space-y-1">
              <p><span className="text-zinc-300 font-medium">Шаг 1:</span> Создайте Release на GitHub с тегом <span className="text-emerald-400 font-mono">v{version || 'X.X.X'}</span></p>
              <p><span className="text-zinc-300 font-medium">Шаг 2:</span> Прикрепите файл <span className="text-emerald-400 font-mono">update-{version || 'X.X.X'}.tar</span> к релизу</p>
              <p><span className="text-zinc-300 font-medium">Шаг 3:</span> Нажмите «Отправить обновление» здесь — запись появится в БД</p>
              <a
                href={`https://github.com/${GITHUB_REPO}/releases/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors mt-1"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                Создать Release на GitHub
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Version */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Версия *</label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.4.0"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
            />
          </div>

          {/* Generated URL (readonly) */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">URL скачивания (auto)</label>
            <div className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-[11px] text-zinc-500 font-mono truncate">
              {githubUrl || '—'}
            </div>
          </div>

          {/* Changelog */}
          <div className="md:col-span-2">
            <label className="block text-sm text-zinc-400 mb-1.5">Список изменений</label>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder={"— Исправлены ошибки\n— Добавлены новые функции"}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-900/50 rounded-lg px-3 py-2 text-xs text-red-400 mb-3">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-900/20 border border-emerald-900/50 rounded-lg px-3 py-2 text-xs text-emerald-400 mb-3">
            {success}
          </div>
        )}

        <button
          onClick={publishUpdate}
          disabled={loading || !version.trim()}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Сохранение...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Отправить обновление
            </>
          )}
        </button>
      </div>

      {/* Update history */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          История обновлений
        </h3>

        {loadingList ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : updates.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">
            Нет опубликованных обновлений
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map((upd, i) => (
              <div
                key={upd.id}
                className={`bg-zinc-800/50 border rounded-lg p-4 ${
                  i === 0 ? 'border-emerald-800/50' : 'border-zinc-700/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-semibold text-sm">v{upd.version}</span>
                      {i === 0 && (
                        <span className="text-[10px] bg-emerald-900/40 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                          Последняя
                        </span>
                      )}
                      {upd.file_size && (
                        <span className="text-[10px] text-zinc-500">{formatBytes(upd.file_size)}</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mb-1">{formatDate(upd.published_at)}</div>
                    {upd.changelog && (
                      <div className="text-xs text-zinc-400 whitespace-pre-line mt-1">{upd.changelog}</div>
                    )}
                    <a
                      href={upd.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-500/70 hover:text-blue-400 font-mono mt-2 truncate block transition-colors"
                    >
                      {upd.download_url}
                    </a>
                  </div>
                  <button
                    onClick={() => deleteUpdate(upd.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                    title="Удалить"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
