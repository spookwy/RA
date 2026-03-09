import type { Device, ProcessInfo, FileEntry, LogEntry, SystemInfo } from '@/types';

// ==================== Mock Devices ====================

const systemInfoTemplate: SystemInfo = {
  os: { platform: 'Windows', version: '10 Pro 22H2', arch: 'x64', hostname: '' },
  cpu: { model: 'Intel Core i7-12700K', cores: 12, speed: 3600, usage: 0 },
  memory: { total: 17179869184, used: 0, free: 0, usagePercent: 0 },
  disks: [
    { name: 'C:', mount: 'C:\\', type: 'NTFS', total: 512110190592, used: 0, free: 0, usagePercent: 0 },
    { name: 'D:', mount: 'D:\\', type: 'NTFS', total: 1099511627776, used: 0, free: 0, usagePercent: 0 },
  ],
  network: [{ name: 'Ethernet', ip: '', mac: '', speed: 1000 }],
};

function generateSystemInfo(hostname: string, ip: string, mac: string): SystemInfo {
  const cpuUsage = Math.random() * 80 + 5;
  const memUsed = Math.floor(Math.random() * 12 * 1024 * 1024 * 1024) + 2 * 1024 * 1024 * 1024;
  const diskUsed1 = Math.floor(Math.random() * 400 * 1024 * 1024 * 1024);
  const diskUsed2 = Math.floor(Math.random() * 700 * 1024 * 1024 * 1024);

  return {
    ...systemInfoTemplate,
    os: { ...systemInfoTemplate.os, hostname },
    cpu: { ...systemInfoTemplate.cpu, usage: Math.round(cpuUsage * 10) / 10 },
    memory: {
      total: 17179869184,
      used: memUsed,
      free: 17179869184 - memUsed,
      usagePercent: Math.round((memUsed / 17179869184) * 1000) / 10,
    },
    disks: [
      {
        ...systemInfoTemplate.disks[0],
        used: diskUsed1,
        free: 512110190592 - diskUsed1,
        usagePercent: Math.round((diskUsed1 / 512110190592) * 1000) / 10,
      },
      {
        ...systemInfoTemplate.disks[1],
        used: diskUsed2,
        free: 1099511627776 - diskUsed2,
        usagePercent: Math.round((diskUsed2 / 1099511627776) * 1000) / 10,
      },
    ],
    network: [{ name: 'Ethernet', ip, mac, speed: 1000 }],
  };
}

