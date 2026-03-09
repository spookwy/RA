'use client';

import React, { memo, useState, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { formatDate } from '@/lib/utils';

const Settings = memo(function Settings() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'appearance' | 'security'>('profile');

  const [notif, setNotif] = useState({
    deviceOffline: true,
    highCpu: true,
    highRam: false,
    newLogin: true,
    emailAlerts: false,
    soundEnabled: true,
  });

  const [appearance, setAppearance] = useState({
    theme: 'dark' as 'dark' | 'light' | 'system',
    compactMode: false,
    animationsEnabled: true,
    sidebarCollapsed: false,
    language: 'ru',
  });

  const [security, setSecurity] = useState({
    twoFactor: false,
    sessionTimeout: '8',
    ipWhitelist: '',
  });

  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const toggleNotif = useCallback((key: keyof typeof notif) => {
    setNotif(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const tabs = [
    { id: 'profile' as const, label: 'Профиль', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    )},
    { id: 'notifications' as const, label: 'Уведомления', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    )},
    { id: 'appearance' as const, label: 'Внешний вид', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    )},
    { id: 'security' as const, label: 'Безопасность', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    )},
  ];

  if (!user) return null;

  const daysUntilExpiry = Math.max(
    0,
    Math.ceil((new Date(user.subscriptionExpires).getTime() - Date.now()) / 86400000)
  );

  return (
    <div className="h-full overflow-auto custom-scrollbar p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-zinc-800 text-white shadow-lg'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fade-in">
            {/* User card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Информация профиля</h3>
              <div className="flex items-start gap-5">
                <div className="w-20 h-20 bg-gradient-to-br from-zinc-600 to-zinc-800 rounded-2xl flex items-center justify-center flex-shrink-0 ring-2 ring-zinc-700">
                  <span className="text-2xl font-bold text-white uppercase">
                    {user.username.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Имя пользователя</label>
                      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white">
                        {user.username}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Email</label>
                      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white">
                        {user.email || '—'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Роль</label>
                      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === 'admin' ? 'bg-white/10 text-white' : 'bg-zinc-700/50 text-zinc-400'
                        }`}>
                          {user.role === 'admin' ? 'Администратор' : 'Просмотр'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1">Дата регистрации</label>
                      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white">
                        {formatDate(user.registeredAt)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription card */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Подписка</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Статус</span>
                  <span className="flex items-center gap-2 text-sm font-medium text-green-400">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse-dot" />
                    Активна
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Действует до</span>
                  <span className="text-sm text-white">{formatDate(user.subscriptionExpires)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Осталось</span>
                  <span className={`text-sm font-medium ${daysUntilExpiry <= 30 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {daysUntilExpiry} дней
                  </span>
                </div>
                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>Прогресс подписки</span>
                    <span>{Math.round(Math.max(0, 100 - (daysUntilExpiry / 730) * 100))}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                      style={{ width: `${Math.max(0, 100 - (daysUntilExpiry / 730) * 100)}%` }}
                    />
                  </div>
                </div>
                <button className="mt-2 px-4 py-2 bg-white text-black text-sm rounded-lg font-medium hover:bg-zinc-200 transition-colors">
                  Продлить подписку
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Уведомления системы</h3>
              <div className="space-y-3">
                {[
                  { key: 'deviceOffline' as const, label: 'Устройство офлайн', desc: 'Уведомлять когда устройство отключается от сети' },
                  { key: 'highCpu' as const, label: 'Высокая нагрузка CPU', desc: 'Сигнал при загрузке процессора свыше 90%' },
                  { key: 'highRam' as const, label: 'Высокая нагрузка RAM', desc: 'Сигнал при использовании памяти свыше 90%' },
                  { key: 'newLogin' as const, label: 'Новый вход в систему', desc: 'Уведомлять о каждом новом входе в панель' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
                    <div>
                      <div className="text-sm text-white">{item.label}</div>
                      <div className="text-xs text-zinc-500">{item.desc}</div>
                    </div>
                    <button
                      onClick={() => toggleNotif(item.key)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
                        notif[item.key] ? 'bg-green-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${
                          notif[item.key] ? 'translate-x-[18px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Каналы доставки</h3>
              <div className="space-y-3">
                {[
                  { key: 'emailAlerts' as const, label: 'Email уведомления', desc: `Отправлять на ${user?.email || 'email'}` },
                  { key: 'soundEnabled' as const, label: 'Звуковые уведомления', desc: 'Воспроизводить звук при новом уведомлении' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
                    <div>
                      <div className="text-sm text-white">{item.label}</div>
                      <div className="text-xs text-zinc-500">{item.desc}</div>
                    </div>
                    <button
                      onClick={() => toggleNotif(item.key)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
                        notif[item.key] ? 'bg-green-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${
                          notif[item.key] ? 'translate-x-[18px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Тема оформления</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'dark' as const, label: 'Тёмная', icon: '🌙' },
                  { value: 'light' as const, label: 'Светлая', icon: '☀️' },
                  { value: 'system' as const, label: 'Системная', icon: '💻' },
                ].map(item => (
                  <button
                    key={item.value}
                    onClick={() => setAppearance(prev => ({ ...prev, theme: item.value }))}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 ${
                      appearance.theme === item.value
                        ? 'border-white bg-zinc-800 text-white'
                        : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Интерфейс</h3>
              <div className="space-y-3">
                {[
                  { key: 'compactMode', label: 'Компактный режим', desc: 'Уменьшенные отступы и размер элементов' },
                  { key: 'animationsEnabled', label: 'Анимации', desc: 'Плавные переходы и эффекты появления' },
                  { key: 'sidebarCollapsed', label: 'Складывать боковую панель', desc: 'Боковая панель свёрнута по умолчанию' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
                    <div>
                      <div className="text-sm text-white">{item.label}</div>
                      <div className="text-xs text-zinc-500">{item.desc}</div>
                    </div>
                    <button
                      onClick={() => setAppearance(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
                        appearance[item.key as keyof typeof appearance] ? 'bg-green-500' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${
                          appearance[item.key as keyof typeof appearance] ? 'translate-x-[18px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Язык</h3>
              <select
                value={appearance.language}
                onChange={(e) => setAppearance(prev => ({ ...prev, language: e.target.value }))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Пароль</h3>
              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Текущий пароль</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Новый пароль</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Повторите пароль</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
                <button className="px-4 py-2 bg-zinc-800 text-white text-sm rounded-lg font-medium hover:bg-zinc-700 transition-colors border border-zinc-700">
                  Сменить пароль
                </button>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Двухфакторная аутентификация</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white">2FA</div>
                  <div className="text-xs text-zinc-500">Дополнительный уровень защиты аккаунта</div>
                </div>
                <button
                  onClick={() => setSecurity(prev => ({ ...prev, twoFactor: !prev.twoFactor }))}
                  className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
                    security.twoFactor ? 'bg-green-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${
                      security.twoFactor ? 'translate-x-[18px]' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Сессия</h3>
              <div className="space-y-3 max-w-sm">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Таймаут сессии (часы)</label>
                  <select
                    value={security.sessionTimeout}
                    onChange={(e) => setSecurity(prev => ({ ...prev, sessionTimeout: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
                  >
                    <option value="1">1 час</option>
                    <option value="4">4 часа</option>
                    <option value="8">8 часов</option>
                    <option value="24">24 часа</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">IP Whitelist</label>
                  <input
                    type="text"
                    value={security.ipWhitelist}
                    onChange={(e) => setSecurity(prev => ({ ...prev, ipWhitelist: e.target.value }))}
                    placeholder="192.168.1.0/24, 10.0.0.1"
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                  <p className="text-xs text-zinc-600 mt-1">Через запятую, оставьте пустым для доступа с любого IP</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">Активные сессии</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 px-3 bg-zinc-800/50 rounded-lg border border-zinc-700/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm text-white">Текущая сессия</div>
                      <div className="text-xs text-zinc-500">Chrome · Windows · 192.168.1.100</div>
                    </div>
                  </div>
                  <span className="text-xs text-green-400 font-medium">Активна</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="flex items-center gap-3 pb-6">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-white text-black text-sm rounded-lg font-medium hover:bg-zinc-200 transition-colors"
          >
            {saved ? '✓ Сохранено' : 'Сохранить изменения'}
          </button>
          <span className="text-xs text-zinc-600">
            {saved && 'Настройки успешно сохранены'}
          </span>
        </div>
      </div>
    </div>
  );
});

export default Settings;
