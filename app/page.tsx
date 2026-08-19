'use client';

import dynamic from 'next/dynamic';

const SatsetApp = dynamic(() => import('../components/SatsetApp'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#fcf8ff] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-bold text-slate-500">Memuat Tools Satset AI...</span>
      </div>
    </div>
  ),
});

export default function Page() {
  return <SatsetApp />;
}
