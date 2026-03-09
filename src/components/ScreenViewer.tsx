'use client';

import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useDeviceStore, useScreenStreamStore, getGlobalWsSend } from '@/store';

// Map JS key codes to Windows virtual key codes
const KEY_MAP: Record<string, number> = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0D, ShiftLeft: 0x10, ShiftRight: 0x10,
  ControlLeft: 0x11, ControlRight: 0x11, AltLeft: 0x12, AltRight: 0x12,
  Pause: 0x13, CapsLock: 0x14, Escape: 0x1B, Space: 0x20, PageUp: 0x21,
  PageDown: 0x22, End: 0x23, Home: 0x24, ArrowLeft: 0x25, ArrowUp: 0x26,
  ArrowRight: 0x27, ArrowDown: 0x28, PrintScreen: 0x2C, Insert: 0x2D,
  Delete: 0x2E, Digit0: 0x30, Digit1: 0x31, Digit2: 0x32, Digit3: 0x33,
  Digit4: 0x34, Digit5: 0x35, Digit6: 0x36, Digit7: 0x37, Digit8: 0x38,
  Digit9: 0x39, KeyA: 0x41, KeyB: 0x42, KeyC: 0x43, KeyD: 0x44, KeyE: 0x45,
  KeyF: 0x46, KeyG: 0x47, KeyH: 0x48, KeyI: 0x49, KeyJ: 0x4A, KeyK: 0x4B,
  KeyL: 0x4C, KeyM: 0x4D, KeyN: 0x4E, KeyO: 0x4F, KeyP: 0x50, KeyQ: 0x51,
  KeyR: 0x52, KeyS: 0x53, KeyT: 0x54, KeyU: 0x55, KeyV: 0x56, KeyW: 0x57,
  KeyX: 0x58, KeyY: 0x59, KeyZ: 0x5A, MetaLeft: 0x5B, MetaRight: 0x5C,
  ContextMenu: 0x5D, Numpad0: 0x60, Numpad1: 0x61, Numpad2: 0x62,
  Numpad3: 0x63, Numpad4: 0x64, Numpad5: 0x65, Numpad6: 0x66,
  Numpad7: 0x67, Numpad8: 0x68, Numpad9: 0x69, NumpadMultiply: 0x6A,
  NumpadAdd: 0x6B, NumpadSubtract: 0x6D, NumpadDecimal: 0x6E,
  NumpadDivide: 0x6F, F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74,
  F6: 0x75, F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79, F11: 0x7A, F12: 0x7B,
  NumLock: 0x90, ScrollLock: 0x91, Semicolon: 0xBA, Equal: 0xBB, Comma: 0xBC,
  Minus: 0xBD, Period: 0xBE, Slash: 0xBF, Backquote: 0xC0, BracketLeft: 0xDB,
  Backslash: 0xDC, BracketRight: 0xDD, Quote: 0xDE,
};

function getVkCode(code: string): number {
  return KEY_MAP[code] || 0;
}

