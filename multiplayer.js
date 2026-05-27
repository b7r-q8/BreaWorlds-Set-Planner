// ==========================================
// MULTIPLAYER NETWORKING (PeerJS)
// ==========================================

let mpActive = false;
let mpIsHost = false;
let mpPeer = null;
let mpRoomCode = '';
let mpUsername = '';
let mpMyColor = '#FFFFFF';
let mpConnections = []; // Array of PeerJS DataConnections
let mpPlayers = {}; // Dictionary mapping peerId -> { username, color, x, y, lastBlock, box, selectionData }
let mpHostId = null;
let mpIsMigrating = false;
let mpMyPeerId = null;

const MP_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA',
  '#F97316', '#22D3EE', '#EC4899', '#84CC16'
];

let mpStartTime = 0;
let mpUptimeInterval = null;

function mpGenerateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars.charAt(Math.floor(Math.random() * chars.length));
  return c;
}

function mpAssignColor() {
  const usedColors = Object.values(mpPlayers).map(p => p.color);
  for (const c of MP_COLORS) {
    if (!usedColors.includes(c)) return c;
  }
  return MP_COLORS[Math.floor(Math.random() * MP_COLORS.length)];
}

// UI HANDLERS
window.openMPLobby = function() {
  const lobby = document.getElementById('mp-lobby-popup');
  if (lobby) lobby.classList.remove('hidden');
};

window.closeMPLobby = function() {
  const lobby = document.getElementById('mp-lobby-popup');
  if (lobby) lobby.classList.add('hidden');
};

window.mpStartHostFlow = function() {
  const user = document.getElementById('mp-username-input').value.trim();
  const err = document.getElementById('mp-lobby-error');
  if (!user) { err.textContent = "Username is required."; return; }
  mpUsername = user;
  err.textContent = "";
  
  // Open world selector
  closeMPLobby();
  const selector = document.getElementById('mp-host-selector-popup');
  if (selector) selector.classList.remove('hidden');
  
  mpRenderHostSlots();
};

window.mpJoinServerFlow = function() {
  const user = document.getElementById('mp-username-input').value.trim();
  const code = document.getElementById('mp-join-code-input').value.trim().toUpperCase();
  const err = document.getElementById('mp-lobby-error');
  
  if (!user) { err.textContent = "Username is required."; return; }
  if (code.length !== 6) { err.textContent = "Code must be 6 letters."; return; }
  
  mpUsername = user;
  err.textContent = "Connecting...";
  
  mpJoinRoom(code);
};

window.closeMPHostSelector = function() {
  const selector = document.getElementById('mp-host-selector-popup');
  if (selector) selector.classList.add('hidden');
  openMPLobby();
};

window.mpHostCurrentWorld = function() {
  const selector = document.getElementById('mp-host-selector-popup');
  if (selector) selector.classList.add('hidden');
  // We don't clear the world here anymore, so it hosts whatever is currently in the planner
  mpCreateRoom();
};

window.mpHostLoadWorld = function(slot) {
  const selector = document.getElementById('mp-host-selector-popup');
  if (selector) selector.classList.add('hidden');
  loadWPWorldFromSlot(slot, true);
  setTimeout(() => {
    mpCreateRoom();
  }, 100);
};

function mpRenderHostSlots() {
  const container = document.getElementById('mpHostSlotsContainer');
  if (!container) return;
  const allSlots = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]');
  container.innerHTML = '';
  
  if (allSlots.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); padding:10px;">No saved worlds found.</div>';
    return;
  }
  
  allSlots.forEach(slot => {
    const dataStr = localStorage.getItem(`wpSaveSlot_${slot}`);
    if (!dataStr) return;
    const preview = JSON.parse(dataStr).preview || '';
    
    const div = document.createElement('div');
    div.className = 'wp-save-slot';
    div.style.cursor = 'pointer';
    div.onclick = () => mpHostLoadWorld(slot);
    div.innerHTML = `
      <div class="wp-save-slot-preview" style="background-image: url('${preview}')"></div>
      <div class="wp-save-slot-info">
        <div class="wp-save-slot-label">World Slot ${slot}</div>
        <div style="font-size:12px; color:#4ECDC4; margin-top:4px;">Click to Host</div>
      </div>
    `;
    container.appendChild(div);
  });
}

