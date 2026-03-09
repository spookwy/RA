import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { mockDevices, getMockProcesses, getMockFiles, getMockLogs } from '@/lib/mock-data';

export async function GET(request: NextRequest) {
  // Verify auth
  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Недействительный токен' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const deviceId = searchParams.get('deviceId');

  switch (action) {
    case 'devices':
      return NextResponse.json({ devices: mockDevices });

    case 'processes':
      if (!deviceId) return NextResponse.json({ error: 'deviceId required' }, { status: 400 });
      return NextResponse.json({ processes: getMockProcesses(deviceId) });

    case 'files': {
      if (!deviceId) return NextResponse.json({ error: 'deviceId required' }, { status: 400 });
      const path = searchParams.get('path') || 'C:\\';
      return NextResponse.json({ files: getMockFiles(deviceId, path) });
    }

    case 'logs': {
      const count = parseInt(searchParams.get('count') || '50');
      return NextResponse.json({ logs: getMockLogs(count) });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  // Verify auth
  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Недействительный токен' }, { status: 401 });
  }

  // Only admins can execute commands
  if (payload.role !== 'admin') {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case 'execute': {
      const { deviceId, command, shell } = body;
      if (!deviceId || !command) {
        return NextResponse.json({ error: 'deviceId and command required' }, { status: 400 });
      }
      // In production, send command to agent via WebSocket
      return NextResponse.json({
        result: {
          id: `cmd-${Date.now()}`,
          deviceId,
          command,
          shell: shell || 'powershell',
          output: `Executed: ${command}`,
          exitCode: 0,
          timestamp: new Date().toISOString(),
          duration: Math.floor(Math.random() * 1000),
        },
      });
    }

    case 'kill_process': {
      const { deviceId: devId, pid } = body;
      if (!devId || !pid) {
        return NextResponse.json({ error: 'deviceId and pid required' }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: `Process ${pid} terminated` });
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
