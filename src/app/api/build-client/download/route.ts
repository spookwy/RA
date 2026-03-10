import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync, createReadStream } from 'fs';
import { join, resolve, basename } from 'path';

function resolveRootDir() {
  const cwd = process.cwd();
  const standaloneServer = join(cwd, 'server.js');
  if (existsSync(standaloneServer) && cwd.endsWith(join('.next', 'standalone'))) {
    return resolve(cwd, '..', '..');
  }
  return cwd;
}

/**
 * GET /api/build-client/download?name=RemoteAgent.exe
 * Streams the built file from the downloads/ directory.
 */
export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get('name');
    if (!name) {
      return NextResponse.json({ error: 'Missing ?name= parameter' }, { status: 400 });
    }

    // Sanitize filename to prevent directory traversal
    const safeName = basename(name);
    if (safeName !== name || safeName.includes('..') || safeName.includes('/') || safeName.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    const rootDir = resolveRootDir();
    const filePath = join(rootDir, 'downloads', safeName);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const stat = statSync(filePath);

    // Use ReadableStream to stream the file without loading it entirely into memory
    const stream = createReadStream(filePath);
    const readable = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: string | Buffer) => {
          controller.enqueue(new Uint8Array(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
        });
        stream.on('end', () => {
          controller.close();
        });
        stream.on('error', (err) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(readable, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Download API]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