// NETWORKING LOGIC
function mpCreateRoom(isMigration = false) {
  if (!isMigration) mpRoomCode = mpGenerateCode();
  const fullPeerId = 'bwplanner-' + mpRoomCode;
  
  if (mpPeer) mpPeer.destroy();
  
  mpPeer = new Peer(fullPeerId);
  mpPeer.on('open', (id) => {
    mpActive = true;
    mpIsHost = true;
    mpConnections = [];
    if (!isMigration) mpPlayers = {};
    mpHostId = id;
    mpMyPeerId = id;
    mpIsMigrating = false;
    
    mpMyColor = mpAssignColor();
    mpPlayers[id] = { username: mpUsername, color: mpMyColor, x: 0, y: 0, lastBlock: null };
    
    mpShowStatusBar();
    if (isMigration) console.log("Migration successful. I am the new host.");
  });
  
  mpPeer.on('connection', (conn) => {
    if (mpConnections.length >= 7) {
      setTimeout(() => conn.close(), 500); // Max 8 players (Host + 7)
      return;
    }
    
    conn.on('open', () => {
      // For existing host/players, if we get a new connection, add it to our list
      if (!mpConnections.find(c => c.peer === conn.peer)) {
        mpConnections.push(conn);
      }
      
      conn.on('data', (data) => mpHandleMeshData(conn, data));
      conn.on('close', () => mpHandlePeerDisconnect(conn.peer));
      conn.on('error', () => mpHandlePeerDisconnect(conn.peer));
    });
  });
  
  mpPeer.on('error', (err) => {
    alert("Server error: " + err.message);
    mpDisconnect();
  });
}

function mpJoinRoom(code) {
  const fullPeerId = 'bwplanner-' + code;
  mpRoomCode = code;
  
  if (mpPeer && mpPeer.id === fullPeerId) return; // Already hosting/joining this code
  if (mpPeer) mpPeer.destroy();
  
  mpPeer = new Peer(); 
  mpPeer.on('open', (id) => {
    mpMyPeerId = id;
    const conn = mpPeer.connect(fullPeerId, { reliable: true });
    
    conn.on('open', () => {
      mpActive = true;
      mpIsHost = false;
      if (!mpConnections.find(c => c.peer === conn.peer)) mpConnections.push(conn);
      mpHostId = fullPeerId;
      mpPlayers = {};
      
      const err = document.getElementById('mp-lobby-error');
      if (err) err.textContent = "";
      closeMPLobby();
      mpShowStatusBar();
      
      // Let current host know we joined
      conn.send({ type: 'player_join', username: mpUsername });
    });
    
    conn.on('data', (data) => mpHandleMeshData(conn, data));
    
    conn.on('close', () => {
      console.log("Connection to Discovery Host lost.");
      if (mpActive) mpInitiateMigration();
    });
    
    conn.on('error', (err) => {
      console.log("Connection error to Discovery Host.");
      if (mpActive) mpInitiateMigration();
    });
  });
  
  mpPeer.on('connection', (conn) => {
    // Other mesh peers might connect to us
    conn.on('open', () => {
      if (!mpConnections.find(c => c.peer === conn.peer)) mpConnections.push(conn);
      conn.on('data', (data) => mpHandleMeshData(conn, data));
      conn.on('close', () => mpHandlePeerDisconnect(conn.peer));
    });
  });

  mpPeer.on('error', (err) => {
    const errEl = document.getElementById('mp-lobby-error');
    if (errEl) {
      if (err.type === 'peer-unavailable') errEl.textContent = "Server not found. Check code.";
      else errEl.textContent = "Connection error: " + err.type;
    }
  });
}

