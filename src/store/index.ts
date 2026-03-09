import { create } from 'zustand';
import type {
  Device,
  DashboardView,
  ProcessInfo,
  FileEntry,
  LogEntry,
  CommandResult,
  DashboardStats,
  User,
  ForensicResult,
} from '@/types';

// ==================== Auth Store ====================

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));

// ==================== Device Store ====================

interface DeviceStore {
  devices: Device[];
  selectedDeviceId: string | null;
  setDevices: (devices: Device[]) => void;
  addOrUpdateDevice: (device: Device) => void;
  updateDevice: (id: string, updates: Partial<Device>) => void;
  removeDevice: (id: string) => void;
  selectDevice: (id: string | null) => void;
  getSelectedDevice: () => Device | undefined;
  getStats: () => DashboardStats;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  devices: [],
  selectedDeviceId: null,
  setDevices: (devices) => set({ devices }),
  addOrUpdateDevice: (device) =>
    set((state) => {
      const exists = state.devices.find((d) => d.id === device.id);
      if (exists) {
        return { devices: state.devices.map((d) => (d.id === device.id ? { ...d, ...device } : d)) };
      }
      return { devices: [device, ...state.devices] };
    }),
  updateDevice: (id, updates) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),
  removeDevice: (id) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== id),
      selectedDeviceId: state.selectedDeviceId === id ? null : state.selectedDeviceId,
    })),
  selectDevice: (id) => set({ selectedDeviceId: id }),
  getSelectedDevice: () => {
    const { devices, selectedDeviceId } = get();
    return devices.find((d) => d.id === selectedDeviceId);
  },
  getStats: () => {
    const { devices } = get();
    return {
      totalDevices: devices.length,
      onlineDevices: devices.filter((d) => d.status === 'online').length,
      offlineDevices: devices.filter((d) => d.status === 'offline').length,
      warningDevices: devices.filter((d) => d.status === 'warning').length,
      totalAlerts: devices.filter((d) => d.status !== 'online').length,
    };
  },
}));

// ==================== Dashboard Store ====================

interface DashboardStore {
  currentView: DashboardView;
  sidebarCollapsed: boolean;
  setView: (view: DashboardView) => void;
  toggleSidebar: () => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  currentView: 'overview',
  sidebarCollapsed: false,
  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

// ==================== Process Store ====================

interface ProcessStore {
  processes: ProcessInfo[];
  sortField: keyof ProcessInfo;
  sortDirection: 'asc' | 'desc';
  filter: string;
  setProcesses: (processes: ProcessInfo[]) => void;
  setSort: (field: keyof ProcessInfo) => void;
  setFilter: (filter: string) => void;
  getSortedProcesses: () => ProcessInfo[];
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  processes: [],
  sortField: 'cpu',
  sortDirection: 'desc',
  filter: '',
  setProcesses: (processes) => set({ processes }),
  setSort: (field) =>
    set((state) => ({
      sortField: field,
      sortDirection: state.sortField === field && state.sortDirection === 'desc' ? 'asc' : 'desc',
    })),
  setFilter: (filter) => set({ filter }),
  getSortedProcesses: () => {
    const { processes, sortField, sortDirection, filter } = get();
    let filtered = processes;
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      filtered = processes.filter(
        (p) =>
          p.name.toLowerCase().includes(lowerFilter) ||
          p.user.toLowerCase().includes(lowerFilter) ||
          String(p.pid).includes(lowerFilter)
      );
    }
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const mult = sortDirection === 'asc' ? 1 : -1;
      if (typeof aVal === 'string') return aVal.localeCompare(bVal as string) * mult;
      return ((aVal as number) - (bVal as number)) * mult;
    });
  },
}));

// ==================== File Store ====================

interface FileStore {
  currentPath: string;
  files: FileEntry[];
  history: string[];
  setPath: (path: string) => void;
  setFiles: (files: FileEntry[]) => void;
  goBack: () => void;
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentPath: 'C:\\',
  files: [],
  history: [],
  setPath: (path) =>
    set((state) => ({
      currentPath: path,
      history: [...state.history, state.currentPath],
    })),
  setFiles: (files) => set({ files }),
  goBack: () => {
    const { history } = get();
    if (history.length === 0) return;
    const prevPath = history[history.length - 1];
    set({ currentPath: prevPath, history: history.slice(0, -1) });
  },
}));

// ==================== Log Store ====================

interface LogStore {
  logs: LogEntry[];
  levelFilter: string;
  categoryFilter: string;
  searchQuery: string;
  setLogs: (logs: LogEntry[]) => void;
  addLog: (log: LogEntry) => void;
  setLevelFilter: (level: string) => void;
  setCategoryFilter: (category: string) => void;
  setSearchQuery: (query: string) => void;
  getFilteredLogs: () => LogEntry[];
}

