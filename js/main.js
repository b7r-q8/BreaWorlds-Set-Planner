// main.js - Application bootloader and Service Worker registration
console.log("🚀 BreaWorlds Tools: Core modules loaded successfully.");

// Register Progressive Web App Service Worker for Offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(registration => {
        console.log('✅ ServiceWorker registered successfully with scope: ', registration.scope);
      })
      .catch(err => {
        console.error('❌ ServiceWorker registration failed: ', err);
      });
  });
}
