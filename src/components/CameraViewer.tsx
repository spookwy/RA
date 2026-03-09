'use client';

import React, { memo, useEffect, useCallback, useState, useRef } from 'react';
import { useDeviceStore, useCameraStore, getGlobalWsSend } from '@/store';

// Stable empty array reference to prevent infinite re-render (React #185)
// Using || [] in a Zustand selector creates a new reference every call
const EMPTY_CAMERAS: { id: string; name: string }[] = [];

const CameraViewer = memo(function CameraViewer() {
  const send = getGlobalWsSend();
  const { selectedDeviceId } = useDeviceStore();
  const cameras = useCameraStore((s) => selectedDeviceId ? s.cameras[selectedDeviceId] ?? EMPTY_CAMERAS : EMPTY_CAMERAS);
  const frame = useCameraStore((s) => selectedDeviceId ? s.frame[selectedDeviceId] ?? null : null);
  const loading = useCameraStore((s) => selectedDeviceId ? s.loading[selectedDeviceId] ?? false : false);
  const error = useCameraStore((s) => selectedDeviceId ? s.error[selectedDeviceId] ?? null : null);

  const [selectedCamera, setSelectedCamera] = useState('0');
  const [streaming, setStreaming] = useState(false);
  const [fps, setFps] = useState(10);
  const [quality, setQuality] = useState(50);
  const [frameCount, setFrameCount] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const frameRef = useRef<HTMLImageElement>(null);
  const prevDeviceRef = useRef<string | null>(null);

  // Request camera list when device changes
  useEffect(() => {
    if (selectedDeviceId && send) {
      // Stop previous stream if device changed
      if (prevDeviceRef.current && prevDeviceRef.current !== selectedDeviceId && streaming) {
        send({
          type: 'request_camera_stop',
          payload: { deviceId: prevDeviceRef.current },
          timestamp: new Date().toISOString(),
        });
      }
      setStreaming(false);
      setFrameCount(0);
      prevDeviceRef.current = selectedDeviceId;

      // Request camera list for new device
      send({
        type: 'request_camera_list',
        payload: { deviceId: selectedDeviceId },
        timestamp: new Date().toISOString(),
      });
    }
  }, [selectedDeviceId, send]);

  // Count frames
  useEffect(() => {
    if (frame && streaming) {
      setFrameCount((c) => c + 1);
    }
  }, [frame, streaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (selectedDeviceId && send && streaming) {
        send({
          type: 'request_camera_stop',
          payload: { deviceId: selectedDeviceId },
          timestamp: new Date().toISOString(),
        });
      }
    };
  }, [selectedDeviceId, send, streaming]);

  const startStream = useCallback(() => {
    if (!selectedDeviceId || !send) return;
    useCameraStore.getState().setLoading(selectedDeviceId, true);
    useCameraStore.getState().setError(selectedDeviceId, null);
    setFrameCount(0);
    setStreaming(true);
    send({
      type: 'request_camera_start',
      payload: { deviceId: selectedDeviceId, cameraId: selectedCamera, fps, quality },
      timestamp: new Date().toISOString(),
    });
  }, [selectedDeviceId, send, selectedCamera, fps, quality]);

  const stopStream = useCallback(() => {
    if (!selectedDeviceId || !send) return;
    setStreaming(false);
    send({
      type: 'request_camera_stop',
      payload: { deviceId: selectedDeviceId },
      timestamp: new Date().toISOString(),
    });
  }, [selectedDeviceId, send]);

  const refreshCameras = useCallback(() => {
    if (!selectedDeviceId || !send) return;
    send({
      type: 'request_camera_list',
      payload: { deviceId: selectedDeviceId },
      timestamp: new Date().toISOString(),
    });
  }, [selectedDeviceId, send]);

  // No device selected
  if (!selectedDeviceId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-180px)]">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center">
            <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Камера</h3>
          <p className="text-sm text-zinc-500">Выберите устройство для просмотра камеры</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Camera selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 uppercase tracking-wider">Камера</label>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              disabled={streaming}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            >
              {cameras.length > 0 ? (
                cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>{cam.name || `Camera ${cam.id}`}</option>
                ))
              ) : (
                <option value="0">По умолчанию</option>
              )}
            </select>
            <button
              onClick={refreshCameras}
              disabled={streaming}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-all disabled:opacity-50"
              title="Обновить список камер"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <div className="w-px h-6 bg-zinc-700" />

          {/* FPS */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 uppercase tracking-wider">FPS</label>
            <select
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              disabled={streaming}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </div>

          {/* Quality */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 uppercase tracking-wider">Качество</label>
            <select
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              disabled={streaming}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50"
            >
              <option value={15}>Низкое</option>
              <option value={30}>Среднее</option>
              <option value={50}>Высокое</option>
              <option value={80}>Максимальное</option>
            </select>
          </div>

          <div className="w-px h-6 bg-zinc-700" />

          {/* Start/Stop */}
          {!streaming ? (
            <button
              onClick={startStream}
              className="flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-all active:scale-[0.97]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Начать трансляцию
            </button>
          ) : (
            <button
              onClick={stopStream}
              className="flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-all active:scale-[0.97]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Остановить
            </button>
          )}

          {/* Status */}
          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
            {streaming && (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 font-medium">LIVE</span>
                </div>
                <span>Кадры: {frameCount}</span>
              </>
            )}
            {cameras.length > 0 && <span>{cameras.length} камер(а)</span>}
          </div>
        </div>
      </div>

      {/* Video feed */}
      <div
        className={`bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden transition-all ${
          fullscreen ? 'fixed inset-4 z-50' : 'h-[calc(100vh-280px)]'
        }`}
      >
        {/* Fullscreen toggle */}
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="absolute top-3 right-3 z-10 p-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all backdrop-blur-sm"
          title={fullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {fullscreen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            )}
          </svg>
        </button>

        <div className="relative w-full h-full flex items-center justify-center bg-zinc-950">
          {/* Loading state */}
          {loading && !frame && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
              <p className="text-sm text-zinc-500">Подключение к камере...</p>
            </div>
          )}

          {/* Error state */}
          {error && !frame && (
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm text-red-400 max-w-md">{error}</p>
              <p className="text-xs text-zinc-600">Убедитесь, что на устройстве установлен ffmpeg и подключена камера</p>
            </div>
          )}

          {/* Camera frame */}
          {frame && (
            <img
              ref={frameRef}
              src={frame}
              alt="Camera feed"
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          )}

          {/* Idle state */}
          {!streaming && !frame && !loading && !error && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center">
                <svg className="w-10 h-10 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Камера готова</h3>
                <p className="text-sm text-zinc-500 max-w-sm">Нажмите «Начать трансляцию» для просмотра камеры в реальном времени</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen overlay background */}
      {fullscreen && (
        <div className="fixed inset-0 bg-black/80 z-40" onClick={() => setFullscreen(false)} />
      )}
    </div>
  );
});

export default CameraViewer;