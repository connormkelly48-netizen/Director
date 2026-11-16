import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type UpdateSWFn = (reloadPage?: boolean) => Promise<void>;

interface PWAUpdateState {
  offlineReady: boolean;
  needRefresh: boolean;
}

let pwaState: PWAUpdateState = {
  offlineReady: false,
  needRefresh: false,
};

let updateSWCallback: UpdateSWFn | null = null;
const pwaListeners = new Set<(state: PWAUpdateState) => void>();

function emitPWAState() {
  const snapshot = { ...pwaState };
  for (const listener of pwaListeners) {
    listener(snapshot);
  }
}

export function notifyPWAOfflineReady() {
  pwaState = { ...pwaState, offlineReady: true };
  emitPWAState();
}

export function notifyPWANeedRefresh(updateSW: UpdateSWFn) {
  updateSWCallback = updateSW;
  pwaState = { ...pwaState, needRefresh: true };
  emitPWAState();
}

export function dismissPWAOfflineReady() {
  pwaState = { ...pwaState, offlineReady: false };
  emitPWAState();
}

export function applyPWAUpdate() {
  const fn = updateSWCallback;
  pwaState = { ...pwaState, needRefresh: false };
  emitPWAState();
  if (fn) {
    void fn(true);
  } else {
    window.location.reload();
  }
}

export function usePWAUpdates() {
  const [state, setState] = useState<PWAUpdateState>(() => ({ ...pwaState }));

  useEffect(() => {
    setState({ ...pwaState });
    pwaListeners.add(setState);
    return () => {
      pwaListeners.delete(setState);
    };
  }, []);

  return {
    offlineReady: state.offlineReady,
    needRefresh: state.needRefresh,
    dismissOfflineReady: dismissPWAOfflineReady,
    applyUpdate: applyPWAUpdate,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}
