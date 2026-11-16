import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-ext-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-ext-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-ext-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-ext-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/plus-jakarta-sans/latin-ext-800.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-ext-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-ext-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-ext-700.css';

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { notifyPWANeedRefresh, notifyPWAOfflineReady } from './utils/pwa';
import { runLineupSelfTest } from './utils/lineup';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.DEV) {
  runLineupSelfTest();
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  try {
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        try {
          const updateSW = registerSW({
            immediate: true,
            onOfflineReady() {
              notifyPWAOfflineReady();
            },
            onNeedRefresh() {
              notifyPWANeedRefresh(updateSW);
            },
            onRegisterError() {
              // Ignore failed SW registration in restricted preview environments
            },
          });
        } catch {
          // Never break gameplay if service worker registration throws synchronously
        }
      })
      .catch(() => {
        // Ignore dynamic import errors in unsupported environments
      });
  } catch {
    // Ignore failed SW registration
  }
}