// HOST LOGIC (Relays and validates)
// UNIFIED MESH DATA HANDLER
function mpHandleMeshData(conn, data) {
  const peerId = data.peerId || conn.peer;
  
  if (data.type === 'player_join') {
    if (!mpIsHost) return; // Only host handles initial welcome
    
    const color = mpAssignColor();
    mpPlayers[peerId] = { username: data.username, color: color, x: 0, y: 0, lastBlock: null };
    
    // Sync full world state to the new player
    const themeId = typeof wpCurrentTheme !== 'undefined' ? wpCurrentTheme : 'bg_forest';
    conn.send({ type: 'world_sync', grid: wpGrid, bgGrid: wpBackgroundGrid, themeId: themeId, myColor: color });
    
    // Send full peer roster so they can mesh-connect
    const roster = { type: 'roster_update', players: mpPlayers, myself: mpHostId };
    mpBroadcast(roster);
    mpUpdateStatusBar();
    return;
  }
  
  if (data.type === 'roster_update') {
    // Merge new roster into existing players to preserve transient state like box/selectionData
    const newPlayers = data.players;
    for (const pid in newPlayers) {
        if (!mpPlayers[pid]) {
            mpPlayers[pid] = newPlayers[pid];
        } else {
            mpPlayers[pid].username = newPlayers[pid].username;
            mpPlayers[pid].color = newPlayers[pid].color;
            // Preserving p.x, p.y, p.box, p.selectionData, p.lastBlock
        }
    }
    // Remove disconnected players
    for (const pid in mpPlayers) {
        if (!newPlayers[pid]) delete mpPlayers[pid];
    }
    
    mpHostId = data.myself;
    mpUpdateStatusBar();
    
    // Mesh Check
    for (const pid in mpPlayers) {
      if (pid === mpMyPeerId || pid === mpPeer.id) continue;
      const existing = mpConnections.find(c => c.peer === pid);
      if (!existing && pid !== mpHostId) {
         const newConn = mpPeer.connect(pid, { reliable: true });
         newConn.on('open', () => {
            mpConnections.push(newConn);
            newConn.on('data', (d) => mpHandleMeshData(newConn, d));
            newConn.on('close', () => mpHandlePeerDisconnect(pid));
         });
      }
    }
    return;
  }

  if (data.type === 'world_sync') {
    mpMyColor = data.myColor || mpMyColor;
    wpGrid = data.grid || wpGrid;
    wpBackgroundGrid = data.bgGrid || wpBackgroundGrid;
    if (data.themeId && typeof setWPTheme === 'function') setWPTheme(data.themeId, true);
    if (typeof initWPHistoryState === 'function') {
      window.wpHistory = []; window.wpHistoryIndex = -1;
      initWPHistoryState();
    }
    if (typeof updateWPAnimatedCellList === 'function') updateWPAnimatedCellList();
    wpMarkStaticDirty(); wpMarkDirty(); updateWPBlockCount();
    return;
  }

  // Handle game actions
  if (data.type === 'block_place') {
    const targetGrid = data.layer === 'bg' ? wpBackgroundGrid : wpGrid;
    targetGrid[data.y][data.x] = data.blockData;
    if (typeof window.wpUpdateHistoryStateSilently === 'function') {
      window.wpUpdateHistoryStateSilently(data.x, data.y, data.layer, data.blockData);
    }
    if (mpPlayers[peerId]) mpPlayers[peerId].lastBlock = data.blockId;
    
    wpUpdateTilingAt(data.x, data.y);
    wpUpdateTilingAt(data.x, data.y + 1);
    wpUpdateTilingAt(data.x, data.y - 1);
    wpUpdateTilingAt(data.x + 1, data.y);
    wpUpdateTilingAt(data.x - 1, data.y);
    wpUpdateTilingAt(data.x - 1, data.y - 1);
    wpUpdateTilingAt(data.x + 1, data.y - 1);
    wpUpdateTilingAt(data.x - 1, data.y + 1);
    wpUpdateTilingAt(data.x + 1, data.y + 1);
    if (typeof updateWPAnimatedCellList === 'function') updateWPAnimatedCellList(data.x, data.y, false);
    wpMarkDirty();
    if (typeof wpUpdateStaticCacheArea === 'function') wpUpdateStaticCacheArea(data.x, data.y, 1);
    updateWPBlockCount();
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'block_erase') {
    const targetGrid = data.layer === 'bg' ? wpBackgroundGrid : wpGrid;
    targetGrid[data.y][data.x] = null;
    if (typeof window.wpUpdateHistoryStateSilently === 'function') {
      window.wpUpdateHistoryStateSilently(data.x, data.y, data.layer, null);
    }
    wpUpdateTilingAt(data.x, data.y);
    wpUpdateTilingAt(data.x, data.y + 1);
    wpUpdateTilingAt(data.x, data.y - 1);
    wpUpdateTilingAt(data.x + 1, data.y);
    wpUpdateTilingAt(data.x - 1, data.y);
    wpUpdateTilingAt(data.x - 1, data.y - 1);
    wpUpdateTilingAt(data.x + 1, data.y - 1);
    wpUpdateTilingAt(data.x - 1, data.y + 1);
    wpUpdateTilingAt(data.x + 1, data.y + 1);
    if (typeof updateWPAnimatedCellList === 'function') updateWPAnimatedCellList(data.x, data.y, true);
    wpMarkDirty();
    if (typeof wpUpdateStaticCacheArea === 'function') wpUpdateStaticCacheArea(data.x, data.y, 1);
    updateWPBlockCount();
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'cursor_move') {
    if (mpPlayers[peerId]) {
      mpPlayers[peerId].x = data.x;
      mpPlayers[peerId].y = data.y;
      mpPlayers[peerId].box = data.box;
      if (data.blockId) mpPlayers[peerId].lastBlock = data.blockId;
    }
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'fill_action') {
    for (const c of data.changes) {
      const g = c.l === 'bg' ? wpBackgroundGrid : wpGrid;
      g[c.y][c.x] = c.v;
      if (typeof window.wpUpdateHistoryStateSilently === 'function') window.wpUpdateHistoryStateSilently(c.x, c.y, c.l, c.v);
      wpUpdateTilingAt(c.x, c.y);
      wpUpdateTilingAt(c.x, c.y + 1);
      wpUpdateTilingAt(c.x, c.y - 1);
      wpUpdateTilingAt(c.x + 1, c.y);
      wpUpdateTilingAt(c.x - 1, c.y);
      if (typeof updateWPAnimatedCellList === 'function') updateWPAnimatedCellList(c.x, c.y, !c.v);
    }
    
    // Efficient bounding-box redraw instead of full world wipe
    let minX = WORLD_WIDTH, minY = WORLD_HEIGHT, maxX = 0, maxY = 0;
    for (const c of data.changes) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
    
    if (typeof updateWPBlockCount === 'function') updateWPBlockCount();
    if (typeof wpUpdateStaticCacheRegion === 'function' && maxX >= minX && maxY >= minY) {
      wpUpdateStaticCacheRegion(Math.max(0, minX - 1), Math.max(0, minY - 1), Math.min(WORLD_WIDTH - 1, maxX + 1), Math.min(WORLD_HEIGHT - 1, maxY + 1));
    } else {
      wpMarkStaticDirty();
    }
    wpMarkDirty();
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'bulk_action') {
    console.log('[MP] Received bulk_action, changes:', data.changes.length, 'from:', peerId, 'sample:', JSON.stringify(data.changes.slice(0, 3)));
    for (const c of data.changes) {
      const g = c.l === 'bg' ? wpBackgroundGrid : wpGrid;
      g[c.y][c.x] = c.v;
      if (typeof window.wpUpdateHistoryStateSilently === 'function') window.wpUpdateHistoryStateSilently(c.x, c.y, c.l, c.v);
      wpUpdateTilingAt(c.x, c.y);
      wpUpdateTilingAt(c.x, c.y + 1);
      wpUpdateTilingAt(c.x, c.y - 1);
      wpUpdateTilingAt(c.x + 1, c.y);
      wpUpdateTilingAt(c.x - 1, c.y);
      if (typeof updateWPAnimatedCellList === 'function') updateWPAnimatedCellList(c.x, c.y, c.v ? false : true);
    }
    // Always do full refresh — matches the proven fill_action pattern
    if (typeof updateWPBlockCount === 'function') updateWPBlockCount();
    wpMarkStaticDirty(); 
    wpMarkDirty();
    console.log('[MP] bulk_action processed, cache refreshed');
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'theme_change') {
    if (typeof setWPTheme === 'function') setWPTheme(data.themeId, true);
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'world_action') {
    if (data.action === 'clear' && typeof wpClearWorldOnly === 'function') wpClearWorldOnly(true, true);
    else if (data.action === 'reset' && typeof wpResetWorld === 'function') wpResetWorld(true, true);
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'wrench_action') {
    const targetGrid = data.layer === 'bg' ? wpBackgroundGrid : wpGrid;
    if (targetGrid[data.y] && targetGrid[data.y][data.x]) {
       targetGrid[data.y][data.x] = { id: data.blockId, state: data.state };
       if (typeof updateWPAnimatedCellList === 'function') updateWPAnimatedCellList(data.x, data.y);
       wpUpdateStaticCacheArea(data.x, data.y, 1);
       wpMarkDirty();
    }
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'selection_start') {
    if (mpPlayers[peerId]) {
      mpPlayers[peerId].box = data.box;
      mpPlayers[peerId].selectionData = data.selectionData;
    }
    if (mpIsHost) mpBroadcast(data, peerId);
  }
  else if (data.type === 'selection_end') {
    if (mpPlayers[peerId]) {
      mpPlayers[peerId].box = null;
      mpPlayers[peerId].selectionData = null;
    }
    if (mpIsHost) mpBroadcast(data, peerId);
  }
}

