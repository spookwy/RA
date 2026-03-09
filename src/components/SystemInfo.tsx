'use client';

import React, { memo } from 'react';
import { useDeviceStore } from '@/store';
import { formatBytes, formatUptime } from '@/lib/utils';

function ProgressBar({ percent, color = 'bg-white' }: { percent: number; color?: string }) {
  return (
    <div className="w-full bg-zinc-800 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

const SystemInfo = memo(function SystemInfo() {
  const device = useDeviceStore((s) => s.getSelectedDevice());

  if (!device) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Выберите устройство для просмотра информации
      </div>
    );
  }

  const info = device.systemInfo;
  if (!info) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Системная информация недоступна (устройство offline)
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Device Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{device.hostname}</h2>
            <p className="text-sm text-zinc-400">{device.ip} · {device.mac}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                device.status === 'online' ? 'bg-green-400' : device.status === 'warning' ? 'bg-yellow-400' : 'bg-zinc-500'
              }`}
            />
            <span className="text-sm text-zinc-300 capitalize">{device.status}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-zinc-500">ОС:</span>
            <div className="text-zinc-200">{info.os.platform} {info.os.version}</div>
          </div>
          <div>
            <span className="text-zinc-500">Архитектура:</span>
            <div className="text-zinc-200">{info.os.arch}</div>
          </div>
          <div>
            <span className="text-zinc-500">Uptime:</span>
            <div className="text-zinc-200">{formatUptime(info.uptime || device.uptime)}</div>
          </div>
          <div>
            <span className="text-zinc-500">Агент:</span>
            <div className="text-zinc-200">v{device.agentVersion}</div>
          </div>
        </div>
      </div>

      {/* CPU */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Процессор</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-300">{info.cpu.model}</span>
            <span className="text-white font-mono">{info.cpu.usage}%</span>
          </div>
          <ProgressBar percent={info.cpu.usage} color={getUsageColor(info.cpu.usage)} />
          <div className="flex gap-6 text-xs text-zinc-500">
            <span>Ядра: {info.cpu.cores}</span>
            <span>Частота: {info.cpu.speed} MHz</span>
          </div>
        </div>
      </div>

      {/* Memory */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Оперативная память</h3>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-300">
              {formatBytes(info.memory.used)} / {formatBytes(info.memory.total)}
            </span>
            <span className="text-white font-mono">{info.memory.usagePercent}%</span>
          </div>
          <ProgressBar percent={info.memory.usagePercent} color={getUsageColor(info.memory.usagePercent)} />
          <div className="text-xs text-zinc-500">
            Свободно: {formatBytes(info.memory.free)}
          </div>
        </div>
      </div>

      {/* Disks */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Диски</h3>
        <div className="space-y-4">
          {info.disks.length === 0 && (
            <p className="text-sm text-zinc-500">Информация о дисках загружается...</p>
          )}
          {info.disks.map((disk) => (
            <div key={disk.mount} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-300">
                  {disk.name} ({disk.type}) — {formatBytes(disk.used)} / {formatBytes(disk.total)}
                </span>
                <span className="text-white font-mono">{disk.usagePercent}%</span>
              </div>
              <ProgressBar percent={disk.usagePercent} color={getUsageColor(disk.usagePercent)} />
            </div>
          ))}
        </div>
      </div>

      {/* Network */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-4">Сеть</h3>
        <div className="space-y-2">
          {info.network.map((nic) => (
            <div key={nic.name} className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{nic.name}</span>
              <div className="flex gap-4 text-zinc-400">
                <span>IP: {nic.ip}</span>
                <span>MAC: {nic.mac}</span>
                <span>{nic.speed} Mbps</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default SystemInfo;
