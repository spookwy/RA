'use client';

import React, { useState, useCallback, useEffect } from 'react';

interface GeneratedKey {
  key: string;
  key_id: string;
  type: string;
  plan: string;
  max_devices: number;
  duration_days: number;
  owner: string;
  created_at: string;
  expires_at: string;
  activated: boolean;
  activated_by: string | null;
  activated_at: string | null;
  hwid: string | null;
}

export default function LicenseManager() {
  const [type, setType] = useState<'admin' | 'user'>('user');
  const [maxDevices, setMaxDevices] = useState(10);
  const [durationDays, setDurationDays] = useState(30);
  const [owner, setOwner] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [allKeys, setAllKeys] = useState<GeneratedKey[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(true);

  // Fetch all keys from Supabase on mount
  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/license/generate');
      const data = await res.json();
      if (res.ok && data.keys) {
        setAllKeys(data.keys);
      }
    } catch {
      console.error('Failed to fetch keys');
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const generateKey = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/license/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, plan: 'basic', maxDevices, durationDays, owner: owner || 'user' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка генерации');
        return;
      }
      // Refresh from DB
      await fetchKeys();
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  }, [type, maxDevices, durationDays, owner, fetchKeys]);

  const deleteKey = useCallback(async (keyId: string) => {
    if (!confirm('Удалить этот ключ?')) return;
    try {
      const res = await fetch('/api/license/generate', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      if (res.ok) {
        setAllKeys(prev => prev.filter(k => k.key_id !== keyId));
      }
    } catch {
      console.error('Delete failed');
    }
  }, []);

  const deactivateKey = useCallback(async (keyId: string) => {
    if (!confirm('Деактивировать этот ключ?')) return;
    try {
      const res = await fetch('/api/license/generate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      });
      if (res.ok) {
        setAllKeys(prev => prev.map(k => k.key_id === keyId ? { ...k, activated: false, activated_by: null, hwid: null } : k));
      }
    } catch {
      console.error('Deactivate failed');
    }
  }, []);

  const copyKey = (key: string, index: number) => {
    navigator.clipboard.writeText(key);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Generator */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Генератор лицензий
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Type */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Тип лицензии</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('user')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                Пользователь
              </button>
              <button
                onClick={() => setType('admin')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === 'admin'
                    ? 'bg-amber-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                Администратор
              </button>
            </div>
          </div>

          {/* Empty spacer for alignment */}
          <div />

          {/* Devices */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Макс. устройств</label>
            <input
              type="number"
              value={maxDevices}
              onChange={(e) => setMaxDevices(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={10000}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Срок (дни)</label>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={36500}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Owner */}
          <div className="md:col-span-2">
            <label className="block text-sm text-zinc-400 mb-1.5">Владелец (имя / email)</label>
            <input
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Необязательно"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-900/50 rounded-lg px-4 py-2.5 text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={generateKey}
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Генерация...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Сгенерировать ключ
            </>
          )}
        </button>
      </div>

      {/* All Keys from Supabase */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Все ключи ({allKeys.length})
        </h3>
        {loadingKeys ? (
          <div className="text-center py-8 text-zinc-500 text-sm">Загрузка ключей из БД...</div>
        ) : allKeys.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">Ключи не найдены. Создайте первый ключ выше.</div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
            {allKeys.map((gk, i) => (
              <div key={gk.key_id} className={`rounded-lg p-4 ${gk.activated ? 'bg-zinc-800/60 border border-emerald-900/30' : 'bg-zinc-800 border border-zinc-700/30'}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <code className="text-emerald-400 text-xs font-mono break-all flex-1 select-all">
                    {gk.key}
                  </code>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => copyKey(gk.key, i)}
                      className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded-md transition-colors"
                    >
                      {copiedIndex === i ? '✓' : 'Копировать'}
                    </button>
                    {gk.activated && (
                      <button
                        onClick={() => deactivateKey(gk.key_id)}
                        className="px-2 py-1 bg-amber-900/40 hover:bg-amber-800/60 text-amber-400 text-xs rounded-md transition-colors"
                        title="Деактивировать ключ"
                      >
                        Деактивировать
                      </button>
                    )}
                    <button
                      onClick={() => deleteKey(gk.key_id)}
                      className="px-2 py-1 bg-red-900/40 hover:bg-red-800/60 text-red-400 text-xs rounded-md transition-colors"
                      title="Удалить ключ"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {/* Info grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-zinc-500">Тип: </span>
                    <span className={gk.type === 'admin' ? 'text-amber-400' : 'text-blue-400'}>
                      {gk.type === 'admin' ? 'Админ' : 'Пользователь'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Устройства: </span>
                    <span className="text-zinc-300">{gk.max_devices}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Срок: </span>
                    <span className="text-zinc-300">{gk.duration_days} дней</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Владелец: </span>
                    <span className="text-zinc-300">{gk.owner || '—'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-zinc-500">Создан: </span>
                    <span className="text-zinc-400">{new Date(gk.created_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Истекает: </span>
                    <span className="text-zinc-400">{new Date(gk.expires_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Статус: </span>
                    {gk.activated ? (
                      <span className="text-emerald-400">✓ Активирован</span>
                    ) : (
                      <span className="text-zinc-500">Не активирован</span>
                    )}
                  </div>
                  <div>
                    {gk.activated && gk.activated_by ? (
                      <>
                        <span className="text-zinc-500">Кем: </span>
                        <span className="text-zinc-300">{gk.activated_by}</span>
                      </>
                    ) : gk.activated && gk.activated_at ? (
                      <>
                        <span className="text-zinc-500">Когда: </span>
                        <span className="text-zinc-400">{new Date(gk.activated_at).toLocaleDateString('ru-RU')}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                {gk.hwid && (
                  <div className="mt-2 text-xs">
                    <span className="text-zinc-500">HWID: </span>
                    <span className="text-purple-400 font-mono">{gk.hwid}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <h4 className="text-sm font-medium text-zinc-300 mb-2">Как это работает</h4>
        <ul className="text-xs text-zinc-500 space-y-1.5 list-disc list-inside">
          <li><strong className="text-zinc-400">Администратор</strong> — полный доступ + генерация ключей для продажи</li>
          <li><strong className="text-zinc-400">Пользователь</strong> — доступ к панели, без генерации ключей</li>
          <li>Ключ вводится при первом запуске панели на странице активации</li>
          <li>Каждый пользователь разворачивает панель на своем сервере</li>
          <li>Ключ определяет тариф, лимит устройств и срок действия</li>
        </ul>
      </div>
    </div>
  );
}
