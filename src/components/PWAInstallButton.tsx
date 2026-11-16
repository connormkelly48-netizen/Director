import React, { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { usePWAInstall } from '../utils/pwa';
import { Modal } from './ui/Modal';

interface PWAInstallButtonProps {
  variant?: 'menu' | 'sheet';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'menu' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const buttonClass =
    variant === 'sheet'
      ? 'w-full min-h-12 px-4 py-3 rounded-xl bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 text-left text-sm font-bold text-amber-300 flex items-center gap-3 transition-colors cursor-pointer'
      : 'w-full min-h-11 py-3 bg-amber-400/10 hover:bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:text-amber-200 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-between px-4';

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={buttonClass}
      >
        <div className="flex items-center gap-3">
          <Download className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Install App for Offline Play</span>
        </div>
        {variant === 'menu' && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">App</span>
        )}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={buttonClass}
        >
          <div className="flex items-center gap-3">
            <Share className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Install App on iPhone / iPad</span>
          </div>
          {variant === 'menu' && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">iOS</span>
          )}
        </button>

        <Modal
          isOpen={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          maxWidthClass="max-w-sm"
          borderClass="border-amber-400/30"
          ariaLabel="Install The Boardroom on iOS"
          header={
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                Add to Home Screen
              </span>
              <h3 className="text-lg font-extrabold text-white">Install The Boardroom</h3>
            </div>
          }
          footer={
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-11 py-2.5 bg-white/10 hover:bg-white/15 text-xs font-bold text-white rounded-xl cursor-pointer"
            >
              Close
            </button>
          }
        >
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <p>Install The Boardroom on your device to play offline like a native app:</p>
            <ol className="list-decimal list-inside space-y-2 text-slate-200">
              <li>
                Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.
              </li>
              <li>
                Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
              </li>
            </ol>
          </div>
        </Modal>
      </>
    );
  }

  return null;
};
