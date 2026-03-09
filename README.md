# Remote Admin Panel — Система удалённой технической поддержки

Инструмент для IT-специалистов: удалённая диагностика, настройка и обслуживание ПК клиентов через веб-панель.  
Каждый специалист разворачивает собственный экземпляр на своём сервере.

## Быстрый старт (локальная разработка)

```bash
# 1. Установка зависимостей
npm install

# 2. Скопировать конфиг
cp .env.example .env.local
# Отредактировать .env.local — задать логин/пароль и JWT_SECRET

# 3. Запуск (панель + WS-сервер одновременно)
npm run dev:all

# Или по отдельности:
npm run dev        # Next.js панель → http://localhost:3000
npm run dev:ws     # WebSocket сервер → ws://localhost:3001
```

## Вход в панель

Логин и пароль задаются в `.env.local`:
```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password
```

## Сборка клиентской утилиты

1. Зайти в панель → раздел **Сборка клиента**
2. Указать адрес WS-сервера (`wss://ws.yourdomain.com`)
3. Выбрать ОС (Windows / Linux / macOS)
4. Нажать **Собрать** → скачать .exe
5. Отправить файл пользователю — он просто запускает его

## Деплой на VPS (продакшен)

### Автоматический (рекомендуется)

```bash
# На Ubuntu 22/24 VPS:
git clone <your-repo> admin-panel && cd admin-panel
chmod +x deploy/setup-vps.sh
DOMAIN=panel.example.com WS_DOMAIN=ws.example.com ./deploy/setup-vps.sh
```

Скрипт автоматически:
- Установит Node.js 20, Nginx, Certbot
- Создаст `.env.local` с безопасным JWT_SECRET
- Соберёт проект и настроит SSL (Let's Encrypt)
- Запустит systemd-сервисы (auto-restart)
- Настроит файрвол (UFW)

### Ручной деплой

```bash
# 1. Установить Node.js 20+
# 2. Склонировать проект и установить зависимости
npm ci

# 3. Настроить .env.local
cp .env.example .env.local
# Заполнить: JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD, NEXT_PUBLIC_WS_URL

# 4. Собрать
npm run build

# 5. Запустить
npm run start:all
# Или через systemd — см. deploy/*.service
```

### Конфиги деплоя (в папке `deploy/`)

| Файл | Назначение |
|------|-----------|
| `setup-vps.sh` | Автоматическая установка на Ubuntu VPS |
| `nginx.conf` | Шаблон Nginx (панель + WSS проксирование) |
| `admin-panel.service` | systemd сервис для Next.js |
| `ws-server.service` | systemd сервис для WebSocket |

## Архитектура

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Панель           │◄─────►│  WS-сервер       │◄─────►│  Клиент-агент    │
│  (Next.js)        │  WSS  │  (Node.js)       │  WSS  │  (.exe)          │
│  port 3000        │       │  port 3001       │       │  на ПК клиента   │
└──────────────────┘       └──────────────────┘       └──────────────────┘
      │                                                         │
      │  HTTPS (Nginx)                          Запускает пользователь
      ▼
   Браузер IT-специалиста
```

## Функциональность

### Для IT-специалиста (панель)
- Просмотр подключённых устройств с геолокацией
- Системная информация (ОС, CPU, RAM, диски, сеть)
- Диспетчер процессов (список, завершение)
- Файловый менеджер (навигация, скачивание)
- Удалённый терминал (CMD/PowerShell/bash)
- Снимки экрана (разовые и Live-режим)
- Журнал событий
- Сборка клиента в 1 клик

### Для пользователя (клиент)
- Просто запускает .exe
- Сессия запускается автоматически
- Можно закрыть в любой момент

## Переменные окружения

```env
# Обязательные
JWT_SECRET=your-random-secret       # openssl rand -hex 32
ADMIN_USERNAME=admin                # логин для входа в панель
ADMIN_PASSWORD=secure-password      # пароль

# WebSocket
NEXT_PUBLIC_WS_URL=wss://ws.yourdomain.com  # публичный URL WS-сервера
WS_PORT=3001                                 # порт WS-сервера
```

Полный список — в `.env.example`.

## Технологии

- **Next.js 16** + React 19 + TypeScript
- **Tailwind CSS 4** — стилизация
- **Zustand** — состояние
- **WebSocket (ws)** — real-time
- **JWT** (httpOnly cookies) — аутентификация
- **pkg** — компиляция клиента в .exe
