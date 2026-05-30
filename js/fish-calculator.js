// ==================== FISH GEMS CALCULATOR ====================
window.formatLocksHTML = function(wlAmount) {
  if (wlAmount === 0 || isNaN(wlAmount)) {
    return `0 <img src="worldplanner/new/spr_fg_lock/spr_fg_lock_0.png" class="fish-lock-icon" alt="WL">`;
  }
  
  let html = '';
  let amount = wlAmount;
  
  const CL = Math.floor(amount / 100000);
  amount -= CL * 100000;
  
  const AL = Math.floor(amount / 10000);
  amount -= AL * 10000;
  
  const TL = Math.floor(amount / 100);
  let WL = amount - TL * 100;
  WL = Math.round(WL * 100) / 100; 
  
  if (CL > 0) html += `${CL} <img src="worldplanner/new/spr_fg_crystal_lock/spr_fg_crystal_lock_0.png" class="fish-lock-icon" alt="CL">`;
  if (AL > 0) html += `${html ? ' ' : ''}${AL} <img src="worldplanner/new/spr_fg_amethyst_lock/spr_fg_amethyst_lock_0.png" class="fish-lock-icon" alt="AL">`;
  if (TL > 0) html += `${html ? ' ' : ''}${TL} <img src="worldplanner/new/spr_fg_titanium_lock/spr_fg_titanium_lock_0.png" class="fish-lock-icon" alt="TL">`;
  if (WL > 0 || html === '') {
    const wlStr = Math.floor(WL).toString();
    html += `${html ? ' ' : ''}${wlStr} <img src="worldplanner/new/spr_fg_lock/spr_fg_lock_0.png" class="fish-lock-icon" alt="WL">`;
  }
  
  return html;
  return html;
};

window.initFishCalculatorUI = function() {
  const style = document.createElement('style');
  style.textContent = `
    .fish-custom-rates {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 5px;
      font-family: 'Poppins', sans-serif;
    }
    .cfg-input-wrap {
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(168, 218, 220, 0.15);
      border-radius: 6px;
      padding: 4px 8px;
      height: 26px;
      transition: all 0.2s;
    }
    .cfg-input-wrap:focus-within {
      border-color: rgba(168, 218, 220, 0.5);
      background: rgba(0, 0, 0, 0.35);
    }
    .cfg-input-wrap input {
      background: transparent;
      border: none;
      color: #f1faee;
      font-size: 13px;
      width: 36px;
      text-align: right;
      outline: none;
      font-family: inherit;
      font-weight: 600;
    }
    .cfg-input-wrap input::-webkit-outer-spin-button,
    .cfg-input-wrap input::-webkit-inner-spin-button {
      -webkit-appearance: none; margin: 0;
    }
    .cfg-input-wrap img {
      height: 16px;
      margin-left: 6px;
      image-rendering: pixelated;
    }
    .cfg-divider {
      color: rgba(168, 218, 220, 0.2);
      font-size: 14px;
    }
    .cfg-gem-readonly {
      font-size: 13px;
      font-weight: 600;
      color: #f1faee;
      width: 36px;
      text-align: right;
      display: inline-block;
    }
    #global-gem-rate::-webkit-outer-spin-button,
    #global-gem-rate::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    #global-gem-rate {
      -moz-appearance: textfield;
    }
  `;
  document.head.appendChild(style);

  // Inject Global Gems Rate Input into the Totals UI elegantly as a split container
  const totalsBar = document.querySelector('.fish-calc-totals');
  if (totalsBar && !document.getElementById('global-gem-rate')) {
    const totalWlsItem = document.querySelector('#fish-total-wls').parentNode;
    if (totalWlsItem) {
      // Create new divider
      const newDivider = document.createElement('div');
      newDivider.className = 'fish-total-divider';
      
      const rateDiv = document.createElement('div');
      rateDiv.className = 'fish-total-item';
      rateDiv.innerHTML = `
        <span class="fish-total-label">Gems Rate</span>
        <div style="display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.25); border: 1px solid rgba(168,218,220,0.15); border-radius: 6px; padding: 2px 8px; margin-top: 6px; height: 32px;">
          <input type="number" id="global-gem-rate" value="800" oninput="calcFishTotals()" style="width: 50px; background: transparent; border: none; color: #f1faee; font-size: 16px; font-weight: bold; text-align: center; outline: none; font-family: 'Poppins', sans-serif;">
          <img src="worldplanner/new/spr_icon_gems/spr_icon_gems_0.png" style="height: 18px; margin-left: 6px; image-rendering: pixelated;">
        </div>
      `;
      
      totalsBar.insertBefore(rateDiv, totalWlsItem);
      totalsBar.insertBefore(newDivider, totalWlsItem);
    }
  }

  document.querySelectorAll('.fish-row').forEach(row => {
    const infoContainer = row.querySelector('.fish-info');
    const oldMeta = infoContainer.querySelector('.fish-meta');
    if (!oldMeta) return;

    let defaultGems = row.dataset.gems || '0';

    const rawName = row.querySelector('.fish-name').textContent;
    const name = rawName.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Explicit override for squids if their gem base was also changed previously:
    if (name === 'small squid') defaultGems = '100';
    if (name === 'medium squid') defaultGems = '480';
    
    const editHtml = `
      <div class="fish-custom-rates">
        <div style="display: flex; align-items: center; padding: 4px;">
          <span class="cfg-gem-readonly">${defaultGems}</span>
          <img src="worldplanner/new/spr_icon_gems/spr_icon_gems_0.png" alt="Gems" style="height: 16px; margin-left: 6px; image-rendering: pixelated;">
          <input type="hidden" class="cfg-gem" value="${defaultGems}">
        </div>
      </div>
    `;

    oldMeta.outerHTML = editHtml;
  });
};

