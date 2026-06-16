// ==========================================
// NEW FEATURE: BUG REPORT SYSTEM (FIREBASE CLOUD STORAGE)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCitT8cJmVf2ZozFf10RAYAUIjfouYyPvM",
  authDomain: "bw-planner-245ac.firebaseapp.com",
  projectId: "bw-planner-245ac",
  storageBucket: "bw-planner-245ac.firebasestorage.app",
  messagingSenderId: "596167875090",
  appId: "1:596167875090:web:465342815273fb337916cb",
  measurementId: "G-F4G9N1CQ44"
};

// Initialize Firebase
let app, db;
if (typeof firebase !== 'undefined') {
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  // We are skipping Firebase Storage to avoid credit card requirements
} else {
  console.error("Firebase SDK not loaded.");
}

let currentBugAttachment = null;
let isAdminMode = false;

// Persistent unique user ID for bug report ownership
function getBugReportUserId() {
  let uid = localStorage.getItem('bug_report_uid');
  if (!uid) {
    uid = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('bug_report_uid', uid);
  }
  return uid;
}
const bugReportUserId = getBugReportUserId();

// Admin Unlock Function (Called from Console)
window.enableAdminMode = function(password) {
  if (password === 'secret') {
    isAdminMode = true;
    console.log('%cAdmin Mode Unlocked!', 'color: #fb8500; font-size: 16px; font-weight: bold;');
    const adminTab = document.querySelector('.bug-tab-admin');
    if (adminTab) {
      adminTab.style.display = 'block';
      loadAdminBugReports();
      loadAdminStats();
    }
    return true;
  }
  return false;
};

// Modal Controls
window.openBugReportModal = function() {
  const modal = document.getElementById('bug-report-overlay');
  if (modal) {
    modal.style.display = 'flex';
    const adminTab = document.querySelector('.bug-tab-admin');
    if (adminTab) adminTab.style.display = isAdminMode ? 'block' : 'none';
    switchBugTab('submit');
  }
};

window.closeBugReportModal = function() {
  const modal = document.getElementById('bug-report-overlay');
  if (modal) modal.style.display = 'none';
  document.getElementById('bug-title').value = '';
  document.getElementById('bug-description').value = '';
  document.getElementById('bug-submit-status').textContent = '';
  removeBugAttachment();
  
  // Clean up/unsubscribe the active real-time stats listener
  if (window.wpStatsUnsubscribe) {
    window.wpStatsUnsubscribe();
    window.wpStatsUnsubscribe = null;
  }
};

window.switchBugTab = function(tabName) {
  document.querySelectorAll('.bug-tab').forEach(t => t.classList.remove('active'));
  const targetTab = document.querySelector(`.bug-tab[data-bugtab="${tabName}"]`);
  if(targetTab) targetTab.classList.add('active');
  
  document.querySelectorAll('.bug-tab-content').forEach(c => c.style.display = 'none');
  const targetContent = document.getElementById(`bug-tab-${tabName}`);
  if(targetContent) targetContent.style.display = 'block';
  
  // Dynamically widen the bug modal for stats panel
  const bugModal = document.querySelector('.bug-modal');
  if (bugModal) {
    if (tabName === 'admin' && isAdminMode) {
      bugModal.style.maxWidth = '800px';
    } else {
      bugModal.style.maxWidth = '520px';
    }
  }
  
  if (tabName === 'mybugs') loadMyBugReports();
  if (tabName === 'admin' && isAdminMode) {
    loadAdminBugReports();
    loadAdminStats();
  }
};