function mpHandlePeerDisconnect(peerId) {
  if (mpPlayers[peerId]) {
    delete mpPlayers[peerId];
  }
  mpConnections = mpConnections.filter(c => c.peer !== peerId);
  
  const roster = { type: 'roster_update', players: mpPlayers, myself: mpHostId };
  mpBroadcast(roster);
  mpUpdateStatusBar();
}

function mpBroadcast(data, excludePeerId = null) {
  for (const conn of mpConnections) {
    if (conn.peer !== excludePeerId) {
      conn.send(data);
    }
  }
}

// HOST MIGRATION
function mpInitiateMigration() {
  if (mpIsMigrating) return;
  mpIsMigrating = true;
  mpActive = false;
  
  const statusRole = document.getElementById('mp-status-role');
  if (statusRole) statusRole.textContent = "Migrating Host...";
  
  // Detach old peer
  if (mpPeer) {
    mpPeer.destroy();
    mpPeer = null;
  }
  mpConnections = [];
  
  // Cleanup the old host from player list before calculating heirs
  if (mpPlayers[mpHostId]) delete mpPlayers[mpHostId];

  // Determine heir alphabetically (deterministic for all clients)
  const pids = Object.keys(mpPlayers).sort();
  // Filter out the dead host
  const availablePids = pids.filter(pid => pid !== mpHostId);
  
  if (availablePids.length === 0) {
    alert("The host has left and no other players are available.");
    mpDisconnect();
    return;
  }

  const heirId = availablePids[0];
  const isHeir = mpMyPeerId === heirId;
  const heirIndex = availablePids.indexOf(mpMyPeerId);
  
  if (isHeir) {
    console.log("I am the heir. Re-hosting room...");
    // Clear our old identity since we will get a new one from mpCreateRoom
    if (mpPlayers[mpMyPeerId]) delete mpPlayers[mpMyPeerId];
    // Heir takes over the room code immediately
    mpCreateRoom(true); 
  } else {
    console.log("Waiting for migration...");
    // Everyone else waits a tiny bit then tries to find the new host
    setTimeout(() => {
        mpJoinRoom(mpRoomCode);
    }, 1200 + (heirIndex * 200));
  }
}