window.calcFishTotals = function () {
  let totalGems = 0;

  document.querySelectorAll('.fish-row').forEach(row => {
    let inputEl = row.querySelector('.fish-qty');
    let qty = parseInt(inputEl.value) || 0;

    if (qty > 99999) {
      qty = 99999;
      inputEl.value = 99999;
    }

    const gemInput = row.querySelector('.cfg-gem'); // hidden
    if (gemInput) {
      const gems = parseInt(gemInput.value) || 0;
      const rowGems = gems * qty;
      totalGems += rowGems;

      // Update per-row gem display
      const rowGemEl = row.querySelector('.fish-row-gems');
      rowGemEl.textContent = rowGems > 0 ? rowGems.toLocaleString() : '0';
      rowGemEl.classList.toggle('active', rowGems > 0);
    }
  });

  // Calculate equivalent locks from gems
  const rateInput = document.getElementById('global-gem-rate');
  const globalRate = rateInput ? (parseFloat(rateInput.value) || 800) : 800;
  const totalWLFromGems = globalRate > 0 ? (totalGems / globalRate) : 0;
  
  // Update totals natively
  const gemsEl = document.getElementById('fish-total-gems');
  const wlsEl = document.getElementById('fish-total-wls');

  gemsEl.innerHTML = `${totalGems.toLocaleString()} <img src="worldplanner/new/spr_icon_gems/spr_icon_gems_0.png" class="fish-gem-icon" alt="Gems">`;

  // The LOCKS box strictly equals the Total Gems converted via the Gems Rate 
  const roundedWL = Math.round(totalWLFromGems * 100) / 100;
  wlsEl.innerHTML = formatLocksHTML(roundedWL);

  // Micro-animation bump
  gemsEl.classList.add('bump');
  wlsEl.classList.add('bump');
  setTimeout(() => {
    gemsEl.classList.remove('bump');
    wlsEl.classList.remove('bump');
  }, 150);
};

window.changeFishQty = function (btn, delta) {
  const input = btn.parentElement.querySelector('.fish-qty');
  let val = parseInt(input.value) || 0;
  val = Math.max(0, Math.min(99999, val + delta));
  input.value = val;
  calcFishTotals();
};

window.resetFishCalc = function () {
  document.querySelectorAll('.fish-qty').forEach(input => {
    input.value = 0;
  });
  calcFishTotals();
};

window.toggleFishGroup = function (titleEl) {
  const group = titleEl.closest('.fish-group');
  group.classList.toggle('collapsed');
};

let wpBlocks = []; // Will be populated from manifest
let wpManifestThemes = [];
let wpCurrentTab = 'foreground';
let wpCurrentTheme = 'bg_forest'; // Default theme ID

// Export variables to window object for other scripts to use
window.wpBlocks = wpBlocks;
window.wpManifestThemes = wpManifestThemes;
window.wpCurrentTheme = wpCurrentTheme;

