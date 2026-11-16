import React from 'react';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { usePWAUpdates } from '../utils/pwa';

interface PWAStatusToastProps {
  hasBottomNav?: boolean;
}

export const PWAStatusToast: React.FC<PWAStatusToastProps> = ({ hasBottomNav = false }) => {
  const { offlineReady, needRefresh, dismissOfflineReady, applyUpdate } = usePWAUpdates();

  if (!offlineReady && !needRefresh) {
    return null;
  }

  const bottomOffsetClass = hasBottomNav ? 'bottom-20 lg:bottom-4' : 'bottom-4';

  return (
    <div
      className={`fixed ${bottomOffsetClass} left-3 right-3 sm:left-4 sm:right-auto sm:max-w-sm z-50 flex flex-col gap-2 pointer-events-none`}
    >
      {needRefresh && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto bg-[#111827] border border-amber-400/40 text-slate-100 rounded-xl p-2 shadow-2xl flex items-center justify-between gap-2 text-xs"
        >
          <button
            type="button"
            onClick={applyUpdate}
            className="flex-1 min-h-10 lg:min-h-0 px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-left font-semibold text-amber-300 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
            <span>New version available. Tap to update</span>
          </button>
        </div>
      )}

      {offlineReady && !needRefresh && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto bg-[#111827] border border-emerald-500/35 text-slate-100 rounded-xl px-3.5 py-2.5 shadow-2xl flex items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-2 font-medium text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Ready for offline play</span>
          </div>
          <button
            type="button"
            onClick={dismissOfflineReady}
            aria-label="Dismiss offline ready notice"
            className="min-h-9 min-w-9 lg:min-h-0 lg:min-w-0 p-1 rounded-lg text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