// Attachment Handling (Compress Image for Firestore)
window.handleBugAttachment = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    alert('Only screenshots/images are supported to keep this free.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1000;
      const MAX_HEIGHT = 1000;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6); // Compress to 60% quality JPEG

      currentBugAttachment = {
        data: compressedDataUrl,
        name: file.name
      };
      
      const attachZone = document.getElementById('bug-attach-zone');
      if(attachZone) attachZone.style.display = 'none';
      const preview = document.getElementById('bug-attach-preview');
      if(preview) preview.style.display = 'flex';
      const nameEl = document.getElementById('bug-attach-name');
      if(nameEl) {
        nameEl.textContent = file.name;
        nameEl.style.whiteSpace = 'nowrap';
        nameEl.style.overflow = 'hidden';
        nameEl.style.textOverflow = 'ellipsis';
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
};

window.removeBugAttachment = function() {
  currentBugAttachment = null;
  const input = document.getElementById('bug-file-input');
  if(input) input.value = '';
  const attachZone = document.getElementById('bug-attach-zone');
  if(attachZone) attachZone.style.display = 'flex';
  const preview = document.getElementById('bug-attach-preview');
  if(preview) preview.style.display = 'none';
};

// Submit Logic
window.submitBugReport = async function() {
  if (!db) {
    alert("Firebase Database not ready yet.");
    return;
  }
  
  const title = document.getElementById('bug-title').value.trim();
  const desc = document.getElementById('bug-description').value.trim();
  const statusEl = document.getElementById('bug-submit-status');
  
  if (!title || !desc) {
    statusEl.innerHTML = '<span class="error">Title and Description are required.</span>';
    return;
  }
  
  statusEl.innerHTML = '<span style="color: #fb8500;">Saving to database...</span>';
  
  const report = {
    timestamp: Date.now(),
    title: title,
    description: desc,
    status: 'ongoing',
    userId: bugReportUserId,
    attachmentDataUrl: currentBugAttachment ? currentBugAttachment.data : null
  };
  
  try {
    await db.collection('reports').add(report);
    statusEl.innerHTML = '<span class="success">Report submitted successfully! Thank you.</span>';
    setTimeout(() => {
      document.getElementById('bug-title').value = '';
      document.getElementById('bug-description').value = '';
      removeBugAttachment();
      statusEl.innerHTML = '';
      switchBugTab('mybugs');
    }, 1500);
  } catch(err) {
    console.error("Firebase Error: ", err);
    statusEl.innerHTML = '<span class="error">Failed to save report. Please check your connection.</span>';
  }
};

// Load Logic — only show the current user's own reports
window.loadMyBugReports = async function() {
  if (!db) return;
  try {
    const snapshot = await db.collection('reports')
      .orderBy('timestamp', 'desc')
      .get();
    
    const ongoingList = document.getElementById('bug-list-ongoing');
    const fixedList = document.getElementById('bug-list-fixed');
    ongoingList.innerHTML = '';
    fixedList.innerHTML = '';
    let ongoingCount = 0; let fixedCount = 0;
    
    snapshot.forEach(doc => {
      const r = doc.data();
      if (r.userId !== bugReportUserId) return; // Client-side filtering
      
      r.id = doc.id;
      const card = createBugCardHTML(r, false);
      if (r.status === 'fixed') {
        fixedList.insertAdjacentHTML('beforeend', card);
        fixedCount++;
      } else {
        ongoingList.insertAdjacentHTML('beforeend', card);
        ongoingCount++;
      }
    });
    
    if (ongoingCount === 0) ongoingList.innerHTML = '<div class="bug-empty">No ongoing reports.</div>';
    if (fixedCount === 0) fixedList.innerHTML = '<div class="bug-empty">No fixed reports.</div>';
  } catch(err) { console.error("Error loading bugs: ", err); }
};

