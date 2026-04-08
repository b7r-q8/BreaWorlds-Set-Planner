import re
import os

target_file = 'script.js'

with open(target_file, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "// ==========================================\n// NEW FEATURE: BUG REPORT SYSTEM (INDEXED DB)\n// =========================================="
end_marker = "// ==========================================\n// NEW FEATURE: PRELOAD BLOCKS LOGIC\n// =========================================="

if start_marker in content and end_marker in content:
    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    
    new_code = """// ==========================================
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
let app, db, storage;
if (typeof firebase !== 'undefined') {
  app = firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  storage = firebase.storage();
} else {
  console.error("Firebase SDK not loaded.");
}

let currentBugAttachment = null;
let isAdminMode = false;

// Admin Unlock Function (Called from Console)
window.enableAdminMode = function(password) {
  if (password === 'secret') {
    isAdminMode = true;
    console.log('%cAdmin Mode Unlocked!', 'color: #fb8500; font-size: 16px; font-weight: bold;');
    
    // Automatically show admin tab if modal is open
    const adminTab = document.querySelector('.bug-tab-admin');
    if (adminTab) {
      adminTab.style.display = 'block';
      // Load admin data immediately to populate it
      loadAdminBugReports();
    }
    return true;
  }
  console.log('Invalid password.');
  return false;
};

// Modal Controls
window.openBugReportModal = function() {
  const modal = document.getElementById('bug-report-overlay');
  if (modal) {
    modal.style.display = 'flex';
    // Show admin tab if unlocked
    const adminTab = document.querySelector('.bug-tab-admin');
    if (adminTab) adminTab.style.display = isAdminMode ? 'block' : 'none';
    
    switchBugTab('submit');
  }
};

window.closeBugReportModal = function() {
  const modal = document.getElementById('bug-report-overlay');
  if (modal) modal.style.display = 'none';
  // Reset form
  document.getElementById('bug-title').value = '';
  document.getElementById('bug-description').value = '';
  document.getElementById('bug-submit-status').textContent = '';
  removeBugAttachment();
};

window.switchBugTab = function(tabName) {
  // Update Tab Styling
  document.querySelectorAll('.bug-tab').forEach(t => t.classList.remove('active'));
  const targetTab = document.querySelector(`.bug-tab[data-bugtab="${tabName}"]`);
  if(targetTab) targetTab.classList.add('active');
  
  // Update Content
  document.querySelectorAll('.bug-tab-content').forEach(c => c.style.display = 'none');
  const targetContent = document.getElementById(`bug-tab-${tabName}`);
  if(targetContent) targetContent.style.display = 'block';
  
  if (tabName === 'mybugs') loadMyBugReports();
  if (tabName === 'admin' && isAdminMode) loadAdminBugReports();
};

// Attachment Handling
window.handleBugAttachment = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Validate specific criteria
  const isVideo = file.type.startsWith('video/');
  if (isVideo && file.size > 10 * 1024 * 1024) { // 10MB limit
    alert('Video files must be under 10MB.');
    return;
  }
  
  if (file.size > 50 * 1024 * 1024) {
    alert('File is too large completely. Max limit is 50MB for Firebase Storage.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    currentBugAttachment = {
      data: event.target.result, // base64 / data URL
      name: file.name,
      type: file.type
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
      nameEl.style.maxWidth = '200px';
    }
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
  if (!db || !storage) {
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
  
  statusEl.innerHTML = '<span style="color: #fb8500;">Uploading report, please wait...</span>';
  
  let attachmentUrl = null;
  let attachmentType = null;
  
  try {
    if (currentBugAttachment) {
      // Create a unique file name
      const fileName = `bugs/${Date.now()}_${currentBugAttachment.name}`;
      const storageRef = storage.ref().child(fileName);
      
      statusEl.innerHTML = '<span style="color: #fb8500;">Uploading attachment...</span>';
      await storageRef.putString(currentBugAttachment.data, 'data_url');
      attachmentUrl = await storageRef.getDownloadURL();
      attachmentType = currentBugAttachment.type;
    }
    
    const report = {
      timestamp: Date.now(),
      title: title,
      description: desc,
      status: 'ongoing',
      attachmentUrl: attachmentUrl,
      attachmentType: attachmentType
    };
    
    statusEl.innerHTML = '<span style="color: #fb8500;">Saving to database...</span>';
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

// Load Logic
window.loadMyBugReports = async function() {
  if (!db) return;
  try {
    const snapshot = await db.collection('reports').orderBy('timestamp', 'desc').get();
    
    const ongoingList = document.getElementById('bug-list-ongoing');
    const fixedList = document.getElementById('bug-list-fixed');
    ongoingList.innerHTML = '';
    fixedList.innerHTML = '';
    
    let ongoingCount = 0;
    let fixedCount = 0;
    
    snapshot.forEach(doc => {
      const r = doc.data();
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
  } catch(err) {
    console.error("Error loading bugs: ", err);
  }
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
    
    let ongoingCount = 0;
    let fixedCount = 0;
    
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
  } catch(err) {
    console.error("Error loading admin bugs: ", err);
  }
};

function createBugCardHTML(report, forAdmin) {
  const dateStr = new Date(report.timestamp).toLocaleString();
  let attachHtml = '';
  
  if (report.attachmentUrl) {
    if (report.attachmentType && report.attachmentType.startsWith('video/')) {
      attachHtml = `<div class="bug-card-attachment"><video src="${report.attachmentUrl}" controls></video></div>`;
    } else {
      attachHtml = `<div class="bug-card-attachment"><img src="${report.attachmentUrl}" alt="Bug screenshot"></div>`;
    }
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
      <div class="bug-card-desc">${report.description.replace(/\\n/g, '<br>')}</div>
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
  } catch(err) {
    console.error("Error fixing bug: ", err);
  }
};

window.adminUnfixBug = async function(id) {
  if (!db) return;
  try {
    await db.collection('reports').doc(id).update({ status: 'ongoing' });
    setTimeout(() => loadAdminBugReports(), 100);
  } catch(err) {
    console.error("Error unfixing bug: ", err);
  }
};

window.adminDeleteBug = async function(id) {
  if (!db) return;
  if (!confirm("Are you sure you want to delete this report?")) return;
  
  try {
    await db.collection('reports').doc(id).delete();
    // Reload whatever tab we're on
    const adminTab = document.querySelector('.bug-tab-admin');
    if (adminTab && adminTab.classList.contains('active')) {
      loadAdminBugReports();
    } else {
      loadMyBugReports();
    }
  } catch(err) {
    console.error("Error deleting bug: ", err);
  }
};

"""
    new_content = content[:start_idx] + new_code + content[end_idx:]
    with open(target_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Fixed script.js successfully!")
else:
    print("Could not find markers.")
