'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#fcf8ff] flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Terjadi Kesalahan Sistem</h2>
        <p className="text-xs text-slate-600">
          {error.message || 'Terjadi kesalahan saat memuat aplikasi.'}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center justify-center px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
