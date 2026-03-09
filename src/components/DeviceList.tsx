'use client';

import React, { memo, useCallback } from 'react';
import { useDeviceStore, useDashboardStore, getGlobalWsSend } from '@/store';
import { formatUptime, formatTimeAgo } from '@/lib/utils';
import type { Device, DeviceStatus } from '@/types';
import WorldMap from './WorldMap';

const statusConfig: Record<DeviceStatus, { color: string; label: string; dot: string }> = {
  online: { color: 'text-green-400', label: 'Online', dot: 'bg-green-400' },
  offline: { color: 'text-zinc-500', label: 'Offline', dot: 'bg-zinc-500' },
  warning: { color: 'text-yellow-400', label: 'Warning', dot: 'bg-yellow-400' },
};

const DeviceRow = memo(function DeviceRow({
  device,
  isSelected,
  onSelect,
  onRemove,
}: {
  device: Device;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { setView } = useDashboardStore();
  const status = statusConfig[device.status];

  return (
    <tr
      onClick={() => {
        onSelect(device.id);
        setView('device');
      }}
      className={`cursor-pointer transition-colors border-b border-zinc-800/50 ${
        isSelected ? 'bg-zinc-800' : 'hover:bg-zinc-800/30'
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
          <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-white text-sm">{device.hostname}</div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-400">{device.ip}</td>
      <td className="px-4 py-3 text-sm text-zinc-400">{device.os}</td>
      <td className="px-4 py-3 text-sm text-zinc-400">
        {device.systemInfo ? `${Math.round(device.systemInfo.cpu.usage)}%` : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-400">
        {device.systemInfo ? `${Math.round(device.systemInfo.memory.usagePercent)}%` : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-zinc-500">{formatUptime(device.uptime)}</td>
      <td className="px-4 py-3 text-sm text-zinc-500">{formatTimeAgo(device.lastSeen)}</td>
      <td className="px-4 py-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Удалить устройство "${device.hostname}"?`)) {
              onRemove(device.id);
            }
          }}
          className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
          title="Удалить устройство"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  );
});

const DeviceList = memo(function DeviceList() {
  const { devices, selectedDeviceId, selectDevice, getStats } = useDeviceStore();
  const stats = getStats();

  const handleRemoveDevice = useCallback((deviceId: string) => {
    // Send remove request to WS server (which persists it)
    const send = getGlobalWsSend();
    if (send) {
      send({ type: 'remove_device', payload: { deviceId }, timestamp: new Date().toISOString() });
    }
    // Also remove from local store immediately
    useDeviceStore.getState().removeDevice(deviceId);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-6 stagger-children">
        {[
          { label: 'Всего устройств', value: stats.totalDevices, color: 'text-white' },
          { label: 'Online', value: stats.onlineDevices, color: 'text-green-400' },
          { label: 'Warning', value: stats.warningDevices, color: 'text-yellow-400' },
          { label: 'Offline', value: stats.offlineDevices, color: 'text-zinc-500' },
        ].map((stat) => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-fade-in hover:border-zinc-700 transition-colors duration-200">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</div>
            <div className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* World Map */}
      <div className="mb-6 animate-fade-in">
        <WorldMap devices={devices} />
      </div>

      {/* Table */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider w-24">Статус</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Имя</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">IP</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">ОС</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider w-20">CPU</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider w-20">RAM</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Uptime</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Последний раз</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider w-16"></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  isSelected={device.id === selectedDeviceId}
                  onSelect={selectDevice}
                  onRemove={handleRemoveDevice}
                />
              ))}
            </tbody>
          </table>
        </div>
        {devices.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
            Устройства не найдены
          </div>
        )}
      </div>
    </div>
  );
});

export default DeviceList;