export const mockDevices: Device[] = [
  // Russia
  { id: 'dev-001', hostname: 'WS-ACCOUNTING-01', ip: '192.168.1.101', mac: '00:1A:2B:3C:4D:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 432000, agentVersion: '2.1.0', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-002', hostname: 'WS-HR-01', ip: '192.168.1.102', mac: '00:1A:2B:3C:4D:02', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 259200, agentVersion: '2.1.0', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-003', hostname: 'WS-DEV-01', ip: '192.168.1.103', mac: '00:1A:2B:3C:4D:03', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 86400, agentVersion: '2.0.9', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-004', hostname: 'WS-MARKETING-01', ip: '192.168.1.104', mac: '00:1A:2B:3C:4D:04', status: 'warning', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 300000).toISOString(), uptime: 172800, agentVersion: '2.0.8', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-005', hostname: 'WS-RECEPTION-01', ip: '192.168.1.105', mac: '00:1A:2B:3C:4D:05', status: 'offline', os: 'Windows 10 Home', lastSeen: new Date(Date.now() - 3600000).toISOString(), uptime: 0, agentVersion: '2.0.7', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-006', hostname: 'SRV-FILE-01', ip: '192.168.1.10', mac: '00:1A:2B:3C:4D:10', status: 'online', os: 'Windows Server 2022', lastSeen: new Date().toISOString(), uptime: 2592000, agentVersion: '2.1.0', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-007', hostname: 'WS-DESIGN-01', ip: '192.168.1.106', mac: '00:1A:2B:3C:4D:06', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 518400, agentVersion: '2.1.0', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-008', hostname: 'WS-MANAGER-01', ip: '192.168.1.107', mac: '00:1A:2B:3C:4D:07', status: 'offline', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 86400000).toISOString(), uptime: 0, agentVersion: '2.0.6', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-ru-09', hostname: 'WS-SALES-MSK-01', ip: '10.0.1.50', mac: '00:1A:2B:3C:5D:09', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 345600, agentVersion: '2.1.0', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-ru-10', hostname: 'WS-SALES-MSK-02', ip: '10.0.1.51', mac: '00:1A:2B:3C:5D:10', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 190000, agentVersion: '2.1.0', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-ru-11', hostname: 'SRV-DB-SPB-01', ip: '10.0.2.10', mac: '00:1A:2B:3C:5D:11', status: 'online', os: 'Windows Server 2022', lastSeen: new Date().toISOString(), uptime: 5184000, agentVersion: '2.1.0', country: 'Россия', countryCode: 'RUS' },
  { id: 'dev-ru-12', hostname: 'WS-SUPPORT-NSK-01', ip: '10.0.3.20', mac: '00:1A:2B:3C:5D:12', status: 'warning', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 120000).toISOString(), uptime: 86400, agentVersion: '2.0.9', country: 'Россия', countryCode: 'RUS' },
  // USA
  { id: 'dev-us-01', hostname: 'WS-NYC-OFFICE-01', ip: '10.10.1.101', mac: '00:2A:3B:4C:5D:01', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 604800, agentVersion: '2.1.0', country: 'США', countryCode: 'USA' },
  { id: 'dev-us-02', hostname: 'WS-NYC-OFFICE-02', ip: '10.10.1.102', mac: '00:2A:3B:4C:5D:02', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 302400, agentVersion: '2.1.0', country: 'США', countryCode: 'USA' },
  { id: 'dev-us-03', hostname: 'SRV-LA-CLOUD-01', ip: '10.10.2.10', mac: '00:2A:3B:4C:5D:03', status: 'online', os: 'Windows Server 2022', lastSeen: new Date().toISOString(), uptime: 1209600, agentVersion: '2.1.0', country: 'США', countryCode: 'USA' },
  { id: 'dev-us-04', hostname: 'WS-CHI-DEV-01', ip: '10.10.3.50', mac: '00:2A:3B:4C:5D:04', status: 'offline', os: 'Windows 11 Pro', lastSeen: new Date(Date.now() - 7200000).toISOString(), uptime: 0, agentVersion: '2.0.9', country: 'США', countryCode: 'USA' },
  { id: 'dev-us-05', hostname: 'WS-SF-QA-01', ip: '10.10.4.30', mac: '00:2A:3B:4C:5D:05', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 172800, agentVersion: '2.1.0', country: 'США', countryCode: 'USA' },
  { id: 'dev-us-06', hostname: 'WS-SF-QA-02', ip: '10.10.4.31', mac: '00:2A:3B:4C:5D:06', status: 'warning', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 200000).toISOString(), uptime: 86400, agentVersion: '2.0.8', country: 'США', countryCode: 'USA' },
  // Germany
  { id: 'dev-de-01', hostname: 'WS-BERLIN-FIN-01', ip: '10.20.1.101', mac: '00:3A:4B:5C:6D:01', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 518400, agentVersion: '2.1.0', country: 'Германия', countryCode: 'DEU' },
  { id: 'dev-de-02', hostname: 'WS-BERLIN-FIN-02', ip: '10.20.1.102', mac: '00:3A:4B:5C:6D:02', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 345600, agentVersion: '2.1.0', country: 'Германия', countryCode: 'DEU' },
  { id: 'dev-de-03', hostname: 'SRV-FRANK-DB-01', ip: '10.20.2.10', mac: '00:3A:4B:5C:6D:03', status: 'online', os: 'Windows Server 2022', lastSeen: new Date().toISOString(), uptime: 2592000, agentVersion: '2.1.0', country: 'Германия', countryCode: 'DEU' },
  { id: 'dev-de-04', hostname: 'WS-MUNICH-IT-01', ip: '10.20.3.50', mac: '00:3A:4B:5C:6D:04', status: 'offline', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 43200000).toISOString(), uptime: 0, agentVersion: '2.0.8', country: 'Германия', countryCode: 'DEU' },
  // Brazil
  { id: 'dev-br-01', hostname: 'WS-SP-SALES-01', ip: '10.30.1.101', mac: '00:4A:5B:6C:7D:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 259200, agentVersion: '2.1.0', country: 'Бразилия', countryCode: 'BRA' },
  { id: 'dev-br-02', hostname: 'WS-RJ-SUPPORT-01', ip: '10.30.2.50', mac: '00:4A:5B:6C:7D:02', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 172800, agentVersion: '2.1.0', country: 'Бразилия', countryCode: 'BRA' },
  { id: 'dev-br-03', hostname: 'WS-SP-DEV-01', ip: '10.30.1.102', mac: '00:4A:5B:6C:7D:03', status: 'offline', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 5400000).toISOString(), uptime: 0, agentVersion: '2.0.9', country: 'Бразилия', countryCode: 'BRA' },
  // China
  { id: 'dev-cn-01', hostname: 'WS-SH-FACTORY-01', ip: '10.40.1.101', mac: '00:5A:6B:7C:8D:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 604800, agentVersion: '2.1.0', country: 'Китай', countryCode: 'CHN' },
  { id: 'dev-cn-02', hostname: 'WS-SH-FACTORY-02', ip: '10.40.1.102', mac: '00:5A:6B:7C:8D:02', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 432000, agentVersion: '2.1.0', country: 'Китай', countryCode: 'CHN' },
  { id: 'dev-cn-03', hostname: 'SRV-BJ-CORE-01', ip: '10.40.2.10', mac: '00:5A:6B:7C:8D:03', status: 'online', os: 'Windows Server 2022', lastSeen: new Date().toISOString(), uptime: 2592000, agentVersion: '2.1.0', country: 'Китай', countryCode: 'CHN' },
  { id: 'dev-cn-04', hostname: 'WS-BJ-OFFICE-01', ip: '10.40.3.50', mac: '00:5A:6B:7C:8D:04', status: 'warning', os: 'Windows 11 Pro', lastSeen: new Date(Date.now() - 180000).toISOString(), uptime: 86400, agentVersion: '2.0.9', country: 'Китай', countryCode: 'CHN' },
  { id: 'dev-cn-05', hostname: 'WS-GZ-LOGISTICS-01', ip: '10.40.4.30', mac: '00:5A:6B:7C:8D:05', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 345600, agentVersion: '2.1.0', country: 'Китай', countryCode: 'CHN' },
  // India
  { id: 'dev-in-01', hostname: 'WS-MUM-DEV-01', ip: '10.50.1.101', mac: '00:6A:7B:8C:9D:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 259200, agentVersion: '2.1.0', country: 'Индия', countryCode: 'IND' },
  { id: 'dev-in-02', hostname: 'WS-BLR-DEV-01', ip: '10.50.2.50', mac: '00:6A:7B:8C:9D:02', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 172800, agentVersion: '2.1.0', country: 'Индия', countryCode: 'IND' },
  { id: 'dev-in-03', hostname: 'WS-BLR-DEV-02', ip: '10.50.2.51', mac: '00:6A:7B:8C:9D:03', status: 'offline', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 14400000).toISOString(), uptime: 0, agentVersion: '2.0.8', country: 'Индия', countryCode: 'IND' },
  // Kazakhstan
  { id: 'dev-kz-01', hostname: 'WS-ALMATY-01', ip: '10.60.1.101', mac: '00:7A:8B:9C:AD:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 432000, agentVersion: '2.1.0', country: 'Казахстан', countryCode: 'KAZ' },
  { id: 'dev-kz-02', hostname: 'WS-ASTANA-01', ip: '10.60.2.50', mac: '00:7A:8B:9C:AD:02', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 259200, agentVersion: '2.1.0', country: 'Казахстан', countryCode: 'KAZ' },
  // Ukraine
  { id: 'dev-ua-01', hostname: 'WS-KYIV-OPS-01', ip: '10.70.1.101', mac: '00:8A:9B:AC:BD:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 345600, agentVersion: '2.1.0', country: 'Украина', countryCode: 'UKR' },
  { id: 'dev-ua-02', hostname: 'WS-KYIV-OPS-02', ip: '10.70.1.102', mac: '00:8A:9B:AC:BD:02', status: 'offline', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 28800000).toISOString(), uptime: 0, agentVersion: '2.0.7', country: 'Украина', countryCode: 'UKR' },
  // Japan
  { id: 'dev-jp-01', hostname: 'WS-TKY-OFFICE-01', ip: '10.80.1.101', mac: '00:9A:AB:BC:CD:01', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 604800, agentVersion: '2.1.0', country: 'Япония', countryCode: 'JPN' },
  // UK
  { id: 'dev-gb-01', hostname: 'WS-LDN-SALES-01', ip: '10.90.1.101', mac: '00:AA:BB:CC:DD:01', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 432000, agentVersion: '2.1.0', country: 'Великобритания', countryCode: 'GBR' },
  { id: 'dev-gb-02', hostname: 'WS-LDN-SALES-02', ip: '10.90.1.102', mac: '00:AA:BB:CC:DD:02', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 259200, agentVersion: '2.1.0', country: 'Великобритания', countryCode: 'GBR' },
  // Australia
  { id: 'dev-au-01', hostname: 'WS-SYD-REMOTE-01', ip: '10.100.1.101', mac: '00:BA:CB:DC:ED:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 172800, agentVersion: '2.1.0', country: 'Австралия', countryCode: 'AUS' },
  { id: 'dev-au-02', hostname: 'WS-SYD-REMOTE-02', ip: '10.100.1.102', mac: '00:BA:CB:DC:ED:02', status: 'offline', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 10800000).toISOString(), uptime: 0, agentVersion: '2.0.9', country: 'Австралия', countryCode: 'AUS' },
  // Turkey
  { id: 'dev-tr-01', hostname: 'WS-IST-BRANCH-01', ip: '10.110.1.101', mac: '00:CA:DB:EC:FD:01', status: 'online', os: 'Windows 10 Pro', lastSeen: new Date().toISOString(), uptime: 345600, agentVersion: '2.1.0', country: 'Турция', countryCode: 'TUR' },
  // Poland
  { id: 'dev-pl-01', hostname: 'WS-WAR-IT-01', ip: '10.120.1.101', mac: '00:DA:EB:FC:0D:01', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 518400, agentVersion: '2.1.0', country: 'Польша', countryCode: 'POL' },
  { id: 'dev-pl-02', hostname: 'WS-WAR-IT-02', ip: '10.120.1.102', mac: '00:DA:EB:FC:0D:02', status: 'warning', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 240000).toISOString(), uptime: 86400, agentVersion: '2.0.8', country: 'Польша', countryCode: 'POL' },
  // Canada
  { id: 'dev-ca-01', hostname: 'WS-TOR-SALES-01', ip: '10.130.1.101', mac: '00:EA:FB:0C:1D:01', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 259200, agentVersion: '2.1.0', country: 'Канада', countryCode: 'CAN' },
  // France
  { id: 'dev-fr-01', hostname: 'WS-PAR-DESIGN-01', ip: '10.140.1.101', mac: '00:FA:0B:1C:2D:01', status: 'online', os: 'Windows 11 Pro', lastSeen: new Date().toISOString(), uptime: 432000, agentVersion: '2.1.0', country: 'Франция', countryCode: 'FRA' },
  { id: 'dev-fr-02', hostname: 'WS-PAR-DESIGN-02', ip: '10.140.1.102', mac: '00:FA:0B:1C:2D:02', status: 'offline', os: 'Windows 10 Pro', lastSeen: new Date(Date.now() - 21600000).toISOString(), uptime: 0, agentVersion: '2.0.9', country: 'Франция', countryCode: 'FRA' },
];

