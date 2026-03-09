'use client';

import React, { memo } from 'react';
import { useLogStore } from '@/store';
import { formatDate } from '@/lib/utils';
import type { LogLevel } from '@/types';

const levelStyles: Record<LogLevel, { bg: string; text: string; label: string }> = {
  info: { bg: 'bg-zinc-700/50', text: 'text-zinc-300', label: 'INFO' },
  warning: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', label: 'WARN' },
  error: { bg: 'bg-red-900/30', text: 'text-red-400', label: 'ERROR' },
  critical: { bg: 'bg-red-900/50', text: 'text-red-300', label: 'CRIT' },
};

const categoryLabels: Record<string, string> = {
  system: 'Система',
  security: 'Безопасность',
  activity: 'Активность',
  keystroke: 'Клавиатура',
  connection: 'Подключение',
  file: 'Файлы',
};

const LogsViewer = memo(function LogsViewer() {
  const {
    logs,
    levelFilter,
    categoryFilter,
    searchQuery,
    setLevelFilter,
    setCategoryFilter,
    setSearchQuery,
    getFilteredLogs,
  } = useLogStore();

  const filteredLogs = getFilteredLogs();

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Поиск в логах..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          <option value="all">Все уровни</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          <option value="all">Все категории</option>
          <option value="connection">Подключение</option>
          <option value="system">Система</option>
          <option value="security">Безопасность</option>
          <option value="file">Файлы</option>
          <option value="activity">Активность</option>
        </select>

        <div className="text-sm text-zinc-500 ml-auto">
          Записей: <span className="text-zinc-300">{filteredLogs.length}</span> / {logs.length}
        </div>
      </div>

      {/* Log Table */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-250px)]">
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left w-44">Время</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left w-20">Уровень</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left w-28">Категория</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left w-36">Устройство</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left">Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const style = levelStyles[log.level] || levelStyles.info;
                return (
                  <tr
                    key={log.id}
                    className={`border-b border-zinc-800/50 ${style.bg} hover:bg-zinc-800/40 transition-colors`}
                  >
                    <td className="px-4 py-2 text-xs font-mono text-zinc-500">{formatDate(log.timestamp)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold ${style.text}`}>{style.label}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">{categoryLabels[log.category] || log.category}</td>
                    <td className="px-4 py-2 text-xs text-zinc-400 font-mono">{log.deviceName}</td>
                    <td className="px-4 py-2 text-sm text-zinc-300">{log.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredLogs.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
            {logs.length === 0
              ? 'Логи появятся при подключении/отключении устройств и других действиях'
              : 'Нет записей по заданным фильтрам'}
          </div>
        )}
      </div>
    </div>
  );
});

export default LogsViewer;
