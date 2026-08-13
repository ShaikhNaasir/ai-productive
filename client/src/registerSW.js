// Register the service worker in production only, so dev HMR is never intercepted.
// Exported as a testable function; main.jsx calls it on startup.
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure is non-fatal — the app works without offline support.
    });
  });
}
