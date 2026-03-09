import { NextResponse } from 'next/server';

/**
 * GET /api/ws-url
 * Returns the WebSocket server URL for the dashboard to connect to.
 * When accessed via Cloudflare tunnel, the WS URL is a different tunnel hostname,
 * not hostname:3001. The launcher passes WS_SERVER_URL to the Next.js process env.
 */
export async function GET() {
  const wsUrl = process.env.WS_SERVER_URL || null;
  return NextResponse.json({ url: wsUrl });
}