// mpHandleClientData functionality merged into mpHandleMeshData

// ACTION HOOKS
window.mpBroadcastBlockPlace = function(x, y, blockId, layer, blockData) {
  if (!mpActive) return;
  const data = { type: 'block_place', x, y, blockId, layer, blockData, peerId: mpPeer.id };
  if (mpIsHost) { 
    if (mpPlayers[mpPeer.id]) mpPlayers[mpPeer.id].lastBlock = blockId; 
    mpBroadcast(data); 
  }
  else mpConnections[0].send(data);
};

window.mpBroadcastBlockErase = function(x, y, layer) {
  if (!mpActive) return;
  const data = { type: 'block_erase', x, y, layer, peerId: mpPeer.id };
  if (mpIsHost) mpBroadcast(data);
  else mpConnections[0].send(data);
};

window.mpBroadcastFillAction = function(changes) {
  if (!mpActive) return;
  const CHUNK_SIZE = 800;
  let i = 0;
  const iv = setInterval(() => {
    const chunk = changes.slice(i, i + CHUNK_SIZE);
    const data = { type: 'fill_action', changes: chunk, peerId: mpPeer.id };
    if (mpIsHost) mpBroadcast(data);
    else mpConnections[0].send(data);
    
    i += CHUNK_SIZE;
    if (i >= changes.length) clearInterval(iv);
  }, 50);
};