export const useLogStore = create<LogStore>((set, get) => ({
  logs: [],
  levelFilter: 'all',
  categoryFilter: 'all',
  searchQuery: '',
  setLogs: (logs) => set({ logs }),
  addLog: (log) => set((state) => ({ logs: [log, ...state.logs].slice(0, 500) })),
  setLevelFilter: (levelFilter) => set({ levelFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  getFilteredLogs: () => {
    const { logs, levelFilter, categoryFilter, searchQuery } = get();
    return logs.filter((log) => {
      if (levelFilter !== 'all' && log.level !== levelFilter) return false;
      if (categoryFilter !== 'all' && log.category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          log.message.toLowerCase().includes(q) ||
          log.deviceName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  },
}));

// ==================== Terminal Store ====================

export interface AgentLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  text: string;
  ts: string;
}

interface TerminalStore {
  history: CommandResult[];
  agentLogs: Record<string, AgentLogEntry[]>; // deviceId -> logs
  isExecuting: boolean;
  addResult: (result: CommandResult) => void;
  addAgentLog: (deviceId: string, entry: AgentLogEntry) => void;
  clearAgentLogs: (deviceId: string) => void;
  setExecuting: (value: boolean) => void;
  clearHistory: () => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  history: [],
  agentLogs: {},
  isExecuting: false,
  addResult: (result) => set((state) => ({ history: [...state.history, result] })),
  addAgentLog: (deviceId, entry) => set((state) => {
    const prev = state.agentLogs[deviceId] || [];
    const updated = [...prev, entry];
    // Keep last 1000 entries per device
    return { agentLogs: { ...state.agentLogs, [deviceId]: updated.length > 1000 ? updated.slice(-1000) : updated } };
  }),
  clearAgentLogs: (deviceId) => set((state) => ({ agentLogs: { ...state.agentLogs, [deviceId]: [] } })),
  setExecuting: (isExecuting) => set({ isExecuting }),
  clearHistory: () => set({ history: [] }),
}));

// ==================== Screenshot Store ====================

interface ScreenshotData {
  image: string;
  width: number;
  height: number;
  timestamp: string;
}

interface ScreenshotStore {
  screenshots: Record<string, ScreenshotData | null>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  setScreenshot: (deviceId: string, data: ScreenshotData) => void;
  setLoading: (deviceId: string, loading: boolean) => void;
  setError: (deviceId: string, error: string | null) => void;
}

export const useScreenshotStore = create<ScreenshotStore>((set) => ({
  screenshots: {},
  loading: {},
  error: {},
  setScreenshot: (deviceId, data) =>
    set((state) => ({
      screenshots: { ...state.screenshots, [deviceId]: data },
      loading: { ...state.loading, [deviceId]: false },
      error: { ...state.error, [deviceId]: null },
    })),
  setLoading: (deviceId, loading) =>
    set((state) => ({
      loading: { ...state.loading, [deviceId]: loading },
    })),
  setError: (deviceId, error) =>
    set((state) => ({
      error: { ...state.error, [deviceId]: error },
      loading: { ...state.loading, [deviceId]: false },
    })),
}));

// ==================== Screen Stream Store ====================

interface ScreenStreamStore {
  frame: Record<string, string | null>;
  streaming: Record<string, boolean>;
  resolution: Record<string, { width: number; height: number }>;
  fps: Record<string, number>;
  error: Record<string, string | null>;
  setFrame: (deviceId: string, image: string, width: number, height: number) => void;
  setStreaming: (deviceId: string, streaming: boolean) => void;
  setFps: (deviceId: string, fps: number) => void;
  setError: (deviceId: string, error: string | null) => void;
  clear: (deviceId: string) => void;
}

export const useScreenStreamStore = create<ScreenStreamStore>((set) => ({
  frame: {},
  streaming: {},
  resolution: {},
  fps: {},
  error: {},
  setFrame: (deviceId, image, width, height) =>
    set((state) => ({
      frame: { ...state.frame, [deviceId]: image },
      resolution: { ...state.resolution, [deviceId]: { width, height } },
      error: { ...state.error, [deviceId]: null },
    })),
  setStreaming: (deviceId, streaming) =>
    set((state) => ({
      streaming: { ...state.streaming, [deviceId]: streaming },
      ...(streaming ? { error: { ...state.error, [deviceId]: null } } : { frame: { ...state.frame, [deviceId]: null } }),
    })),
  setFps: (deviceId, fps) =>
    set((state) => ({
      fps: { ...state.fps, [deviceId]: fps },
    })),
  setError: (deviceId, error) =>
    set((state) => ({
      error: { ...state.error, [deviceId]: error },
      streaming: { ...state.streaming, [deviceId]: false },
      frame: { ...state.frame, [deviceId]: null },
    })),
  clear: (deviceId) =>
    set((state) => ({
      frame: { ...state.frame, [deviceId]: null },
      streaming: { ...state.streaming, [deviceId]: false },
      fps: { ...state.fps, [deviceId]: 0 },
      error: { ...state.error, [deviceId]: null },
    })),
}));

// ==================== Camera Store ====================

interface CameraInfo {
  id: string;
  name: string;
}

interface CameraStore {
  cameras: Record<string, CameraInfo[]>;
  frame: Record<string, string | null>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  setCameras: (deviceId: string, cameras: CameraInfo[]) => void;
  setFrame: (deviceId: string, image: string) => void;
  setLoading: (deviceId: string, loading: boolean) => void;
  setError: (deviceId: string, error: string | null) => void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  cameras: {},
  frame: {},
  loading: {},
  error: {},
  setCameras: (deviceId, cameras) =>
    set((state) => ({
      cameras: { ...state.cameras, [deviceId]: cameras },
    })),
  setFrame: (deviceId, image) =>
    set((state) => ({
      frame: { ...state.frame, [deviceId]: image },
      loading: { ...state.loading, [deviceId]: false },
      error: { ...state.error, [deviceId]: null },
    })),
  setLoading: (deviceId, loading) =>
    set((state) => ({
      loading: { ...state.loading, [deviceId]: loading },
    })),
  setError: (deviceId, error) =>
    set((state) => ({
      error: { ...state.error, [deviceId]: error },
      loading: { ...state.loading, [deviceId]: false },
    })),
}));

