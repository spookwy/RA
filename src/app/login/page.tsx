'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Load saved credentials from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vi_remember');
      if (saved) {
        const { u, p } = JSON.parse(saved);
        if (u) setUsername(u);
        if (p) setPassword(p);
        setRememberMe(true);
      }
    } catch { /* ignore */ }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Ошибка авторизации');
        return;
      }

      // Save or clear credentials based on Remember Me
      try {
        if (rememberMe) {
          localStorage.setItem('vi_remember', JSON.stringify({ u: username, p: password }));
        } else {
          localStorage.removeItem('vi_remember');
        }
      } catch { /* ignore */ }

      setUser(data.user);
      router.push('/dashboard');
    } catch {
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-4 animate-fade-in-scale overflow-hidden">
            <img src="/visualillusion_white_n.png" alt="VisualIllusion" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-xl font-semibold text-white">VisualIllusion</h1>
          <p className="text-sm text-zinc-500 mt-1">Система удаленного администрирования</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5 transition-all duration-300">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Логин
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              required
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRememberMe(!rememberMe)}
              className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${
                rememberMe
                  ? 'bg-white border-white'
                  : 'border-zinc-600 hover:border-zinc-500'
              }`}
            >
              {rememberMe && (
                <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className="text-sm text-zinc-400 select-none cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
              Запомнить меня
            </span>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-900/50 rounded-lg px-4 py-2.5 text-sm text-red-400 animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-medium py-2.5 px-4 rounded-lg hover:bg-zinc-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="w-4 h-4 animate-spinner" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {/* Demo credentials */}
        <div className="mt-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-4">
          <p className="text-xs text-zinc-600 mb-2">Демо-доступ:</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-zinc-500">
              <span className="text-zinc-400">admin</span> / admin123
            </div>
            <div className="text-zinc-500">
              <span className="text-zinc-400">viewer</span> / viewer123
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-700 text-center mt-4">
          © 2026 Corporate IT Department
        </p>
      </div>
    </div>
  );
}