window.mpBroadcastBulkAction = function(deltas, isUndo) {
  if (!mpActive) { console.warn('[MP] mpBroadcastBulkAction: mpActive is false, aborting'); return; }
  console.log('[MP] mpBroadcastBulkAction called, deltas:', deltas.length, 'isUndo:', isUndo);
  const changes = deltas.map(d => ({ x: d.x, y: d.y, l: d.l, v: isUndo ? d.prev : d.next }));
  console.log('[MP] Sending as chunked staggered fill_action, changes:', changes.length);
  
  const CHUNK_SIZE = 800;
  let i = 0;
  const iv = setInterval(() => {
    const chunk = changes.slice(i, i + CHUNK_SIZE);
    const data = { type: 'fill_action', changes: chunk, peerId: mpPeer.id };
    if (mpIsHost) mpBroadcast(data);
    else mpConnections[0].send(data);
    
    i += CHUNK_SIZE;
    if (i >= changes.length) clearInterval(iv);
  }, 50);
};

window.mpBroadcastThemeChange = function(themeId) {
  if (!mpActive) return;
  const data = { type: 'theme_change', themeId, peerId: mpPeer.id };
  if (mpIsHost) mpBroadcast(data);
  else mpConnections[0].send(data);
};

window.mpBroadcastWorldAction = function(action) {
  if (!mpActive) return;
  const data = { type: 'world_action', action, peerId: mpPeer.id };
  if (mpIsHost) mpBroadcast(data);
  else mpConnections[0].send(data);
};

window.mpBroadcastWrenchAction = function(x, y, layer, blockId, state) {
  if (!mpActive) return;
  const data = { type: 'wrench_action', x, y, layer, blockId, state, peerId: mpPeer.id };
  if (mpIsHost) mpBroadcast(data);
  else mpConnections[0].send(data);
};

window.mpBroadcastSelectionStart = function(box, selectionData) {
  if (!mpActive) return;
  const data = { type: 'selection_start', box, selectionData, peerId: mpPeer.id };
  if (mpIsHost) mpBroadcast(data);
  else mpConnections[0].send(data);
};

