'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ActivatePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-6 w-6 text-zinc-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <div className="text-zinc-500 text-sm">Переход на страницу входа...</div>
      </div>
    </div>
  );
}