// Attach system info to online devices
mockDevices.forEach((d) => {
  if (d.status !== 'offline') {
    d.systemInfo = generateSystemInfo(d.hostname, d.ip, d.mac);
  }
});

// ==================== Mock Processes ====================

export function getMockProcesses(deviceId: string): ProcessInfo[] {
  void deviceId;
  const processes: ProcessInfo[] = [
    { pid: 4, name: 'System', cpu: 0.1, memory: 24, user: 'SYSTEM', status: 'Running', startTime: '2025-02-27T08:00:00Z' },
    { pid: 612, name: 'csrss.exe', cpu: 0.3, memory: 12, user: 'SYSTEM', status: 'Running', startTime: '2025-02-27T08:00:01Z' },
    { pid: 780, name: 'wininit.exe', cpu: 0.0, memory: 5, user: 'SYSTEM', status: 'Running', startTime: '2025-02-27T08:00:01Z' },
    { pid: 884, name: 'services.exe', cpu: 0.2, memory: 18, user: 'SYSTEM', status: 'Running', startTime: '2025-02-27T08:00:02Z' },
    { pid: 920, name: 'lsass.exe', cpu: 0.5, memory: 32, user: 'SYSTEM', status: 'Running', startTime: '2025-02-27T08:00:02Z' },
    { pid: 1204, name: 'svchost.exe', cpu: 1.2, memory: 45, user: 'SYSTEM', status: 'Running', startTime: '2025-02-27T08:00:03Z' },
    { pid: 1356, name: 'svchost.exe', cpu: 0.8, memory: 38, user: 'NETWORK SERVICE', status: 'Running', startTime: '2025-02-27T08:00:03Z' },
    { pid: 2104, name: 'explorer.exe', cpu: 2.4, memory: 128, user: 'user', status: 'Running', startTime: '2025-02-27T08:01:00Z' },
    { pid: 2580, name: 'RuntimeBroker.exe', cpu: 0.1, memory: 22, user: 'user', status: 'Running', startTime: '2025-02-27T08:01:05Z' },
    { pid: 3200, name: 'chrome.exe', cpu: 8.5, memory: 512, user: 'user', status: 'Running', startTime: '2025-02-27T09:00:00Z' },
    { pid: 3204, name: 'chrome.exe', cpu: 3.2, memory: 256, user: 'user', status: 'Running', startTime: '2025-02-27T09:00:01Z' },
    { pid: 3208, name: 'chrome.exe', cpu: 1.8, memory: 180, user: 'user', status: 'Running', startTime: '2025-02-27T09:00:01Z' },
    { pid: 4100, name: 'outlook.exe', cpu: 1.5, memory: 220, user: 'user', status: 'Running', startTime: '2025-02-27T08:02:00Z' },
    { pid: 4500, name: 'excel.exe', cpu: 0.3, memory: 150, user: 'user', status: 'Running', startTime: '2025-02-27T10:00:00Z' },
    { pid: 5010, name: 'Teams.exe', cpu: 4.1, memory: 390, user: 'user', status: 'Running', startTime: '2025-02-27T08:02:30Z' },
    { pid: 5500, name: 'OneDrive.exe', cpu: 0.2, memory: 85, user: 'user', status: 'Running', startTime: '2025-02-27T08:01:10Z' },
    { pid: 6000, name: 'SecurityHealthSystray.exe', cpu: 0.0, memory: 8, user: 'user', status: 'Running', startTime: '2025-02-27T08:01:15Z' },
    { pid: 6500, name: 'agent.exe', cpu: 0.4, memory: 35, user: 'SYSTEM', status: 'Running', startTime: '2025-02-27T08:00:05Z' },
  ];
  return processes.map((p) => ({
    ...p,
    cpu: Math.round((p.cpu + (Math.random() - 0.5) * 2) * 10) / 10,
    memory: Math.round(p.memory + (Math.random() - 0.5) * 20),
  }));
}