let mpLastCursorSend = 0;
window.mpSendCursorPosition = function(x, y, force = false) {
  if (!mpActive) return;
  const now = Date.now();
  if (!force && (now - mpLastCursorSend < 60)) return;
  mpLastCursorSend = now;
  
  let selBox = null;
  if (typeof window.wpSelectionBox !== 'undefined' && typeof window.wpSelectionStartX !== 'undefined') {
    selBox = window.wpSelectionBox || (window.wpSelectionStartX !== -1 && window.wpSelectionEndX !== -1 ? {
      x: Math.min(window.wpSelectionStartX, window.wpSelectionEndX),
      y: Math.min(window.wpSelectionStartY, window.wpSelectionEndY),
      w: Math.abs(window.wpSelectionEndX - window.wpSelectionStartX) + 1,
      h: Math.abs(window.wpSelectionEndY - window.wpSelectionStartY) + 1
    } : null);
    // 1. SELECT TOOL OVERHAUL: We explicitly remove the massive ghost shifting math offset previously appending 'EndX' and 'StartX' to 'selBox.x'. 
    // The main engine naturally tracks 'wpSelectionBox.x'/'y' efficiently while dragging. Appending end math pushes it into oblivion on remote screens.
  }

  const currentBlockId = (typeof window.wpSelectedBlockId !== 'undefined') ? window.wpSelectedBlockId : null;

  const data = { type: 'cursor_move', x, y, peerId: mpPeer.id, box: selBox, blockId: currentBlockId };
  if (mpIsHost) { 
    if (mpPlayers[mpPeer.id]) {
      mpPlayers[mpPeer.id].x = x; 
      mpPlayers[mpPeer.id].y = y; 
      mpPlayers[mpPeer.id].lastBlock = currentBlockId;
    }
    mpBroadcast(data); 
  }
  else mpConnections[0].send(data);
};

// Helper for rounded rects on canvas
function mpFillRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}


// RENDERING
window.mpDrawRemoteCursors = function(ctx, zoom, offX, offY) {
  if (!mpActive) return;
  
  for (const pid in mpPlayers) {
    if (pid === mpPeer.id) continue;
    const p = mpPlayers[pid];
    if (!p) continue;
    
    const screenX = (p.x + offX) * zoom;
    const screenY = (p.y + offY) * zoom;
    
    ctx.save();
    
    // Draw Remote Selection (GHOSTS)
    if (p.box && p.selectionData) {
        ctx.save();
        ctx.globalAlpha = 0.5; // Ghostly opacity
        for(const item of p.selectionData) {
            const bx = (p.box.x + item.x) * 32;
            const by = (p.box.y + item.y) * 32;
            const sx = (bx + offX) * zoom;
            const sy = (by + offY) * zoom;
            const sz = 32 * zoom;
            
            if (item.fg) {
                const bid = typeof item.fg === 'object' ? item.fg.id : item.fg;
                const img = getWPImage(wpBlockMap[bid].src);
                if (img && img.complete) ctx.drawImage(img, sx, sy, sz, sz);
            }
            if (item.bg) {
                const bid = typeof item.bg === 'object' ? item.bg.id : item.bg;
                const img = getWPImage(wpBlockMap[bid].src);
                if (img && img.complete) ctx.drawImage(img, sx, sy, sz, sz);
            }
        }
        ctx.restore();
    }

    // Draw cursor arrow
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + 15, screenY + 15);
    ctx.lineTo(screenX + 5, screenY + 15);
    ctx.lineTo(screenX, screenY + 22);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Remote Selection Box Outline
    if (p.box) {
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color + '33';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = (performance.now() / 50) % 8;
      const bx = (p.box.x * 32 + offX) * zoom;
      const by = (p.box.y * 32 + offY) * zoom;
      const bw = p.box.w * 32 * zoom;
      const bh = p.box.h * 32 * zoom;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);
    }

    if (p.lastBlock) {
      const bid = p.lastBlock;
      const blk = wpBlockMap[bid];
      if (blk) {
          const img = getWPImage(blk.src);
          if (img && img.complete) {
              const bSize = 16 * zoom; // Reduced size as requested
              // Position it near the cursor tip
              const bOffX = screenX + 12;
              const bOffY = screenY + 12;
              
              // Premium Block Outline (Inner/Outer double stroke)
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
              ctx.lineWidth = 3 * zoom;
              ctx.strokeRect(bOffX - 1, bOffY - 1, bSize + 2, bSize + 2);
              
              ctx.strokeStyle = p.color;
              ctx.lineWidth = 1.5 * zoom;
              ctx.strokeRect(bOffX - 1, bOffY - 1, bSize + 2, bSize + 2);
              
              // Draw actual block ghost
              ctx.globalAlpha = 1.0; 
              ctx.drawImage(img, bOffX, bOffY, bSize, bSize);
          }
      }
    }
    
    // Aesthetic Username Label (Glassmorphic) - Slightly smaller as requested
    ctx.font = '600 11px "Poppins", sans-serif'; 
    const textWidth = ctx.measureText(p.username).width;
    const paddingH = 7;
    const paddingV = 4;
    const labelW = textWidth + paddingH * 2;
    const labelH = 14 + paddingV;
    const lx = screenX + 14;
    const ly = screenY - labelH - 3;

    // Draw background box
    ctx.fillStyle = 'rgba(10, 10, 26, 0.6)';
    mpFillRoundedRect(ctx, lx, ly, labelW, labelH, 5);
    
    // Draw subtle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw text
    ctx.fillStyle = p.color;
    ctx.fillText(p.username, lx + paddingH, ly + labelH - paddingV - 1);
    
    ctx.restore();
  }
};

