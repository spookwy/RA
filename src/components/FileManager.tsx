'use client';

import React, { memo, useEffect, useCallback, useState } from 'react';
import { useFileStore, useDeviceStore, getGlobalWsSend, setPendingDownloadCallback } from '@/store';
import { formatBytes, formatDate } from '@/lib/utils';
import type { FileEntry } from '@/types';

function requestFiles(deviceId: string, path: string) {
  const send = getGlobalWsSend();
  if (send) {
    send({
      type: 'request_files',
      payload: { deviceId, path },
    });
  }
}

const FileIcon = memo(function FileIcon({ type }: { type: 'file' | 'directory' }) {
  if (type === 'directory') {
    return (
      <svg className="w-5 h-5 text-yellow-500/70" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
});

const FileRow = memo(function FileRow({
  file,
  onNavigate,
  onDownload,
}: {
  file: FileEntry;
  onNavigate: (path: string) => void;
  onDownload: (file: FileEntry) => void;
}) {
  return (
    <tr
      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
      onDoubleClick={() => file.type === 'directory' && onNavigate(file.path)}
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <FileIcon type={file.type} />
          <span
            className={`text-sm ${file.type === 'directory' ? 'text-white' : 'text-zinc-300'}`}
            onClick={() => file.type === 'directory' && onNavigate(file.path)}
          >
            {file.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-sm text-zinc-500">
        {file.type === 'file' ? formatBytes(file.size) : '—'}
      </td>
      <td className="px-4 py-2.5 text-sm text-zinc-500">
        {file.type === 'directory' ? 'Папка' : file.name.split('.').pop()?.toUpperCase() || 'Файл'}
      </td>
      <td className="px-4 py-2.5 text-sm text-zinc-500">
        {file.modified ? formatDate(file.modified) : '—'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(file);
            }}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
            title={file.type === 'directory' ? 'Скачать как ZIP' : 'Скачать'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
});

const FileManager = memo(function FileManager() {
  const { selectedDeviceId } = useDeviceStore();
  const { currentPath, files, setPath, setFiles, goBack, history } = useFileStore();
  const [loading, setLoading] = useState(false);

  const loadFiles = useCallback(
    (path: string) => {
      if (!selectedDeviceId) return;
      setLoading(true);
      requestFiles(selectedDeviceId, path);
      // Loading will be cleared when file_list response comes in from WS
      setTimeout(() => setLoading(false), 3000); // fallback timeout
    },
    [selectedDeviceId]
  );

  // When files arrive from WS, stop loading
  useEffect(() => {
    setLoading(false);
  }, [files]);

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath, loadFiles]);

  const handleNavigate = useCallback(
    (path: string) => {
      setPath(path);
    },
    [setPath]
  );

  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = useCallback((file: FileEntry) => {
    if (!selectedDeviceId) return;
    const send = getGlobalWsSend();
    if (!send) return;

    setDownloading(file.path);

    // Set callback to handle the download result
    setPendingDownloadCallback((result) => {
      setDownloading(null);
      setPendingDownloadCallback(null);

      if (result.error) {
        alert(`Ошибка скачивания: ${result.error}`);
        return;
      }

      // Decode base64 and trigger browser download
      try {
        const byteChars = atob(result.data);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('Ошибка при сохранении файла');
        console.error(e);
      }
    });

    // Send download request
    send({
      type: 'request_download',
      payload: { deviceId: selectedDeviceId, path: file.path },
    });

    // Timeout fallback
    setTimeout(() => {
      setDownloading((prev) => {
        if (prev === file.path) {
          setPendingDownloadCallback(null);
          return null;
        }
        return prev;
      });
    }, 60000);
  }, [selectedDeviceId]);

  const handleUpload = useCallback(() => {
    // In production: open file upload dialog
    alert('Загрузка файлов — функция будет доступна при подключении агента');
  }, []);

  if (!selectedDeviceId) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Выберите устройство для просмотра файлов
      </div>
    );
  }

  const pathParts = currentPath.split('\\').filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={goBack}
          disabled={history.length === 0}
          className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors border border-zinc-700"
          title="Назад"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => handleNavigate(currentPath.split('\\').slice(0, -1).join('\\') || 'C:\\')}
          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
          title="Вверх"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={() => loadFiles(currentPath)}
          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
          title="Обновить"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* Breadcrumb */}
        <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm overflow-x-auto">
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-zinc-600 mx-1">\</span>}
              <button
                onClick={() => handleNavigate(pathParts.slice(0, i + 1).join('\\') + '\\')}
                className="text-zinc-400 hover:text-white transition-colors whitespace-nowrap"
              >
                {part}
              </button>
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={handleUpload}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors border border-zinc-700"
        >
          Загрузить
        </button>
      </div>

      {/* File Table */}
      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-250px)]">
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left">Имя</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left w-28">Размер</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left w-24">Тип</th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider text-left w-44">Изменен</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  onNavigate={handleNavigate}
                  onDownload={handleDownload}
                />
              ))}
            </tbody>
          </table>
        </div>
        {files.length === 0 && (
          <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
            {loading ? 'Загрузка файлов...' : 'Папка пуста'}
          </div>
        )}
      </div>
    </div>
  );
});

export default FileManager;
