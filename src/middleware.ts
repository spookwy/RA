import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets — always pass through
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Public static files (images, icons, etc.) — always pass through
  if (pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?|ttf|eot)$/)) {
    return NextResponse.next();
  }

  // License-related paths and API routes are always accessible
  const bypassPaths = ['/activate', '/api/', '/login'];
  if (bypassPaths.some((p) => pathname.startsWith(p))) {
    return addPrivacyHeaders(NextResponse.next());
  }

  // Check license cookie
  const isLicensed = request.cookies.get('license_active')?.value === '1';

  // Not licensed — redirect to login
  if (!isLicensed) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Root → dashboard
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Everything else passes through with privacy headers
  return addPrivacyHeaders(NextResponse.next());
}

/**
 * Add privacy/anonymity headers to protect users from tracking.
 */
function addPrivacyHeaders(response: NextResponse): NextResponse {
  // Prevent browser from sending referrer to external sites
  response.headers.set('Referrer-Policy', 'no-referrer');
  // Block FLoC and other tracking APIs
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  // Remove server identification
  response.headers.delete('X-Powered-By');
  response.headers.delete('Server');
  // Prevent MIME-type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
