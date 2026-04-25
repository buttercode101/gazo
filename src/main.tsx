import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/geist';
import App from './App.tsx';
import './index.css';

const updateServiceWorker = registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new CustomEvent('tankup:pwa-offline-ready'));
  },
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('tankup:pwa-update-ready'));
  },
});

(window as Window & { __tankupTriggerSwUpdate?: (reloadPage?: boolean) => Promise<void> }).__tankupTriggerSwUpdate =
  updateServiceWorker;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