// ==================== Forensics Store ====================

interface ForensicsStore {
  results: Record<string, ForensicResult | null>;
  scanning: Record<string, boolean>;
  setResult: (deviceId: string, result: ForensicResult) => void;
  setScanning: (deviceId: string, scanning: boolean) => void;
  updateProgress: (deviceId: string, progress: number) => void;
  clearResult: (deviceId: string) => void;
}

export const useForensicsStore = create<ForensicsStore>((set) => ({
  results: {},
  scanning: {},
  setResult: (deviceId, result) =>
    set((state) => {
      const existing = state.results[deviceId];
      // If incoming is a progress update (scanning) and we already have a complete result,
      // merge to preserve existing data (sessions, inventory, files, report, archive)
      if (result.status === 'scanning' && existing && existing.status === 'complete') {
        return {
          results: { ...state.results, [deviceId]: { ...existing, progress: result.progress, status: 'scanning' } },
          scanning: { ...state.scanning, [deviceId]: true },
        };
      }
      // If incoming is complete, merge archiveData into existing result if present
      if (result.status === 'complete' && existing) {
        return {
          results: { ...state.results, [deviceId]: { ...existing, ...result } },
          scanning: { ...state.scanning, [deviceId]: false },
        };
      }
      return {
        results: { ...state.results, [deviceId]: result },
        scanning: { ...state.scanning, [deviceId]: result.status === 'scanning' },
      };
    }),
  setScanning: (deviceId, scanning) =>
    set((state) => ({
      scanning: { ...state.scanning, [deviceId]: scanning },
    })),
  updateProgress: (deviceId, progress) =>
    set((state) => {
      const existing = state.results[deviceId];
      if (!existing) return state;
      return {
        results: { ...state.results, [deviceId]: { ...existing, progress } },
      };
    }),
  clearResult: (deviceId) =>
    set((state) => ({
      results: { ...state.results, [deviceId]: null },
      scanning: { ...state.scanning, [deviceId]: false },
    })),
}));

// ==================== Global WS Send ====================
// Allows components to send WS messages without prop drilling

type WSSendFn = (message: Record<string, unknown>) => void;

let globalWsSend: WSSendFn | null = null;

export function setGlobalWsSend(send: WSSendFn) {
  globalWsSend = send;
}

export function getGlobalWsSend(): WSSendFn | null {
  return globalWsSend;
}

// ==================== Download helpers ====================

type DownloadCallback = (data: { name: string; data: string; mime: string; size: number; error?: string }) => void;
let pendingDownloadCallback: DownloadCallback | null = null;

export function setPendingDownloadCallback(cb: DownloadCallback | null) {
  pendingDownloadCallback = cb;
}

export function getPendingDownloadCallback(): DownloadCallback | null {
  return pendingDownloadCallback;
}
