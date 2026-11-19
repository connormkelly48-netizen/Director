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

interface PWAInstallState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  isIOS: boolean;
}

const getInitialStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
};

const getIsIOSDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
};

let installState: PWAInstallState = {
  deferredPrompt: null,
  isInstalled: getInitialStandalone(),
  isIOS: getIsIOSDevice(),
};

const installListeners = new Set<(state: PWAInstallState) => void>();

function emitInstallState() {
  const snapshot = { ...installState };
  for (const listener of installListeners) {
    listener(snapshot);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    installState = {
      ...installState,
      deferredPrompt: e as BeforeInstallPromptEvent,
    };
    emitInstallState();
  });

  window.addEventListener('appinstalled', () => {
    installState = {
      ...installState,
      isInstalled: true,
      deferredPrompt: null,
    };
    emitInstallState();
  });

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  const onDisplayModeChange = (e: MediaQueryListEvent) => {
    if (e.matches && !installState.isInstalled) {
      installState = { ...installState, isInstalled: true, deferredPrompt: null };
      emitInstallState();
    }
  };
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onDisplayModeChange);
  }
}

export function usePWAInstall() {
  const [state, setState] = useState<PWAInstallState>(() => ({ ...installState }));

  useEffect(() => {
    setState({ ...installState });
    installListeners.add(setState);
    return () => {
      installListeners.delete(setState);
    };
  }, []);

  const install = async () => {
    const promptEvent = installState.deferredPrompt;
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      installState = {
        ...installState,
        isInstalled: true,
        deferredPrompt: null,
      };
      emitInstallState();
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(state.deferredPrompt),
    isInstalled: state.isInstalled,
    isIOS: state.isIOS,
    install,
  };
}