// ==================== Mock Files ====================

export function getMockFiles(deviceId: string, path: string): FileEntry[] {
  void deviceId;

  if (path === 'C:\\') {
    return [
      { name: 'Program Files', path: 'C:\\Program Files', type: 'directory', size: 0, modified: '2025-01-15T10:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'Program Files (x86)', path: 'C:\\Program Files (x86)', type: 'directory', size: 0, modified: '2025-01-15T10:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'Users', path: 'C:\\Users', type: 'directory', size: 0, modified: '2025-02-27T08:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'Windows', path: 'C:\\Windows', type: 'directory', size: 0, modified: '2025-02-20T12:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'pagefile.sys', path: 'C:\\pagefile.sys', type: 'file', size: 8589934592, modified: '2025-02-28T08:00:00Z', permissions: 'rw-------' },
      { name: 'hiberfil.sys', path: 'C:\\hiberfil.sys', type: 'file', size: 6871846400, modified: '2025-02-28T07:00:00Z', permissions: 'rw-------' },
    ];
  }

  if (path === 'C:\\Users') {
    return [
      { name: 'Default', path: 'C:\\Users\\Default', type: 'directory', size: 0, modified: '2025-01-01T10:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'Public', path: 'C:\\Users\\Public', type: 'directory', size: 0, modified: '2025-02-10T09:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'user', path: 'C:\\Users\\user', type: 'directory', size: 0, modified: '2025-02-28T12:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'desktop.ini', path: 'C:\\Users\\desktop.ini', type: 'file', size: 174, modified: '2025-01-01T10:00:00Z', permissions: 'rw-r--r--' },
    ];
  }

  if (path === 'C:\\Users\\user') {
    return [
      { name: 'Desktop', path: 'C:\\Users\\user\\Desktop', type: 'directory', size: 0, modified: '2025-02-28T11:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'Documents', path: 'C:\\Users\\user\\Documents', type: 'directory', size: 0, modified: '2025-02-28T10:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'Downloads', path: 'C:\\Users\\user\\Downloads', type: 'directory', size: 0, modified: '2025-02-28T09:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'Pictures', path: 'C:\\Users\\user\\Pictures', type: 'directory', size: 0, modified: '2025-02-20T14:00:00Z', permissions: 'rwxr-xr-x' },
      { name: 'AppData', path: 'C:\\Users\\user\\AppData', type: 'directory', size: 0, modified: '2025-02-28T12:00:00Z', permissions: 'rwxr-xr-x' },
    ];
  }

  if (path.includes('Desktop')) {
    return [
      { name: 'report_Q4.xlsx', path: `${path}\\report_Q4.xlsx`, type: 'file', size: 245760, modified: '2025-02-27T16:30:00Z', permissions: 'rw-r--r--' },
      { name: 'presentation.pptx', path: `${path}\\presentation.pptx`, type: 'file', size: 5242880, modified: '2025-02-26T14:00:00Z', permissions: 'rw-r--r--' },
      { name: 'notes.txt', path: `${path}\\notes.txt`, type: 'file', size: 1024, modified: '2025-02-28T09:15:00Z', permissions: 'rw-r--r--' },
      { name: 'Projects', path: `${path}\\Projects`, type: 'directory', size: 0, modified: '2025-02-25T10:00:00Z', permissions: 'rwxr-xr-x' },
    ];
  }

  return [
    { name: '..', path: path.split('\\').slice(0, -1).join('\\') || 'C:\\', type: 'directory', size: 0, modified: '', permissions: '' },
  ];
}

// ==================== Mock Logs ====================

const logMessages: Array<{ level: LogEntry['level']; category: LogEntry['category']; message: string }> = [
  { level: 'info', category: 'system', message: 'System startup completed successfully' },
  { level: 'info', category: 'activity', message: 'User logged in' },
  { level: 'info', category: 'activity', message: 'Application launched: chrome.exe' },
  { level: 'info', category: 'activity', message: 'Application launched: outlook.exe' },
  { level: 'warning', category: 'system', message: 'High CPU usage detected (>90%)' },
  { level: 'warning', category: 'security', message: 'Failed login attempt detected' },
  { level: 'info', category: 'activity', message: 'File accessed: C:\\Users\\user\\Documents\\report.xlsx' },
  { level: 'info', category: 'keystroke', message: 'Keystroke logging active — 1,247 keystrokes recorded' },
  { level: 'error', category: 'system', message: 'Service crashed: PrintSpooler' },
  { level: 'info', category: 'system', message: 'Windows Update check completed' },
  { level: 'warning', category: 'system', message: 'Disk space low on C: drive (<10%)' },
  { level: 'critical', category: 'security', message: 'Unauthorized access attempt to admin share' },
  { level: 'info', category: 'activity', message: 'USB device connected: Kingston DataTraveler' },
  { level: 'warning', category: 'security', message: 'Antivirus definitions outdated' },
  { level: 'info', category: 'activity', message: 'Print job sent to HP LaserJet' },
  { level: 'info', category: 'system', message: 'Agent heartbeat — all services running normally' },
];

export function getMockLogs(count: number = 50): LogEntry[] {
  const logs: LogEntry[] = [];
  for (let i = 0; i < count; i++) {
    const template = logMessages[Math.floor(Math.random() * logMessages.length)];
    const device = mockDevices[Math.floor(Math.random() * mockDevices.length)];
    logs.push({
      id: `log-${Date.now()}-${i}`,
      timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      deviceId: device.id,
      deviceName: device.hostname,
      level: template.level,
      category: template.category,
      message: template.message,
    });
  }
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