function mpShowStatusBar() {
  const bar = document.getElementById('mp-status-bar');
  if (bar) bar.style.display = 'block';
  mpStartTime = Date.now();
  if (mpUptimeInterval) clearInterval(mpUptimeInterval);
  mpUptimeInterval = setInterval(mpUpdateUptime, 1000);
  document.getElementById('mp-status-role').textContent = mpIsHost ? 'Hosting Room' : 'Connected';
  document.getElementById('mp-status-code').textContent = mpRoomCode;
  mpUpdateStatusBar();
}

function mpUpdateUptime() {
  const el = document.getElementById('mp-status-uptime');
  if (!el || !mpActive) return;
  const diff = Math.floor((Date.now() - mpStartTime) / 1000);
  const m = String(Math.floor(diff / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  el.textContent = `${m}:${s}`;
}

function mpUpdateStatusBar() {
  const dot = document.getElementById('mp-conn-dot');
  if (dot) dot.className = 'mp-status-indicator ' + (mpActive ? 'online' : '');
  const pCount = Object.keys(mpPlayers).length;
  document.getElementById('mp-status-count').textContent = `${pCount}/8`;
  const chips = document.getElementById('mp-player-chips');
  if (chips) {
    chips.innerHTML = '';
    for (const pid in mpPlayers) {
      const p = mpPlayers[pid];
      const div = document.createElement('div');
      div.className = 'mp-player-chip';
      div.style.backgroundColor = p.color + '40';
      div.style.borderColor = p.color;
      div.style.color = 'white';
      div.textContent = p.username.charAt(0).toUpperCase();
      chips.appendChild(div);
    }
  }
}

window.mpCopyRoomCode = function() {
  if (mpRoomCode) navigator.clipboard.writeText(mpRoomCode).then(() => {
    // Hidden feedback could go here if needed, but for now we just get rid of the alert
  });
};

window.mpDisconnectBtn = function() {
  mpEmergencySave(); 
  mpDisconnect();
};

function mpDisconnect() {
  mpActive = false;
  if (mpPeer) { mpPeer.destroy(); mpPeer = null; }
  mpConnections = []; mpPlayers = {};
  if (mpUptimeInterval) clearInterval(mpUptimeInterval);
  const bar = document.getElementById('mp-status-bar');
  if (bar) bar.style.display = 'none';
}

function mpEmergencySave() {
  const allSlots = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]');
  let next = 1; while (allSlots.includes(next)) next++;
  allSlots.push(next);
  try {
    localStorage.setItem('wpSaveSlotsList', JSON.stringify(allSlots));
  } catch (error) {
    console.error('Emergency save failed to update slots list:', error);
  }
  if (typeof saveWPWorldToSlot === 'function') saveWPWorldToSlot(next);
}