// Admin Load Logic
window.loadAdminBugReports = async function() {
  if (!db || !isAdminMode) return;
  try {
    const snapshot = await db.collection('reports').orderBy('timestamp', 'desc').get();
    
    const ongoingList = document.getElementById('bug-admin-ongoing');
    const fixedList = document.getElementById('bug-admin-fixed');
    ongoingList.innerHTML = '';
    fixedList.innerHTML = '';
    let ongoingCount = 0; let fixedCount = 0;
    
    snapshot.forEach(doc => {
      const r = doc.data();
      r.id = doc.id;
      const card = createBugCardHTML(r, true);
      if (r.status === 'fixed') {
        fixedList.insertAdjacentHTML('beforeend', card);
        fixedCount++;
      } else {
        ongoingList.insertAdjacentHTML('beforeend', card);
        ongoingCount++;
      }
    });
    
    if (ongoingCount === 0) ongoingList.innerHTML = '<div class="bug-empty">No pending reports.</div>';
    if (fixedCount === 0) fixedList.innerHTML = '<div class="bug-empty">No fixed reports.</div>';
  } catch(err) { console.error("Error loading admin bugs: ", err); }
};

function createBugCardHTML(report, forAdmin) {
  const dateStr = new Date(report.timestamp).toLocaleString();
  let attachHtml = '';
  
  if (report.attachmentDataUrl) {
    attachHtml = `<div class="bug-card-attachment"><img src="${report.attachmentDataUrl}" alt="Bug screenshot"></div>`;
  }

  let actionsHtml = '';
  if (forAdmin) {
    actionsHtml = `<div class="bug-card-actions">`;
    if (report.status === 'ongoing') {
      actionsHtml += `<button class="bug-action-btn bug-action-fix" onclick="adminFixBug('${report.id}')">Mark Fixed</button>`;
    } else {
      actionsHtml += `<button class="bug-action-btn bug-action-fix" onclick="adminUnfixBug('${report.id}')">Unmark Fixed</button>`;
    }
    actionsHtml += `<button class="bug-action-btn bug-action-delete" onclick="adminDeleteBug('${report.id}')">Delete</button></div>`;
  } else if (report.status === 'ongoing') {
    actionsHtml = `<div class="bug-card-actions">
      <button class="bug-action-btn bug-action-delete" onclick="adminDeleteBug('${report.id}')">Withdraw Report</button>
    </div>`;
  }

  const statusClass = (report.status === 'fixed') ? 'bug-card-fixed' : '';

  return `
    <div class="bug-card ${statusClass}" id="bug-card-${report.id}">
      <div class="bug-card-header">
        <span class="bug-card-title">${report.title}</span>
        <span class="bug-card-date">${dateStr}</span>
      </div>
      <div class="bug-card-desc">${report.description.replace(/\n/g, '<br>')}</div>
      ${attachHtml}
      ${actionsHtml}
    </div>
  `;
}

// Admin Actions
window.adminFixBug = async function(id) {
  if (!db) return;
  try {
    await db.collection('reports').doc(id).update({ status: 'fixed' });
    setTimeout(() => loadAdminBugReports(), 100);
  } catch(err) { console.error("Error fixing bug: ", err); }
};

window.adminUnfixBug = async function(id) {
  if (!db) return;
  try {
    await db.collection('reports').doc(id).update({ status: 'ongoing' });
    setTimeout(() => loadAdminBugReports(), 100);
  } catch(err) { console.error("Error unfixing bug: ", err); }
};

window.adminDeleteBug = async function(id) {
  if (!db) return;
  if (!confirm("Are you sure you want to delete this report?")) return;
  
  try {
    await db.collection('reports').doc(id).delete();
    const adminTab = document.querySelector('.bug-tab-admin');
    if (adminTab && adminTab.classList.contains('active')) {
      loadAdminBugReports();
    } else {
      loadMyBugReports();
    }
  } catch(err) { console.error("Error deleting bug: ", err); }
};

