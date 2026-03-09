'use client';

import React, { memo, useEffect, useCallback } from 'react';
import { useProcessStore, useDeviceStore, getGlobalWsSend } from '@/store';
import type { ProcessInfo } from '@/types';

function requestProcesses(deviceId: string) {
  const send = getGlobalWsSend();
  if (send) {
    send({
      type: 'request_processes',
      payload: { deviceId },
    });
  }
}

const ProcessRow = memo(function ProcessRow({
  process,
  onKill,
}: {
  process: ProcessInfo;
  onKill: (pid: number, name: string) => void;
}) {
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
      <td className="px-4 py-2 text-sm font-mono text-zinc-400">{process.pid}</td>
      <td className="px-4 py-2 text-sm text-white">{process.name}</td>
      <td className="px-4 py-2 text-sm text-zinc-400">{process.user}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="w-16 bg-zinc-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                process.cpu > 50 ? 'bg-red-500' : process.cpu > 20 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(process.cpu, 100)}%` }}
            />
          </div>
          <span className="text-sm font-mono text-zinc-300 w-14 text-right">{process.cpu.toFixed(1)}%</span>
        </div>
      </td>
      <td className="px-4 py-2 text-sm font-mono text-zinc-300 text-right">{process.memory} MB</td>
      <td className="px-4 py-2 text-sm text-zinc-500">{process.status}</td>
      <td className="px-4 py-2">
        <button
          onClick={() => onKill(process.pid, process.name)}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
          title="Завершить процесс"
        >
          Kill
        </button>
      </td>
    </tr>
  );
});

const sortableColumns: { key: keyof ProcessInfo; label: string; width?: string }[] = [
  { key: 'pid', label: 'PID', width: 'w-20' },
  { key: 'name', label: 'Имя процесса' },
  { key: 'user', label: 'Пользователь' },
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: 'RAM', width: 'w-24' },
  { key: 'status', label: 'Статус', width: 'w-24' },
];

const ProcessManager = memo(function ProcessManager() {
  const { selectedDeviceId } = useDeviceStore();
  const {
    setProcesses,
    sortField,
    sortDirection,
    filter,
    setSort,
    setFilter,
    getSortedProcesses,
  } = useProcessStore();

  // Request real process list on mount and auto-refresh every 2 seconds
  useEffect(() => {
    if (!selectedDeviceId) return;
    requestProcesses(selectedDeviceId);

    const interval = setInterval(() => {
      requestProcesses(selectedDeviceId);
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedDeviceId]);

  const handleKill = useCallback((pid: number, name: string) => {
    if (confirm(`Завершить процесс ${name} (PID: ${pid})?`)) {
      const send = getGlobalWsSend();
      if (send && selectedDeviceId) {
        send({
          type: 'command_request',
          payload: {
            deviceId: selectedDeviceId,
            command: process.platform === 'win32' || true
              ? `taskkill /PID ${pid} /F`
              : `kill -9 ${pid}`,
            shell: 'cmd',
          },
        });
        // Remove from local list immediately
        const procs = useProcessStore.getState().processes.filter(p => p.pid !== pid);
        setProcesses(procs);
        // Refresh after short delay
        setTimeout(() => requestProcesses(selectedDeviceId), 1500);
      }
    }
  }, [selectedDeviceId, setProcesses]);

  const handleRefresh = useCallback(() => {
    if (selectedDeviceId) {
      requestProcesses(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  const processes = getSortedProcesses();

  if (!selectedDeviceId) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Выберите устройство для просмотра процессов
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Поиск процесса..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div className="text-sm text-zinc-500">
          Процессов: <span className="text-zinc-300">{processes.length}</span>
        </div>
        <button
          onClick={handleRefresh}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors border border-zinc-700"
        >
          Обновить
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-250px)]">
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="border-b border-zinc-800">
                {sortableColumns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => setSort(col.key)}
                    className={`px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left cursor-pointer hover:text-zinc-300 transition-colors ${
                      col.width || ''
                    } ${sortField === col.key ? 'text-zinc-300' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortField === col.key && (
                        <span className="text-zinc-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {processes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500 text-sm">
                    Загрузка процессов...
                  </td>
                </tr>
              ) : (
                processes.map((proc) => (
                  <ProcessRow key={proc.pid} process={proc} onKill={handleKill} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

export default ProcessManager;