const ScreenViewer = memo(function ScreenViewer() {
  const { selectedDeviceId } = useDeviceStore();
  const device = useDeviceStore((s) => s.getSelectedDevice());
  const frame = useScreenStreamStore((s) => selectedDeviceId ? s.frame[selectedDeviceId] : null);
  const streaming = useScreenStreamStore((s) => selectedDeviceId ? s.streaming[selectedDeviceId] : false);
  const resolution = useScreenStreamStore((s) => selectedDeviceId ? s.resolution[selectedDeviceId] : null);
  const actualFps = useScreenStreamStore((s) => selectedDeviceId ? (s.fps[selectedDeviceId] || 0) : 0);
  const streamError = useScreenStreamStore((s) => selectedDeviceId ? s.error[selectedDeviceId] : null);

  const [controlEnabled, setControlEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Hardcoded defaults — no settings panel
  const targetFps = 15;
  const quality = 50;
  const scale = 100;

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const screenAreaRef = useRef<HTMLDivElement>(null);
  const fpsCounter = useRef({ count: 0, lastTime: Date.now(), fps: 0 });
  const lastMoveTime = useRef(0);

  // Measure actual FPS
  useEffect(() => {
    if (!frame || !selectedDeviceId) return;
    const now = Date.now();
    fpsCounter.current.count++;
    if (now - fpsCounter.current.lastTime >= 1000) {
      const fps = fpsCounter.current.count;
      fpsCounter.current.count = 0;
      fpsCounter.current.lastTime = now;
      fpsCounter.current.fps = fps;
      useScreenStreamStore.getState().setFps(selectedDeviceId, fps);
    }
  }, [frame, selectedDeviceId]);

  // Convert mouse position to remote screen coordinates
  // With max-width/max-height the img bounding rect IS the rendered image
  const getScreenCoords = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const img = imgRef.current;
    if (!img || !resolution) return null;

    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
    return {
      x: Math.round(relX * resolution.width),
      y: Math.round(relY * resolution.height),
    };
  }, [resolution]);

  const sendToDevice = useCallback((msg: Record<string, unknown>) => {
    const send = getGlobalWsSend();
    if (send && selectedDeviceId) {
      send({ ...msg, payload: { ...(msg.payload as Record<string, unknown>), deviceId: selectedDeviceId } });
    }
  }, [selectedDeviceId]);

  // Start/stop stream
  const startStream = useCallback(() => {
    if (!selectedDeviceId) return;
    sendToDevice({
      type: 'request_screen_stream',
      payload: { deviceId: selectedDeviceId, fps: targetFps, quality, scale },
    });
    useScreenStreamStore.getState().setStreaming(selectedDeviceId, true);
  }, [selectedDeviceId, targetFps, quality, scale, sendToDevice]);

  const stopStream = useCallback(() => {
    if (!selectedDeviceId) return;
    sendToDevice({
      type: 'stop_screen_stream',
      payload: { deviceId: selectedDeviceId },
    });
    useScreenStreamStore.getState().setStreaming(selectedDeviceId, false);
    useScreenStreamStore.getState().clear(selectedDeviceId);
  }, [selectedDeviceId, sendToDevice]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!controlEnabled || !streaming) return;
    const now = Date.now();
    if (now - lastMoveTime.current < 50) return; // Throttle to ~20 moves/sec
    lastMoveTime.current = now;
    const coords = getScreenCoords(e);
    if (!coords) return;
    sendToDevice({ type: 'mouse_input', payload: { action: 'move', x: coords.x, y: coords.y } });
  }, [controlEnabled, streaming, getScreenCoords, sendToDevice]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!controlEnabled || !streaming) return;
    e.preventDefault();
    // Focus the image so keyboard events work
    imgRef.current?.focus();
    const coords = getScreenCoords(e);
    if (!coords) return;
    const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
    sendToDevice({ type: 'mouse_input', payload: { action: 'mousedown', x: coords.x, y: coords.y, button } });
  }, [controlEnabled, streaming, getScreenCoords, sendToDevice]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!controlEnabled || !streaming) return;
    e.preventDefault();
    const coords = getScreenCoords(e);
    if (!coords) return;
    const button = e.button === 0 ? 'left' : e.button === 1 ? 'middle' : 'right';
    sendToDevice({ type: 'mouse_input', payload: { action: 'mouseup', x: coords.x, y: coords.y, button } });
  }, [controlEnabled, streaming, getScreenCoords, sendToDevice]);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (!controlEnabled || !streaming) return;
    e.preventDefault();
    const coords = getScreenCoords(e);
    if (!coords) return;
    sendToDevice({ type: 'mouse_input', payload: { action: 'dblclick', x: coords.x, y: coords.y } });
  }, [controlEnabled, streaming, getScreenCoords, sendToDevice]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (controlEnabled && streaming) e.preventDefault();
  }, [controlEnabled, streaming]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLElement>) => {
    if (!controlEnabled || !streaming) return;
    e.preventDefault();
    const coords = getScreenCoords(e);
    if (!coords) return;
    const delta = e.deltaY > 0 ? -120 : 120;
    sendToDevice({ type: 'mouse_input', payload: { action: 'scroll', x: coords.x, y: coords.y, delta } });
  }, [controlEnabled, streaming, getScreenCoords, sendToDevice]);

  // Keyboard handlers
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!controlEnabled || !streaming) return;
    e.preventDefault();
    e.stopPropagation();
    const vk = getVkCode(e.code);
    if (vk) {
      sendToDevice({ type: 'keyboard_input', payload: { action: 'keydown', vk } });
    }
  }, [controlEnabled, streaming, sendToDevice]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (!controlEnabled || !streaming) return;
    e.preventDefault();
    e.stopPropagation();
    const vk = getVkCode(e.code);
    if (vk) {
      sendToDevice({ type: 'keyboard_input', payload: { action: 'keyup', vk } });
    }
  }, [controlEnabled, streaming, sendToDevice]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Stop stream on unmount or device change
  useEffect(() => {
    return () => {
      if (selectedDeviceId) {
        const send = getGlobalWsSend();
        if (send) {
          send({ type: 'stop_screen_stream', payload: { deviceId: selectedDeviceId } });
        }
      }
    };
  }, [selectedDeviceId]);

  if (!selectedDeviceId) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">Выберите устройство для удалённого просмотра</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col ${isFullscreen ? 'h-screen bg-black' : 'h-[calc(100vh-180px)]'}`}>
      {/* Toolbar */}
      <div className={`flex items-center gap-3 ${isFullscreen ? 'p-2 bg-zinc-900/90 backdrop-blur' : 'mb-3'} flex-wrap`}>
        <div className="text-sm text-zinc-400 mr-1">
          <span className="text-white font-mono">{device?.hostname}</span>
          {resolution && (
            <span className="text-zinc-600 ml-2 text-xs">{resolution.width}x{resolution.height}</span>
          )}
        </div>

        {!streaming ? (
          <button
            onClick={startStream}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors font-medium"
          >
            ▶ Подключиться
          </button>
        ) : (
          <button
            onClick={stopStream}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors font-medium"
          >
            ⏹ Отключиться
          </button>
        )}

        <button
          onClick={() => setControlEnabled(!controlEnabled)}
          disabled={!streaming}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors border disabled:opacity-40 ${
            controlEnabled
              ? 'bg-violet-900/40 border-violet-700 text-violet-300 hover:bg-violet-900/60'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          {controlEnabled ? '🖱 Управление: ВКЛ' : '🖱 Управление: ВЫКЛ'}
        </button>

        <button
          onClick={toggleFullscreen}
          className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm rounded-lg transition-colors border border-zinc-700"
          title="Полный экран"
        >
          {isFullscreen ? '⊡' : '⛶'}
        </button>

        {streaming && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-500">{actualFps} FPS</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}
      </div>

      {/* Screen area */}
      <div
        ref={screenAreaRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
        className="bg-zinc-950 border border-zinc-800 rounded-lg"
      >
        {streamError ? (
          <div className="flex items-center justify-center w-full h-full">
          <div className="text-center text-red-400 px-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm font-medium mb-2">Ошибка захвата экрана</p>
            <p className="text-xs text-zinc-500 max-w-md mb-4">{streamError}</p>
            <button
              onClick={startStream}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg border border-zinc-700 transition-colors"
            >
              Попробовать снова
            </button>
          </div>
          </div>
        ) : streaming && frame ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={imgRef}
            src={frame}
            alt="Remote screen"
            tabIndex={0}
            draggable={false}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              outline: 'none',
              userSelect: 'none',
              cursor: controlEnabled ? 'crosshair' : 'default',
              imageRendering: 'auto',
            }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
          />
        ) : streaming ? (
          <div className="flex items-center justify-center w-full h-full text-zinc-500">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Подключение к экрану...</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full h-full text-zinc-500">
            <div className="text-center">
              <svg className="w-20 h-20 mx-auto mb-4 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <p className="text-sm mb-1">Нажмите &laquo;Подключиться&raquo; для просмотра экрана</p>
              <p className="text-xs text-zinc-600">Поддержка управления мышью и клавиатурой</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default ScreenViewer;