// ==========================================
// NEW FEATURE: PRELOAD BLOCKS LOGIC
// ==========================================
function preloadAllBlocks() {
  console.log("Starting early pre-fetch of block assets...");
  fetch('worldplanner/blocks_manifest.json')
    .then(r => r.json())
    .then(data => {
      const manifestCategories = data.manifest.categories;
      const themeList = data.manifest.themes;
      const imagesToLoad = [];
      
      // Load blocks
      manifestCategories.forEach(cat => {
        Object.values(cat.blocks).forEach(blk => {
          if (blk.src) imagesToLoad.push(blk.src);
          // Only check first frame to save bandwidth/connections
          if (blk.framesPath && blk.frameCount > 0) {
             imagesToLoad.push(`${blk.framesPath}${blk.frameStart || 0}.png`);
          }
        });
      });
      
      // Load theme backgrounds
      if (themeList) {
        themeList.forEach(t => {
          if (t.src) imagesToLoad.push(t.src);
        });
      }
      
      // Create off-screen image elements to force browser cache
      imagesToLoad.forEach(src => {
        const img = new Image();
        img.src = src;
      });
      console.log(`Pre-fetching ${imagesToLoad.length} assets.`);
    })
    .catch(e => console.warn("Background preloading failed (will load when World Planner opens)", e));
}

// Start preloading immediately on load
window.addEventListener('load', () => {
  preloadAllBlocks();
});

