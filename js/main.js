// main.js - Application bootloader and Service Worker registration
console.log("🚀 BreaWorlds Tools: Core modules loaded successfully.");

const APP_VERSION = "3.15.2"; // Increment this when making updates!

// Register Progressive Web App Service Worker for Offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(registration => {
        console.log('✅ ServiceWorker registered successfully with scope: ', registration.scope);
        
        // Listen for updates to the service worker
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('✨ New update available! Reloading...');
                window.location.reload(true);
              }
            });
          }
        });

        // Periodically check for service worker updates (every 60s)
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60000);
      })
      .catch(err => {
        console.error('❌ ServiceWorker registration failed: ', err);
      });
  });
  
  // Reload when the active service worker changes
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload(true);
    }
  });
}

// ============================================================
// FORCE-RELOAD SYSTEM (3 layers of reliability)
// ============================================================
// Layer 1: Firestore real-time listener (instant, but can be blocked)
// Layer 2: Firestore polling every 30s (fallback if listener fails)
// Layer 3: Service Worker update check every 60s (above)
// ============================================================

let _versionReloadTriggered = false; // Prevent double-reload

function doForceReload(newVersion) {
  if (_versionReloadTriggered) return;
  _versionReloadTriggered = true;
  console.log(`🔄 Force-reload triggered! Server version: ${newVersion}`);
  localStorage.setItem('last_forced_refresh_id', newVersion);
  
  // Clear the service worker cache before reloading
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  
  setTimeout(() => {
    window.location.reload(true);
  }, 300);
}

function shouldReload(latestVersion) {
  if (!latestVersion) return false;
  if (latestVersion === APP_VERSION) return false;
  const lastRefreshed = localStorage.getItem('last_forced_refresh_id');
  if (latestVersion === lastRefreshed) return false;
  return true;
}

// Layer 1: Real-time Firestore listener (fires instantly when admin pushes update)
function setupRealtimeVersionListener() {
  if (typeof db === 'undefined') return false;
  
  try {
    db.collection('stats').doc('version').onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (shouldReload(data.latestVersion)) {
          doForceReload(data.latestVersion);
        }
      } else {
        db.collection('stats').doc('version').set({ latestVersion: APP_VERSION }).catch(() => {});
      }
    }, (err) => {
      console.warn("⚠️ Real-time version listener failed (ad-blocker?). Polling fallback active.", err.message || err);
    });
    return true;
  } catch (e) {
    return false;
  }
}

// Layer 2: Polling fallback — checks Firestore every 30 seconds via .get()
function startVersionPolling() {
  if (typeof db === 'undefined') return;
  
  setInterval(() => {
    if (_versionReloadTriggered) return;
    db.collection('stats').doc('version').get({ source: 'server' })
      .then(doc => {
        if (doc.exists) {
          const data = doc.data();
          if (shouldReload(data.latestVersion)) {
            doForceReload(data.latestVersion);
          }
        }
      })
      .catch(() => {
        // Silently fail — network/ad-blocker issue
      });
  }, 30000);
}

// Boot version enforcement after Firebase is ready
function bootVersionEnforcement() {
  if (typeof db === 'undefined') {
    setTimeout(bootVersionEnforcement, 500);
    return;
  }
  
  // Initial one-shot check immediately on page load
  db.collection('stats').doc('version').get()
    .then(doc => {
      if (doc.exists) {
        const data = doc.data();
        if (shouldReload(data.latestVersion)) {
          doForceReload(data.latestVersion);
        }
      }
    })
    .catch(() => {});
  
  // Start real-time listener
  setupRealtimeVersionListener();
  
  // Start polling fallback
  startVersionPolling();
  
  console.log(`📡 Version enforcement active (v${APP_VERSION})`);
}

bootVersionEnforcement();

