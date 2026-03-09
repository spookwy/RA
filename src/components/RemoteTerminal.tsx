'use client';

import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useTerminalStore, useDeviceStore, getGlobalWsSend } from '@/store';
import type { AgentLogEntry } from '@/store';
import type { ShellType } from '@/types';

const EMPTY_LOGS: AgentLogEntry[] = [];

const levelColors: Record<string, string> = {
  info: 'text-zinc-300',
  warn: 'text-yellow-400',
  error: 'text-red-400',
};

const levelBadge: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-500',
  error: 'text-red-500',
};

const RemoteTerminal = memo(function RemoteTerminal() {
  const selectedDeviceId = useDeviceStore((s) => s.selectedDeviceId);
  const device = useDeviceStore((s) => s.devices.find((d) => d.id === s.selectedDeviceId));
  const agentLogs = useTerminalStore((s) => {
    if (!selectedDeviceId) return EMPTY_LOGS;
    return s.agentLogs[selectedDeviceId] ?? EMPTY_LOGS;
  });
  const history = useTerminalStore((s) => s.history);
  const isExecuting = useTerminalStore((s) => s.isExecuting);
  const addResult = useTerminalStore((s) => s.addResult);
  const setExecuting = useTerminalStore((s) => s.setExecuting);
  const clearAgentLogs = useTerminalStore((s) => s.clearAgentLogs);
  const [command, setCommand] = useState('');
  const [shell, setShell] = useState<ShellType>('powershell');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tab, setTab] = useState<'logs' | 'commands'>('logs');
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [agentLogs, history, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  // Execute real remote command via WebSocket
  const executeCommand = useCallback(async () => {
    if (!command.trim() || !selectedDeviceId || isExecuting) return;

    const cmd = command.trim();
    setCommand('');
    setCmdHistory((prev) => [...prev, cmd]);
    setHistoryIndex(-1);
    setExecuting(true);

    // Send command to agent via WS
    const wsSend = getGlobalWsSend();
    if (wsSend) {
      wsSend({
        type: 'command_request',
        deviceId: selectedDeviceId,
        payload: { deviceId: selectedDeviceId, command: cmd, shell },
        timestamp: new Date().toISOString(),
      });
    }

    // Add local entry showing command was sent
    addResult({
      id: `cmd-${Date.now()}`,
      deviceId: selectedDeviceId,
      command: cmd,
      output: '\u23f3 Ожидание ответа от агента...',
      exitCode: -1,
      timestamp: new Date().toISOString(),
      duration: 0,
    });

    // Auto-release executing state after timeout
    setTimeout(() => setExecuting(false), 1000);
    inputRef.current?.focus();
  }, [command, selectedDeviceId, isExecuting, setExecuting, addResult, shell]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        executeCommand();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cmdHistory.length > 0) {
          const newIndex = historyIndex < cmdHistory.length - 1 ? historyIndex + 1 : historyIndex;
          setHistoryIndex(newIndex);
          setCommand(cmdHistory[cmdHistory.length - 1 - newIndex]);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setCommand(cmdHistory[cmdHistory.length - 1 - newIndex]);
        } else {
          setHistoryIndex(-1);
          setCommand('');
        }
      }
    },
    [executeCommand, cmdHistory, historyIndex]
  );

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ''; }
  };

  // Filter logs
  const filteredLogs = filter
    ? agentLogs.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
    : agentLogs;

  if (!selectedDeviceId) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Выберите устройство для просмотра консоли агента
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        {/* Tabs */}
        <div className="flex bg-zinc-900 rounded-lg p-0.5 border border-zinc-800">
          <button
            onClick={() => setTab('logs')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              tab === 'logs' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Консоль агента
          </button>
          <button
            onClick={() => setTab('commands')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              tab === 'commands' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Команды
          </button>
        </div>

        <div className="text-sm text-zinc-500">
          <span className="text-zinc-300 font-mono">{device?.hostname}</span>
          {tab === 'logs' && (
            <span className="ml-2 text-xs">
              ({agentLogs.length} {agentLogs.length === 1 ? 'запись' : 'записей'})
            </span>
          )}
        </div>

        {tab === 'logs' && (
          <>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Фильтр..."
              className="ml-auto bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-40"
            />
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                autoScroll
                  ? 'bg-white/10 border-zinc-600 text-zinc-300'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-500'
              }`}
              title={autoScroll ? 'Авто-прокрутка вкл' : 'Авто-прокрутка выкл'}
            >
              ↓
            </button>
            <button
              onClick={() => selectedDeviceId && clearAgentLogs(selectedDeviceId)}
              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded border border-zinc-700 transition-colors"
            >
              Очистить
            </button>
          </>
        )}

        {tab === 'commands' && (
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-zinc-500">Shell:</label>
            <select
              value={shell}
              onChange={(e) => setShell(e.target.value as ShellType)}
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none"
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD</option>
            </select>
          </div>
        )}
      </div>

      {/* Terminal Output */}
      <div
        ref={outputRef}
        onScroll={handleScroll}
        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs overflow-auto max-h-[calc(100vh-280px)]"
        onClick={() => inputRef.current?.focus()}
      >
        {tab === 'logs' ? (
          <>
            {filteredLogs.length === 0 ? (
              <div className="text-zinc-600 text-center py-8">
                {agentLogs.length === 0
                  ? 'Нет логов от агента. Запустите клиент, чтобы увидеть вывод его консоли.'
                  : 'Нет совпадений по фильтру'}
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="flex gap-2 py-0.5 hover:bg-white/[0.02]">
                  <span className="text-zinc-600 shrink-0 select-none">{formatTime(log.ts)}</span>
                  <span className={`shrink-0 w-10 text-right select-none ${levelBadge[log.level] || 'text-zinc-500'}`}>
                    {log.level === 'error' ? 'ERR' : log.level === 'warn' ? 'WARN' : 'INFO'}
                  </span>
                  <span className={`${levelColors[log.level] || 'text-zinc-300'} whitespace-pre-wrap break-all`}>
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            <div className="text-zinc-500 mb-2">
              Remote session — {device?.hostname} ({device?.os})
              <br />
            </div>
            {history
              .filter((r) => r.deviceId === selectedDeviceId)
              .map((result) => (
                <div key={result.id} className="mb-3">
                  <div className="text-zinc-400">
                    <span className="text-green-500/70">{device?.hostname}&gt;</span> {result.command}
                  </div>
                  <pre className="text-zinc-300 whitespace-pre-wrap mt-1">{result.output}</pre>
                </div>
              ))}
            {isExecuting && (
              <div className="text-zinc-500 animate-pulse">Выполнение...</div>
            )}
          </>
        )}
      </div>

      {/* Command Input (only on commands tab) */}
      {tab === 'commands' && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-green-500/70 font-mono text-sm">{device?.hostname}&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Введите команду (${shell})...`}
            disabled={isExecuting}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            autoFocus
          />
          <button
            onClick={executeCommand}
            disabled={isExecuting || !command.trim()}
            className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Выполнить
          </button>
        </div>
      )}
    </div>
  );
});

export default RemoteTerminal;