// ==========================================
// NEW FEATURE: ADMIN LIVE CLICK COUNTER & STATS
// ==========================================
window.logModeClick = async function(mode) {
  if (!db) return;
  try {
    const uid = bugReportUserId;
    const savedPlayerOpts = JSON.parse(localStorage.getItem('playerOptions') || '{}');
    const username = savedPlayerOpts.name || 'Anonymous';
    
    // Log individual click activity
    await db.collection('click_activity').add({
      uid: uid,
      username: username,
      mode: mode,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Increment aggregate stats doc
    await db.collection('stats').doc('mode_clicks').set({
      [mode]: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  } catch (err) {
    console.error("Failed to log mode click:", err);
  }
};

window.adminStatsSelectedDays = 7;
window.adminStatsHiddenModes = new Set();

window.loadAdminStats = async function(days = 7) {
  if (!db || !isAdminMode) return;
  window.adminStatsSelectedDays = days;
  const statsCard = document.getElementById('bug-admin-stats-card');
  if (!statsCard) return;

  statsCard.innerHTML = `<div class="bug-stats-loader">Loading live activity & charts...</div>`;

  try {
    // 1. Fetch total visits from CounterAPI
    let totalVisits = 0;
    try {
      const response = await fetch('https://api.counterapi.dev/v1/breaworlds-set-planner/visits');
      const data = await response.json();
      if (data && typeof data.count === 'number') {
        totalVisits = data.count;
      } else if (data && typeof data.value === 'number') {
        totalVisits = data.value;
      }
    } catch (e) {
      console.warn("Failed to fetch CounterAPI:", e);
    }

    // 2. Fetch tracked counts from Firestore stats/mode_clicks
    let trackedCounts = {
      visit: 0,
      set: 0,
      world: 0,
      fish: 0,
      thumbnail: 0
    };
    try {
      const statsDoc = await db.collection('stats').doc('mode_clicks').get();
      if (statsDoc.exists) {
        const data = statsDoc.data();
        if (data) {
          trackedCounts.visit = data.visit || 0;
          trackedCounts.set = data.set || 0;
          trackedCounts.world = data.world || 0;
          trackedCounts.fish = data.fish || 0;
          trackedCounts.thumbnail = data.thumbnail || 0;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch Firestore stats doc:", e);
    }

    // 3. Fetch historical data from Firestore (last N days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0,0,0,0);

    const historicalSnapshot = await db.collection('click_activity')
      .where('timestamp', '>=', startDate)
      .orderBy('timestamp', 'asc')
      .get();
      
    window.adminHistoricalSnapshot = historicalSnapshot;

    // 4. Setup real-time listener for recent click activity
    if (window.wpStatsUnsubscribe) window.wpStatsUnsubscribe();

    window.wpStatsUnsubscribe = db.collection('click_activity')
      .orderBy('timestamp', 'desc')
      .limit(15)
      .onSnapshot(liveSnapshot => {
        renderStatsUI(totalVisits, trackedCounts, liveSnapshot, window.adminHistoricalSnapshot, days);
      }, err => {
        console.error("Stats listener failed:", err);
      });

  } catch (err) {
    console.error("Error loading stats:", err);
    statsCard.innerHTML = `<div class="bug-stats-error">Failed to load stats dashboard.</div>`;
  }
};

function renderStatsUI(totalVisits, trackedCounts, liveSnapshot, historicalSnapshot, days) {
  const statsCard = document.getElementById('bug-admin-stats-card');
  if (!statsCard) return;

  const totalVisitsCount = Math.max(totalVisits, trackedCounts.visit);

  // Group historical data by date
  const datesArray = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    datesArray.push(d.toLocaleDateString([], { month: '2-digit', day: '2-digit' }));
  }

  const statsData = {};
  datesArray.forEach(date => {
    statsData[date] = { visit: 0, set: 0, world: 0, fish: 0, thumbnail: 0 };
  });

  if (historicalSnapshot && !historicalSnapshot.empty) {
    historicalSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.timestamp && data.mode) {
        const dateObj = typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate() : new Date(data.timestamp.seconds * 1000);
        const dateStr = dateObj.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
        if (statsData[dateStr] && statsData[dateStr][data.mode] !== undefined) {
          statsData[dateStr][data.mode]++;
        }
      }
    });
  }

  // Calculate max value for chart scaling
  let maxVal = 0;
  datesArray.forEach(date => {
    const d = statsData[date];
    maxVal = Math.max(maxVal, d.visit, d.set, d.world, d.fish, d.thumbnail);
  });
  if (maxVal === 0) maxVal = 10;
  const step = Math.max(1, Math.ceil(maxVal / 4));
  maxVal = step * 4;

  // Build SVG Grid Lines
  let gridHtml = '';
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4;
    const y = 20 + 170 - ratio * 170;
    const labelVal = Math.round(ratio * maxVal);
    gridHtml += `
      <line x1="40" y1="${y}" x2="720" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4" />
      <text x="32" y="${y + 3}" fill="rgba(255,255,255,0.4)" font-size="9" font-family="monospace" text-anchor="end">${labelVal}</text>
    `;
  }

  // Build SVG X-Axis labels
  let xAxisHtml = '';
  datesArray.forEach((date, index) => {
    const x = 40 + (index / (datesArray.length - 1)) * 680;
    xAxisHtml += `
      <text x="${x}" y="212" fill="rgba(255,255,255,0.4)" font-size="9" font-family="monospace" text-anchor="middle">${date}</text>
      <line x1="${x}" y1="20" x2="${x}" y2="190" stroke="rgba(255,255,255,0.02)" />
    `;
  });

  // Build Lines & Dots
  const modes = ['visit', 'set', 'world', 'fish', 'thumbnail'];
  const colors = {
    visit: '#4a90e2',
    set: '#fe0065',
    world: '#4ECDC4',
    fish: '#FFE66D',
    thumbnail: '#A78BFA'
  };

  let pathsHtml = '';
  let dotsHtml = '';

  modes.forEach(mode => {
    const modeColor = colors[mode];
    let pathD = '';
    
    datesArray.forEach((date, index) => {
      const val = statsData[date][mode];
      const x = 40 + (index / (datesArray.length - 1)) * 680;
      const y = 20 + 170 - (val / maxVal) * 170;
      
      if (index === 0) {
        pathD += `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
      }
      
      dotsHtml += `
        <circle cx="${x}" cy="${y}" r="4" fill="${modeColor}" stroke="rgba(10,10,26,0.95)" stroke-width="1.5" class="chart-dot mode-${mode}" data-mode="${mode}" data-date="${date}" data-val="${val}" style="cursor: pointer; transition: r 0.1s;" />
      `;
    });
    
    pathsHtml += `
      <path d="${pathD}" fill="none" stroke="${modeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chart-path mode-${mode}" style="opacity: 0.85; transition: opacity 0.2s;" />
    `;
  });

  // Build activity feed HTML
  let activityHtml = '';
  if (liveSnapshot.empty) {
    activityHtml = `<div class="bug-stats-empty-activity">No click activity logged yet.</div>`;
  } else {
    liveSnapshot.forEach(doc => {
      const data = doc.data();
      let time = 'Just now';
      if (data.timestamp) {
        const dateObj = typeof data.timestamp.toDate === 'function' ? data.timestamp.toDate() : new Date(data.timestamp.seconds * 1000);
        time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      const modeLabels = {
        visit: 'Page Visit',
        set: 'Set Planner',
        world: 'World Planner',
        fish: 'Fish Calc',
        thumbnail: 'Thumb Maker'
      };
      const modeLabel = modeLabels[data.mode] || data.mode;
      const modeClass = `bug-badge-${data.mode}`;
      
      activityHtml += `
        <div class="bug-activity-row">
          <span class="bug-activity-time">${time}</span>
          <span class="bug-activity-user" title="${data.uid}">${data.username}</span>
          <span class="bug-activity-badge ${modeClass}">${modeLabel}</span>
        </div>
      `;
    });
  }

  statsCard.innerHTML = `
    <div class="bug-admin-chart-container">
      <div class="bug-chart-header">
        <div class="bug-chart-title">
          <i data-lucide="trending-up" style="width:14px;height:14px;color:#fb8500;"></i>
          <span>Usage Statistics (Last ${days} Days)</span>
        </div>
        <div class="bug-chart-controls">
          <div class="bug-chart-legend">
            <span class="legend-item" data-mode="visit"><span class="legend-color-dot legend-color-visit"></span>Visits</span>
            <span class="legend-item" data-mode="set"><span class="legend-color-dot legend-color-set"></span>Sets</span>
            <span class="legend-item" data-mode="world"><span class="legend-color-dot legend-color-world"></span>Worlds</span>
            <span class="legend-item" data-mode="fish"><span class="legend-color-dot legend-color-fish"></span>Fish</span>
            <span class="legend-item" data-mode="thumbnail"><span class="legend-color-dot legend-color-thumbnail"></span>Thumbs</span>
          </div>
          <div class="bug-chart-toggles">
            <button class="bug-chart-toggle-btn ${days === 7 ? 'active' : ''}" onclick="loadAdminStats(7)">7D</button>
            <button class="bug-chart-toggle-btn ${days === 14 ? 'active' : ''}" onclick="loadAdminStats(14)">14D</button>
          </div>
        </div>
      </div>
      
      <svg id="admin-stats-svg" viewBox="0 0 740 220" width="100%" height="220" style="overflow: visible;">
        ${gridHtml}
        ${xAxisHtml}
        ${pathsHtml}
        <line id="chart-guide-line" x1="0" y1="20" x2="0" y2="190" stroke="rgba(255,255,255,0.15)" stroke-dasharray="2" style="display: none;" />
        ${dotsHtml}
      </svg>
      <div id="chart-tooltip" class="chart-tooltip"></div>
    </div>

    <div class="bug-stats-dashboard">
      <div class="bug-stats-grid">
        <div class="bug-stat-box">
          <div class="bug-stat-title">Set Planner</div>
          <div class="bug-stat-val">${trackedCounts.set.toLocaleString()}</div>
          <div class="bug-stat-sub">Lifetime clicks</div>
        </div>
        <div class="bug-stat-box">
          <div class="bug-stat-title">World Planner</div>
          <div class="bug-stat-val">${trackedCounts.world.toLocaleString()}</div>
          <div class="bug-stat-sub">Lifetime clicks</div>
        </div>
        <div class="bug-stat-box">
          <div class="bug-stat-title">Fish Calculator</div>
          <div class="bug-stat-val">${trackedCounts.fish.toLocaleString()}</div>
          <div class="bug-stat-sub">Lifetime clicks</div>
        </div>
        <div class="bug-stat-box">
          <div class="bug-stat-title">Thumbnail Maker</div>
          <div class="bug-stat-val">${trackedCounts.thumbnail.toLocaleString()}</div>
          <div class="bug-stat-sub">Lifetime clicks</div>
        </div>
        <div class="bug-stat-box bug-stat-box-total" style="grid-column: span 2;">
          <div class="bug-stat-title">Total Site Visits</div>
          <div class="bug-stat-val">${totalVisitsCount.toLocaleString()}</div>
          <div class="bug-stat-sub">Firestore: ${trackedCounts.visit.toLocaleString()} | CounterAPI: ${totalVisits.toLocaleString()}</div>
        </div>
        <div class="bug-stat-box bug-stat-box-action" style="grid-column: span 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 12px;">
          <button id="admin-force-reload-btn" onclick="triggerForcedRefresh()" style="background: rgba(220, 53, 69, 0.2); border: 1px solid #dc3545; color: #dc3545; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-family: 'Russo One', sans-serif; font-size: 13px; transition: all 0.2s ease; width: 100%;">
            🔄 Force Update (Reload All Clients)
          </button>
          <div class="bug-stat-sub" style="font-size: 10px; color: rgba(255,255,255,0.4);">Triggers a hard refresh on all open tabs.</div>
        </div>
      </div>
      <div class="bug-stats-feed">
        <div class="bug-feed-title">Recent Live Clicks</div>
        <div class="bug-feed-list">${activityHtml}</div>
      </div>
    </div>
  `;

  initChartListeners(datesArray, statsData, modes, colors);
  if (window.lucide) window.lucide.createIcons();
}

function initChartListeners(datesArray, statsData, modes, colors) {
  const svg = document.getElementById('admin-stats-svg');
  if (!svg) return;

  const chartWidth = 680;
  const paddingLeft = 40;
  const hiddenModes = window.adminStatsHiddenModes || new Set();

  hiddenModes.forEach(mode => {
    const path = svg.querySelectorAll(`.chart-path.mode-${mode}`);
    const dots = svg.querySelectorAll(`.chart-dot.mode-${mode}`);
    path.forEach(p => p.style.opacity = '0');
    dots.forEach(d => {
      d.style.opacity = '0';
      d.style.pointerEvents = 'none';
    });
    const legendItem = document.querySelector(`.legend-item[data-mode="${mode}"]`);
    if (legendItem) legendItem.classList.add('hidden');
  });

  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const chartX = mouseX * (740 / rect.width);
    
    let closestIndex = 0;
    let minDiff = Infinity;
    
    datesArray.forEach((date, index) => {
      const x = paddingLeft + (index / (datesArray.length - 1)) * chartWidth;
      const diff = Math.abs(chartX - x);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    
    const targetDate = datesArray[closestIndex];
    const targetData = statsData[targetDate];
    const x = paddingLeft + (closestIndex / (datesArray.length - 1)) * chartWidth;
    
    const guide = document.getElementById('chart-guide-line');
    if (guide) {
      guide.setAttribute('x1', x);
      guide.setAttribute('x2', x);
      guide.style.display = 'block';
    }
    
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) {
      tooltip.style.display = 'block';
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = e.clientX + 15;
      let top = e.clientY + 15;
      if (left + 160 > window.innerWidth) {
        left = e.clientX - tooltipRect.width - 15;
      }
      if (top + 140 > window.innerHeight) {
        top = e.clientY - tooltipRect.height - 15;
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      
      const modeLabels = {
        visit: 'Site Visits',
        set: 'Set Planner',
        world: 'World Planner',
        fish: 'Fish Calc',
        thumbnail: 'Thumb Maker'
      };
      
      tooltip.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 6px; color: #fb8500; font-size: 11px; font-family: sans-serif;">Date: ${targetDate}</div>
        <div style="display:flex; flex-direction:column; gap:4px; font-family: monospace;">
          ${modes.map(mode => {
            const isHidden = hiddenModes.has(mode);
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; font-size:10px; opacity: ${isHidden ? '0.35' : '1'};">
                <span style="display:flex; align-items:center; gap:5px; color:rgba(255,255,255,0.7);">
                  <span style="width:6px; height:6px; background:${colors[mode]}; border-radius:50%;"></span>
                  ${modeLabels[mode]}
                </span>
                <span style="font-weight:bold; color:#fff;">${targetData[mode]}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  });
  
  svg.addEventListener('mouseleave', () => {
    const guide = document.getElementById('chart-guide-line');
    if (guide) guide.style.display = 'none';
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  });

  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const mode = item.getAttribute('data-mode');
      const path = svg.querySelectorAll(`.chart-path.mode-${mode}`);
      const dots = svg.querySelectorAll(`.chart-dot.mode-${mode}`);
      
      if (hiddenModes.has(mode)) {
        hiddenModes.delete(mode);
        item.classList.remove('hidden');
        path.forEach(p => p.style.opacity = '0.85');
        dots.forEach(d => {
          d.style.opacity = '1';
          d.style.pointerEvents = 'auto';
        });
      } else {
        hiddenModes.add(mode);
        item.classList.add('hidden');
        path.forEach(p => p.style.opacity = '0');
        dots.forEach(d => {
          d.style.opacity = '0';
          d.style.pointerEvents = 'none';
        });
      }
      window.adminStatsHiddenModes = hiddenModes;
    });
  });
}

window.triggerForcedRefresh = async function() {
  if (!db || !isAdminMode) return;
  const btn = document.getElementById('admin-force-reload-btn');
  if (!btn) return;
  
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = "⏳ Pushing update...";
  
  try {
    const newVersion = "version_" + Date.now();
    await db.collection('stats').doc('version').set({ latestVersion: newVersion });
    btn.innerText = "✅ Force-reload triggered!";
    btn.style.borderColor = "#28a745";
    btn.style.color = "#28a745";
    btn.style.background = "rgba(40, 167, 69, 0.2)";
    setTimeout(() => {
      btn.disabled = false;
      btn.innerText = originalText;
      btn.style.borderColor = "#dc3545";
      btn.style.color = "#dc3545";
      btn.style.background = "rgba(220, 53, 69, 0.2)";
    }, 2500);
  } catch (err) {
    console.error("Failed to push reload trigger:", err);
    btn.innerText = "❌ Failed to push update";
    setTimeout(() => {
      btn.disabled = false;
      btn.innerText = originalText;
    }, 2500);
  }
};



// ==========================================
// AUTO-LOG VISITOR CLICK ONCE PER SESSION
// ==========================================
if (typeof db !== 'undefined' && db && !sessionStorage.getItem('counted_visit_firestore')) {
  window.logModeClick('visit')
    .then(() => {
      sessionStorage.setItem('counted_visit_firestore', 'true');
    })
    .catch((err) => {
      console.warn("Failed to log visit to firestore:", err);
    });
}

// ==========================================
// VIDEO GUIDE MODAL CONTROLLERS
// ==========================================
window.openVideoModal = function() {
  const overlay = document.getElementById('video-guide-overlay');
  if (!overlay) return;
  
  if (window.logModeClick) {
    window.logModeClick('guide').catch(() => {});
  }
  
  const container = overlay.querySelector('.video-container');
  if (container) {
    container.innerHTML = `<iframe src="https://www.youtube.com/embed/YYQwq1Yr4fs" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
  
  overlay.style.display = 'flex';
  if (window.lucide) {
    window.lucide.createIcons();
  }
};

window.closeVideoModal = function() {
  const overlay = document.getElementById('video-guide-overlay');
  if (!overlay) return;
  
  overlay.style.display = 'none';
  const container = overlay.querySelector('.video-container');
  if (container) {
    container.innerHTML = '';
  }
};
