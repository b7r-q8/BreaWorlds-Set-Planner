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
};

window.switchBugTab = function(tabName) {
  document.querySelectorAll('.bug-tab').forEach(t => t.classList.remove('active'));
  const targetTab = document.querySelector(`.bug-tab[data-bugtab="${tabName}"]`);
  if(targetTab) targetTab.classList.add('active');
  
  document.querySelectorAll('.bug-tab-content').forEach(c => c.style.display = 'none');
  const targetContent = document.getElementById(`bug-tab-${tabName}`);
  if(targetContent) targetContent.style.display = 'block';
  
  if (tabName === 'mybugs') loadMyBugReports();
  if (tabName === 'admin' && isAdminMode) loadAdminBugReports();
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
