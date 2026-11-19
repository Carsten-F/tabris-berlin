// Install as app (PWA) + service worker registration
let deferredPrompt = null;
const listeners = new Set();

export function initInstall() {
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; listeners.forEach((fn) => fn()); });
}

export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPrompt = () => !!deferredPrompt;

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
  return choice && choice.outcome === 'accepted';
}