let wpGrid = []; // Foreground: Array of arrays [y][x]
let wpBackgroundGrid = []; // Background: Array of arrays [y][x]
let wpInventory = []; // Max 10 items
let wpSelectedBlockId = 'spr_fg_dirt';
let wpCanvas, wpCtx;
let wpCanvasCachedRect = null;
function getWPCanvasRect() {
  if (!wpCanvasCachedRect && wpCanvas) {
    wpCanvasCachedRect = wpCanvas.getBoundingClientRect();
  }
  return wpCanvasCachedRect;
}
window.addEventListener('scroll', () => {
  wpCanvasCachedRect = null;
}, { passive: true });
let wpTempCanvas, wpTempCtx; // For optimized textures
let wpRainbowPattern, wpRainbowPatternCanvas;
let wpRainbowAnimatedCanvas, wpRainbowAnimatedCtx; // Buffer for applying pattern to bases
let isPainting = false;
let isErasing = false;
let wpEraserTargetLayer = null;
let isSmartEraserMode = false; // New Mode: Smart Erase (paints only over same block to erase it)
let isPanning = false;
let wpMultiTouchActive = false; // Prevents "glitch drawing" when tapping/pinching

// TOOLBAR STATE
let wpCurrentTool = 'pencil';
let wpZoom = 1;
let wpOffsetX = 0;
let wpOffsetY = 0;
let wpShowGrid = true;

// NEW TOOL STATES
let wpSelectionStartX = -1, wpSelectionStartY = -1;
let wpSelectionEndX = -1, wpSelectionEndY = -1;
let wpSelectionBox = null;
let wpCopiedData = null;
let wpClipboardData = null;
let wpClipboardWidth = 0;
let wpClipboardHeight = 0;
let wpPasteMode = false;
let wpSelectionMoving = false;
let wpSwapTargetId = null;
let wpSwapTargetLayer = null;
let wpHistory = [];
let wpHistoryIndex = -1;
const MAX_HISTORY = 50;
let wpAnimatedCells = []; // Tracks {x, y} of all cells with animated blocks
let wpAnimatedCellSet = new Set(); // PERF: O(1) lookup for "x,y,layer" keys (replaces Array.some)
let _wpLastViewKey = ''; // Tracks wpOffsetX, wpOffsetY, wpZoom for smooth panning redraws

// PERF: Rebuild the Set from the array
function _wpRebuildAnimatedSet() {
  wpAnimatedCellSet.clear();
  for (const c of wpAnimatedCells) {
    wpAnimatedCellSet.add(`${c.x},${c.y},${c.layer}`);
  }
}

function updateWPAnimatedCellList(tx, ty, isRemoving = false) {
  if (tx === undefined) {
    // Full scan (only used for initial load)
    wpAnimatedCells = [];
    wpAnimatedCellSet.clear();
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (!wpGrid[y]) continue;
      for (let x = 0; x < WORLD_WIDTH; x++) {
        // Check Foreground
        const bdFG = wpGrid[y][x];
        if (bdFG) {
          const bid = (typeof bdFG === 'object' && bdFG !== null) ? bdFG.id : bdFG;
          const blk = wpBlockMap[bid];
          if ((bid === 'spr_fg_rainbow_block' || bid === 'rainbow_block') || (blk && blk.framesPath && bid !== 'spr_fg_flamingo' && (typeof bdFG !== 'object' || bdFG.state === undefined || bid === 'spr_fg_xmas_dj_box' || bid === 'spr_fg_gem_machine'))) {
            wpAnimatedCells.push({ x, y, layer: 'fg' });
            wpAnimatedCellSet.add(`${x},${y},fg`);
          }
        }
        // Check Background
        const bdBG = wpBackgroundGrid[y][x];
        if (bdBG) {
          const bid = (typeof bdBG === 'object' && bdBG !== null) ? bdBG.id : bdBG;
          const blk = wpBlockMap[bid];
          if (blk && blk.framesPath && bid !== 'spr_fg_flamingo' && (typeof bdBG !== 'object' || bdBG.state === undefined || bid === 'spr_fg_xmas_dj_box' || bid === 'spr_fg_gem_machine')) {
            wpAnimatedCells.push({ x, y, layer: 'bg' });
            wpAnimatedCellSet.add(`${x},${y},bg`);
          }
        }
      }
    }
    return;
  }

  // Incremental update
  if (isRemoving) {
    wpAnimatedCells = wpAnimatedCells.filter(c => !(c.x === tx && c.y === ty));
    wpAnimatedCellSet.delete(`${tx},${ty},fg`);
    wpAnimatedCellSet.delete(`${tx},${ty},bg`);
  } else {
    // Clear old entries for this cell first (could be in either layer)
    wpAnimatedCells = wpAnimatedCells.filter(c => !(c.x === tx && c.y === ty));
    wpAnimatedCellSet.delete(`${tx},${ty},fg`);
    wpAnimatedCellSet.delete(`${tx},${ty},bg`);

    const bdFG = wpGrid[ty][tx];
    const bdBG = wpBackgroundGrid[ty][tx];

    // Check FG Anim
    if (bdFG) {
      const bidFG = (typeof bdFG === 'object' && bdFG !== null) ? bdFG.id : bdFG;
      const blkFG = wpBlockMap[bidFG];
      if ((bidFG === 'spr_fg_rainbow_block' || bidFG === 'rainbow_block') || (blkFG && blkFG.framesPath && bidFG !== 'spr_fg_flamingo' && (typeof bdFG !== 'object' || bdFG.state === undefined || bidFG === 'spr_fg_xmas_dj_box' || bidFG === 'spr_fg_gem_machine'))) {
        wpAnimatedCells.push({ x: tx, y: ty, layer: 'fg' });
        wpAnimatedCellSet.add(`${tx},${ty},fg`);
      }
    }

    // Check BG Anim
    if (bdBG) {
      const bidBG = (typeof bdBG === 'object' && bdBG !== null) ? bdBG.id : bdBG;
      const blkBG = wpBlockMap[bidBG];
      if (blkBG && blkBG.framesPath && bidBG !== 'spr_fg_flamingo' && (typeof bdBG !== 'object' || bdBG.state === undefined || bidBG === 'spr_fg_xmas_dj_box' || bidBG === 'spr_fg_gem_machine')) {
        wpAnimatedCells.push({ x: tx, y: ty, layer: 'bg' });
        wpAnimatedCellSet.add(`${tx},${ty},bg`);
      }
    }
  }

  // Sort the list once after changes to avoid sorting in drawWPWorld
  if (wpAnimatedCells.length > 1) {
    wpAnimatedCells.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      if (a.layer === b.layer) return -1; // BG first
      return 1;
    });
  }
}

function updateWPBlockCount() {
  const listContainer = document.getElementById('wpCountList');
  if (!listContainer) return;

  // Aggregate counts for ALL blocks in the grid
  const counts = {};
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (!wpGrid[y]) continue;
    for (let x = 0; x < WORLD_WIDTH; x++) {
      // Process Foreground
      const blockData = wpGrid[y][x];
      if (blockData) {
        let blockId = (typeof blockData === 'object' && blockData !== null) ? blockData.id : blockData;
        if (blockId) {
          if (!((blockId === 'bedrock' || blockId === 'spr_fg_bedrock') && y >= WORLD_HEIGHT - 5)) {
            counts[blockId] = (counts[blockId] || 0) + 1;
          }
        }
      }
      // Process Background
      const bgData = wpBackgroundGrid[y][x];
      if (bgData) {
        let blockId = (typeof bgData === 'object' && bgData !== null) ? bgData.id : bgData;
        if (blockId) {
          counts[blockId] = (counts[blockId] || 0) + 1;
        }
      }
    }
  }

  // Render the list
  listContainer.innerHTML = '';

  // Sort by count (highest first)
  const sortedBlockIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  if (sortedBlockIds.length === 0) {
    listContainer.innerHTML = '<div style="text-align:center; opacity:0.5; padding: 20px;">No blocks placed yet.</div>';
    return;
  }

  sortedBlockIds.forEach(blockId => {
    const block = wpBlockMap[blockId];
    if (!block) return;

    const item = document.createElement('div');
    item.className = 'wp-count-item';

    item.innerHTML = `
      <img src="${block.src}" alt="${block.name}">
      <div class="wp-count-details">
        <span class="wp-count-name">${block.name}</span>
        <span class="wp-count-val">${counts[blockId]}</span>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

