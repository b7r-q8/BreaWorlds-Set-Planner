function saveActiveWorld() {
  try {
    // USER REQUEST: Keep the bedrock foundation in the save file after all
    localStorage.setItem('wp_active_grid_exclusive', JSON.stringify(wpGrid));
    localStorage.setItem('wp_background_grid_exclusive', JSON.stringify(wpBackgroundGrid));
    const viewport = document.getElementById('wp-viewport');
    if (viewport) {
      localStorage.setItem('wp_planner_theme_bg', viewport.style.getPropertyValue('--wp-theme-bg'));
      localStorage.setItem('wp_planner_theme_id', wpCurrentTheme);
    }
    // USER REQUEST: Save Inventory Hotbar
    localStorage.setItem('wp_inventory', JSON.stringify(wpInventory));
  } catch (error) {
    console.warn('Silent active-world save failed due to storage limit:', error);
  }
}


function loadActiveWorld() {
  const savedGrid = localStorage.getItem('wp_active_grid_exclusive') || localStorage.getItem('wp_active_grid');
  const savedBGGrid = localStorage.getItem('wp_background_grid_exclusive');
  const savedInventory = localStorage.getItem('wp_inventory');

  if (savedInventory) {
    try {
      const parsedInv = JSON.parse(savedInventory);
      if (Array.isArray(parsedInv)) wpInventory = parsedInv;
    } catch (e) { console.warn("Failed to load WP inventory", e); }
  }

  if (savedGrid) {
    const loadedGrid = JSON.parse(savedGrid);
    // Pad from TOP for existing 45-height saves
    while (loadedGrid.length < WORLD_HEIGHT) {
      const y = WORLD_HEIGHT - loadedGrid.length - 1;
      const isBedrock = y >= WORLD_HEIGHT - 5;
      loadedGrid.unshift(new Array(WORLD_WIDTH).fill(isBedrock ? 'spr_fg_bedrock' : null));
    }
    wpGrid = loadedGrid;

    // Standardize IDs
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (!wpGrid[y]) continue;
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const bd = wpGrid[y][x];
        const bid = (typeof bd === 'object' && bd !== null) ? bd.id : bd;

        if (bid === 'bedrock') {
          if (typeof bd === 'object') wpGrid[y][x].id = 'spr_fg_bedrock';
          else wpGrid[y][x] = 'spr_fg_bedrock';
        }
        if (bid === 'spr_fg_dirt_0' || bid === 'dirt_0' || bid === 'dirt_1') {
          if (typeof bd === 'object') wpGrid[y][x].id = 'spr_fg_dirt';
          else wpGrid[y][x] = 'spr_fg_dirt';
        }
      }
    }
  } else {
    wpGrid = getWPDefaultGrid();
  }

  if (savedBGGrid) {
    const loadedBGGrid = JSON.parse(savedBGGrid);
    while (loadedBGGrid.length < WORLD_HEIGHT) {
      loadedBGGrid.unshift(new Array(WORLD_WIDTH).fill(null));
    }
    wpBackgroundGrid = loadedBGGrid;
  } else {
    wpBackgroundGrid = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      wpBackgroundGrid[y] = new Array(WORLD_WIDTH).fill(null);
    }
  }

  // Apply tiling logic to all blocks on load
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      wpUpdateTilingAt(x, y);
    }
  }

  updateWPAnimatedCellList();
  updateWPBlockCount();

  // Start the render loop (demand-driven)
  if (wpAnimationId) cancelAnimationFrame(wpAnimationId);
  if (typeof mpDrawRemoteCursors === 'function') mpDrawRemoteCursors(wpCtx, wpZoom, wpOffsetX, wpOffsetY);
  wpScheduleFrame();
  wpStartAnimTicker();
}

let wpAnimationId = null;
let wpDirty = true; // Dirty flag: only redraw when something changes
let wpLastAnimTick = 0; // Throttle animation redraws
const WP_ANIM_INTERVAL = 100; // Animation tick every 100ms (10fps)

// PERF: Demand-driven render loop — only schedule frames when work is needed
let wpFrameScheduled = false;
let wpAnimTickInterval = null;

function wpScheduleFrame() {
  if (!wpFrameScheduled) {
    wpFrameScheduled = true;
    wpAnimationId = requestAnimationFrame(drawWPWorld);
  }
}

// PERF: Interval timer that pokes the render loop for animated blocks, wrench, and multiplayer
// This replaces the always-on 60fps rAF chain with a 10fps tick when animations are active
function wpStartAnimTicker() {
  if (wpAnimTickInterval) return;
  wpAnimTickInterval = setInterval(() => {
    const container = document.getElementById('world-planner-container');
    if (!container || container.style.display === 'none' || document.visibilityState === 'hidden') return;

    const hasAnim = wpAnimatedCells && wpAnimatedCells.length > 0;
    let needsMP = false;
    try { needsMP = mpActive; } catch(e) {}

    if (hasAnim || wpCurrentTool === 'wrench' || needsMP) {
      wpDirty = true;
      wpScheduleFrame();
    }
  }, WP_ANIM_INTERVAL);
}

function wpStopAnimTicker() {
  if (wpAnimTickInterval) {
    clearInterval(wpAnimTickInterval);
    wpAnimTickInterval = null;
  }
}

// Off-screen static cache: render all static blocks once, blit visible portion each frame
// Split into two layers to ensure blocks always cover shadows
let wpStaticShadowCanvas = null;
let wpStaticShadowCtx = null;
let wpStaticBlockCanvas = null;
let wpStaticBlockCtx = null;
let wpStaticDirty = true; // Rebuild when blocks change

// Shadow Staging for professional silhouette rendering (Fixes Safari/iOS)
let wpShadowStagingCanvas = null;
let wpShadowStagingCtx = null;

// Tracking for smooth line drawing
let wpLastGridX = -1;
let wpLastGridY = -1;
let wpNeedsPostProcess = false;
let wpPanPending = false; // rAF coalescing for pan redraws
let wpIsPanningActive = false; // Skip expensive animated processing during active pan

function wpMarkDirty() { wpDirty = true; wpScheduleFrame(); }
function wpMarkStaticDirty() { wpStaticDirty = true; wpDirty = true; wpScheduleFrame(); }

function wpUpdateStaticCacheRegion(x1, y1, x2, y2) {
  const xMin = Math.max(0, Math.min(x1, x2));
  const yMin = Math.max(0, Math.min(y1, y2));
  const xMax = Math.min(WORLD_WIDTH - 1, Math.max(x1, x2));
  const yMax = Math.min(WORLD_HEIGHT - 1, Math.max(y1, y2));

  // 1. Define the clipping area (slightly padded for shadows/body spills)
  const clearX1 = Math.max(0, xMin - 1);
  const clearY1 = Math.max(0, yMin - 1);
  const clearX2 = Math.min(WORLD_WIDTH - 1, xMax + 1);
  const clearY2 = Math.min(WORLD_HEIGHT - 1, yMax + 1);

  const cx = clearX1 * BLOCK_SIZE;
  const cy = clearY1 * BLOCK_SIZE;
  const cw = (clearX2 - clearX1 + 1) * BLOCK_SIZE;
  const ch = (clearY2 - clearY1 + 1) * BLOCK_SIZE;

  // 2. CLEAR once to prevent alpha stacking
  if (wpStaticBGCtx) wpStaticBGCtx.clearRect(cx, cy, cw, ch);
  if (wpStaticBlockCtx) wpStaticBlockCtx.clearRect(cx, cy, cw, ch);
  if (wpStaticShadowCtx) wpStaticShadowCtx.clearRect(cx, cy, cw, ch);

  // 3. CLIP and REDRAW everything that could overlap this area
  // We use save/clip to ensure that neighbors that aren't being redrawn 
  // don't get double-drawn by the neighborhood loop below.
  const contexts = [wpStaticBGCtx, wpStaticBlockCtx, wpStaticShadowCtx];
  contexts.forEach(ctx => {
    if (ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cw, ch);
      ctx.clip();
    }
  });

  // Iteration neighborhood: +2 vertical (for blocks with yOffset), +1 horizontal (for shadows)
  const iterY1 = Math.max(0, clearY1 - 1);
  const iterY2 = Math.min(WORLD_HEIGHT - 1, clearY2 + 2);
  const iterX1 = Math.max(0, clearX1 - 1);
  const iterX2 = Math.min(WORLD_WIDTH - 1, clearX2 + 1);

  for (let ty = iterY1; ty <= iterY2; ty++) {
    for (let tx = iterX1; tx <= iterX2; tx++) {
      updateWPStaticCacheAt(tx, ty, 'bg', false);
      updateWPStaticCacheAt(tx, ty, 'shadows', false);
      updateWPStaticCacheAt(tx, ty, 'blocks', false);
    }
  }

  contexts.forEach(ctx => { if (ctx) ctx.restore(); });
}

function wpUpdateStaticCacheArea(x, y, radius = 5) {
  // Radius 5 + Clipping = Perfect visuals, zero "slicing", and buttery smooth 60fps interaction.
  wpUpdateStaticCacheRegion(x - radius, y - radius, x + radius, y + radius);
}

// Helper: Draw a block image with optional inversion and rotation transforms
// bd = block data (string id or object with .inverted / .rotation)
// ctx = canvas context, img = loaded Image, px/py/nw/nh = draw coordinates & size
function wpDrawBlockImage(ctx, img, px, py, nw, nh, bd) {
  const inverted = (typeof bd === 'object' && bd !== null) ? !!bd.inverted : false;
  const rotation = (typeof bd === 'object' && bd !== null) ? (bd.rotation || 0) : 0;

  if (!inverted && rotation === 0) {
    // Fast path: no transforms needed
    ctx.drawImage(img, px, py, nw, nh);
    return;
  }

  ctx.save();
  // Move origin to center of the block image
  const cx = px + nw / 2;
  const cy = py + nh / 2;
  ctx.translate(cx, cy);

  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (inverted) {
    ctx.scale(-1, 1);
  }

  ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
  ctx.restore();
}

// Incremental update for a single cell (high performance painting)
function updateWPStaticCacheAt(x, y, pass, shouldClear = true) {
  if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
  if (!wpStaticShadowCtx || !wpStaticBlockCtx || !wpStaticBGCtx) return;

  const bx = x * BLOCK_SIZE;
  const by = y * BLOCK_SIZE;
  const areaSize = BLOCK_SIZE;
  const shadowOffset = 4;

  // Static Pass
  // Background Pass
  if (pass === 'bg' || !pass) {
    if (shouldClear) wpStaticBGCtx.clearRect(bx, by, areaSize, areaSize);
    const bdbg = wpBackgroundGrid[y][x];
    if (bdbg) {
      const bid = (typeof bdbg === 'object') ? bdbg.id : bdbg;
      const blk = wpBlockMap[bid];
      if (blk) {
        let imgPath = blk.src;
        const isAnimated = wpAnimatedCellSet.has(`${x},${y},bg`);
        if (blk.framesPath && (isAnimated || (typeof bdbg === 'object' && bdbg.state !== undefined))) {
          let state = (typeof bdbg === 'object' && bdbg.state !== undefined) ? bdbg.state : 0;
          imgPath = `${blk.framesPath}${state}.png`;
        }

        const img = getWPImage(imgPath);
        if (img.complete && img.naturalWidth > 0) {
          const nw = img.naturalWidth;
          const nh = img.naturalHeight;
          const px = x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2;
          const py = (y + 1) * BLOCK_SIZE - nh + (blk.yOffset || 0);

          wpDrawBlockImage(wpStaticBGCtx, img, px, py, nw, nh, bdbg);
        }
      }
    }
  }

  // Foreground Block Pass
  if (pass === 'blocks' || !pass) {
    if (shouldClear) wpStaticBlockCtx.clearRect(bx, by, areaSize, areaSize);
    const bd = wpGrid[y][x];
    if (bd) {
      const bid = (typeof bd === 'object') ? bd.id : bd;
      const blk = wpBlockMap[bid];
      const isAnimated = wpAnimatedCellSet.has(`${x},${y},${(pass === 'blocks' || pass === 'shadows') ? 'fg' : 'bg'}`);
      if (blk && (!blk.framesPath || !isAnimated || (typeof bd === 'object' && bd.state !== undefined && bid !== 'spr_fg_xmas_dj_box' && bid !== 'spr_fg_gem_machine') || blk.isDirt)) {
        if (bid && !bid.includes('rainbow')) {
          let imgPath = blk.src;
          if (blk.isDirt) imgPath = getDirtSrc(blk, (bd.dirtState || 0));
          else if (typeof bd === 'object' && bd.state !== undefined && blk.framesPath) imgPath = `${blk.framesPath}${bd.state}.png`;

          const img = getWPImage(imgPath);
          if (img.complete && img.naturalWidth > 0) {
            const nw = img.naturalWidth;
            const nh = img.naturalHeight;
            const px = x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2;
            const py = (y + 1) * BLOCK_SIZE - nh + (blk.yOffset || 0);

            wpDrawBlockImage(wpStaticBlockCtx, img, px, py, nw, nh, bd);
          }
        }
      }
    }
  }

  // Shadow Pass
  if (pass === 'shadows' || !pass) {
    if (wpMultiTouchActive) return; // Locked high-fidelity refresh
    if (shouldClear) wpStaticShadowCtx.clearRect(bx, by, areaSize, areaSize);

    const bd = wpGrid[y][x]; // ONLY FOREGROUND CASTS SHADOWS
    if (bd) {
      const bid = (typeof bd === 'object') ? bd.id : bd;
      const blk = wpBlockMap[bid];
      if (blk && !blk.noShadow && blk.verticalAlign !== 'center' && blk.type !== 'background') {
        const isAnimated = wpAnimatedCellSet.has(`${x},${y},fg`);
        if (!blk.framesPath || !isAnimated || (typeof bd === 'object' && bd.state !== undefined && bid !== 'spr_fg_xmas_dj_box' && bid !== 'spr_fg_gem_machine')) {
          let imgPath = blk.src;
          if (blk.isDirt) imgPath = getDirtSrc(blk, (bd.dirtState || 0));
          else if (typeof bd === 'object' && bd.state !== undefined && blk.framesPath) imgPath = `${blk.framesPath}${bd.state}.png`;

          const img = getWPImage(imgPath);
          if (img.complete && img.naturalWidth > 0) {
            const nw = img.naturalWidth;
            const nh = img.naturalHeight;

            if (shouldClear) wpStaticShadowCtx.clearRect(bx, by, areaSize, areaSize);

            // DRAW SHADOW VIA PRE-CACHE (High Performance)
            const shadowImg = getWPShadow(imgPath);
            if (shadowImg) {
              wpStaticShadowCtx.save();
              wpStaticShadowCtx.globalAlpha = 0.4;
              const px = x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2 + shadowOffset;
              const py = (y + 1) * BLOCK_SIZE - nh + shadowOffset + (blk.yOffset || 0);
              wpDrawBlockImage(wpStaticShadowCtx, shadowImg, px, py, nw, nh, bd);
              wpStaticShadowCtx.restore();
            } else {
              // Image or shadow not ready yet, flag for a later retry
              window._wpShadowsMissing = true;
            }
          }
        }
      }
    }
  }

}

function rebuildWPStaticCache() {
  if (!wpStaticShadowCanvas) {
    wpStaticShadowCanvas = document.createElement('canvas');
    wpStaticShadowCanvas.width = WORLD_WIDTH * BLOCK_SIZE;
    wpStaticShadowCanvas.height = WORLD_HEIGHT * BLOCK_SIZE;
    wpStaticShadowCtx = wpStaticShadowCanvas.getContext('2d');
    disableWPSmoothing(wpStaticShadowCtx);
  }
  if (!wpStaticBlockCanvas) {
    wpStaticBlockCanvas = document.createElement('canvas');
    wpStaticBlockCanvas.width = WORLD_WIDTH * BLOCK_SIZE;
    wpStaticBlockCanvas.height = WORLD_HEIGHT * BLOCK_SIZE;
    wpStaticBlockCtx = wpStaticBlockCanvas.getContext('2d');
    disableWPSmoothing(wpStaticBlockCtx);
  }
  if (!wpStaticBGCanvas) {
    wpStaticBGCanvas = document.createElement('canvas');
    wpStaticBGCanvas.width = WORLD_WIDTH * BLOCK_SIZE;
    wpStaticBGCanvas.height = WORLD_HEIGHT * BLOCK_SIZE;
    wpStaticBGCanvas.classList.add('rendering-pixelated');
    wpStaticBGCtx = wpStaticBGCanvas.getContext('2d');
    disableWPSmoothing(wpStaticBGCtx);
  }

  const W = WORLD_WIDTH * BLOCK_SIZE;
  const H = WORLD_HEIGHT * BLOCK_SIZE;
  wpStaticShadowCtx.clearRect(0, 0, W, H);
  wpStaticBlockCtx.clearRect(0, 0, W, H);
  wpStaticBGCtx.clearRect(0, 0, W, H);

  // Pass 1: Background Blocks
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      updateWPStaticCacheAt(x, y, 'bg', false);
    }
  }
  // Pass 2: Foreground Shadows
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      updateWPStaticCacheAt(x, y, 'shadows', false);
    }
  }
  // Pass 3: Foreground Blocks
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      updateWPStaticCacheAt(x, y, 'blocks', false);
    }
  }
  wpStaticDirty = false;

  // BUG FIX: If some shadows were not ready (images loading), flag for a retry soon
  if (window._wpShadowsMissing) {
    setTimeout(() => {
      window._wpShadowsMissing = false;
      wpMarkStaticDirty();
    }, 1000);
  }
}

window.wpResetWorld = function (fromNetwork = false, skipConfirm = false) {
  if (skipConfirm || confirm("Reset world to default? All changes will be lost.")) {
    wpGrid = getWPDefaultGrid();

    // Also clear background layer
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      wpBackgroundGrid[y].fill(null);
    }

    // Apply tiling logic to fix tiling
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        wpUpdateTilingAt(x, y);
      }
    }
    saveWPHistory();
    saveActiveWorld();
    updateWPAnimatedCellList();
    updateWPBlockCount();
    if (!fromNetwork && typeof mpBroadcastWorldAction === "function") mpBroadcastWorldAction("reset");
    if (typeof initWPHistoryState === 'function') {
      window.wpHistory = [];
      window.wpHistoryIndex = -1;
      initWPHistoryState();
    }
    wpMarkStaticDirty();
  }
};

window.wpClearWorldOnly = function (fromNetwork = false, skipConfirm = false) {
  if (skipConfirm || confirm("Clear all blocks except the bedrock foundation?")) {
    // Clear both layers up to bedrock
    for (let y = 0; y < WORLD_HEIGHT - 5; y++) {
      wpGrid[y].fill(null);
      wpBackgroundGrid[y].fill(null);
    }
    if (!fromNetwork && typeof mpBroadcastWorldAction === 'function') mpBroadcastWorldAction('clear');
    saveWPHistory();
    saveActiveWorld();
    updateWPAnimatedCellList();
    updateWPBlockCount();
    wpMarkStaticDirty();
  }
};

function getWPDefaultGrid() {
  const grid = [];
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    grid[y] = new Array(WORLD_WIDTH).fill(null);
  }

  // 1. Bedrock foundation (bottom 5 rows)
  for (let y = WORLD_HEIGHT - 5; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      grid[y][x] = 'spr_fg_bedrock';
    }
  }

  // 2. Lava layer (3 rows above bedrock)
  for (let y = WORLD_HEIGHT - 8; y < WORLD_HEIGHT - 5; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      grid[y][x] = 'spr_fg_lava';
    }
  }

  // 3. Obsidian layer (3 rows above lava)
  for (let y = WORLD_HEIGHT - 11; y < WORLD_HEIGHT - 8; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      grid[y][x] = 'spr_fg_obsidian_block';
    }
  }

  // 4. Fill common dirt area (Adjusted for +5 height)
  for (let y = 20; y < WORLD_HEIGHT - 11; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      grid[y][x] = 'spr_fg_dirt';
    }
  }

  // 5. Place Entrance at surface (Adjusted for +5 height)
  grid[19][51] = 'spr_fg_entrance';
  grid[20][51] = 'spr_fg_bedrock';

  // 6. Scattered Stone blocks (exactly 212)
  let stonesPlaced = 0;
  const targetStones = 212;
  const dirtStartRow = 21;
  const dirtEndRow = 38;

  // Use a pseudo-random seed or just random clusters
  // Ensure we place exactly 212 stones, starting from x=1
  while (stonesPlaced < targetStones) {
    const cx = 1 + Math.floor(Math.random() * (WORLD_WIDTH - 1));
    const cy = Math.floor(Math.random() * (dirtEndRow - dirtStartRow + 1)) + dirtStartRow;

    if (grid[cy][cx] === 'spr_fg_dirt') {
      const clusterSize = Math.floor(Math.random() * 3) + 1; // Cluster of 1-3
      for (let i = 0; i < clusterSize && stonesPlaced < targetStones; i++) {
        const dx = (i === 0) ? 0 : Math.floor(Math.random() * 3) - 1;
        const dy = (i === 0) ? 0 : Math.floor(Math.random() * 3) - 1;
        const tx = cx + dx;
        const ty = cy + dy;

        if (tx >= 0 && tx < WORLD_WIDTH && ty >= dirtStartRow && ty <= dirtEndRow && grid[ty][tx] === 'spr_fg_dirt') {
          grid[ty][tx] = 'spr_fg_stone';
          stonesPlaced++;
        }
      }
    }
  }

  return grid;
}

function shouldSkipShadow(x, y, blockId) {
  return !blockId;
}

function disableWPSmoothing(ctx) {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.msImageSmoothingEnabled = false;
}

async function initWorldPlanner() {
  wpCanvas = document.getElementById('worldCanvas');
  wpCtx = wpCanvas.getContext('2d');
  disableWPSmoothing(wpCtx);

  // CRITICAL: Synchronously initialize empty 2D grids to prevent race condition crashes
  if (wpGrid.length === 0) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      wpGrid[y] = new Array(WORLD_WIDTH).fill(null);
    }
  }
  if (wpBackgroundGrid.length === 0) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      wpBackgroundGrid[y] = new Array(WORLD_WIDTH).fill(null);
    }
  }

  // CRITICAL SYNCHRONOUS HOT-FIX: Restore active theme background immediately before yielding to browser paint
  const savedThemeId = localStorage.getItem('wp_planner_theme_id') || 'bg_forest';
  const themeSrcMap = {
    bg_desert: "worldplanner/Blocks/bg_desert/bg_desert_0.png",
    bg_forest: "worldplanner/Blocks/bg_forest/bg_forest_0.png",
    bg_halloween: "worldplanner/Blocks/bg_halloween/bg_halloween_0.png",
    bg_light: "worldplanner/Blocks/bg_light/bg_light_0.png",
    bg_midnight: "worldplanner/Blocks/bg_midnight/bg_midnight_0.png",
    bg_newween: "worldplanner/Blocks/bg_newween/bg_newween_0.png",
    bg_night: "worldplanner/Blocks/bg_night/bg_night_0.png",
    bg_retro: "worldplanner/Blocks/bg_retro/bg_retro_0.png",
    bg_space: "worldplanner/Blocks/bg_space/bg_space_0.png",
    bg_spooky_new: "worldplanner/Blocks/bg_spooky_new/bg_spooky_new_0.png",
    bg_summer: "worldplanner/Blocks/bg_summer/bg_summer_0.png",
    bg_sunset: "worldplanner/Blocks/bg_sunset/bg_sunset_0.png",
    bg_valentines: "worldplanner/Blocks/bg_valentines/bg_valentines_0.png",
    bg_winter: "worldplanner/Blocks/bg_winter/bg_winter_0.png",
    bg_darkness: "worldplanner/Blocks/bg_darkness/bg_darkness_0.png"
  };
  const initialThemeSrc = themeSrcMap[savedThemeId] || "worldplanner/Blocks/bg_forest/bg_forest_0.png";
  const initialViewport = document.getElementById('wp-viewport');
  if (initialViewport) {
    initialViewport.style.setProperty('--wp-theme-bg', `url("${initialThemeSrc}")`);
    const gridBg = document.getElementById('wp-grid-bg');
    if (gridBg) {
      gridBg.style.backgroundImage = `url("${initialThemeSrc}")`;
    }
  }

  await loadWPManifest();

  // Initialize temp canvas for rainbow effect (and others)
  // Sized to viewport for correct masking
  const viewport = document.getElementById('wp-viewport');
  const viewWidth = viewport ? viewport.clientWidth : window.innerWidth;
  const viewHeight = viewport ? viewport.clientHeight : window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  wpTempCanvas = document.createElement('canvas');
  wpTempCanvas.width = viewWidth * dpr;
  wpTempCanvas.height = viewHeight * dpr;
  wpTempCtx = wpTempCanvas.getContext('2d');
  wpTempCtx.scale(dpr, dpr);
  disableWPSmoothing(wpTempCtx);

  // Initialize Shadow Staging (Used for solid dark silhouettes)
  wpShadowStagingCanvas = document.createElement('canvas');
  wpShadowStagingCanvas.width = 256; // Max block size compatibility (Palm Trees, etc.)
  wpShadowStagingCanvas.height = 256;
  wpShadowStagingCtx = wpShadowStagingCanvas.getContext('2d');
  disableWPSmoothing(wpShadowStagingCtx);

  // Initialize repeating rainbow pattern
  wpRainbowPatternCanvas = document.createElement('canvas');
  const cycleWidth = 1600; // Wider cycle for smoother transitions
  wpRainbowPatternCanvas.width = cycleWidth;
  wpRainbowPatternCanvas.height = 32;
  const rpCtx = wpRainbowPatternCanvas.getContext('2d');
  disableWPSmoothing(rpCtx);

  // Create a smoother HSL-based gradient
  const gradient = rpCtx.createLinearGradient(0, 0, cycleWidth, 0);
  for (let i = 0; i <= 10; i++) {
    const hue = (i / 10) * 360;
    gradient.addColorStop(i / 10, `hsl(${hue}, 100%, 50%)`);
  }

  rpCtx.fillStyle = gradient;
  rpCtx.fillRect(0, 0, cycleWidth, 32);
  wpRainbowPattern = wpCtx.createPattern(wpRainbowPatternCanvas, 'repeat');

  // Screen-Space Buffers (Sized to viewport for max performance)
  wpRainbowAnimatedCanvas = document.createElement('canvas');
  wpRainbowAnimatedCanvas.width = viewWidth * dpr;
  wpRainbowAnimatedCanvas.height = viewHeight * dpr;
  wpRainbowAnimatedCtx = wpRainbowAnimatedCanvas.getContext('2d');
  wpRainbowAnimatedCtx.scale(dpr, dpr);
  disableWPSmoothing(wpRainbowAnimatedCtx);

  // Main Canvas is also screen-space now
  wpCanvas.width = viewWidth * dpr;
  wpCanvas.height = viewHeight * dpr;
  // CRITICAL: Set CSS style to keep logical size for coordinate mapping
  wpCanvas.style.width = viewWidth + 'px';
  wpCanvas.style.height = viewHeight + 'px';
  wpCtx.scale(dpr, dpr);


  // Render search catalogue
  renderWPCollection();

  // Render initial inventory slots
  renderWPInventory();

  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Toolbar event listeners
  setupWPToolbarEvents();

  // Setup Backgrounds
  setupWPBackgrounds();

  // Initial transform fix
  setTimeout(() => {
    const minZoom = getWPMinZoom();
    wpZoom = minZoom;

    // Center the world in the viewport
    const viewport = document.getElementById('wp-viewport');
    if (viewport) {
      const vWidth = viewport.clientWidth;
      const vHeight = viewport.clientHeight;
      const worldWidthPx = WORLD_WIDTH * BLOCK_SIZE * wpZoom;
      const worldHeightPx = WORLD_HEIGHT * BLOCK_SIZE * wpZoom;

      wpOffsetX = (vWidth / wpZoom - WORLD_WIDTH * BLOCK_SIZE) / 2;
      wpOffsetY = (vHeight / wpZoom - WORLD_HEIGHT * BLOCK_SIZE) / 2;
    } else {
      wpOffsetX = 0;
      wpOffsetY = 0;
    }

    applyWPTransform();
    
    // Initial history state
    if (typeof window.initWPHistoryState === 'function') window.initWPHistoryState();
  }, 100);

  // Start render loop (demand-driven)
  wpScheduleFrame();
  wpStartAnimTicker();

  // Initial block count
  updateWPBlockCount();

  // Event listeners
  setupWPEvents();

  // Show tutorial if first time
  checkAndShowWPTutorial();
}

function checkAndShowWPTutorial() {
  const hasSeen = localStorage.getItem('wp_tutorial_seen_v12');
  if (!hasSeen) {
    setTimeout(() => {
      const el = document.getElementById('wp-tutorial-popup');
      if (el) {
        el.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();

        // Auto-detect platform
        const isMobile = window.innerWidth <= 768 ||
          (navigator.userAgent.match(/Android/i)) ||
          (navigator.userAgent.match(/webOS/i)) ||
          (navigator.userAgent.match(/iPhone/i)) ||
          (navigator.userAgent.match(/iPad/i)) ||
          (navigator.userAgent.match(/iPod/i)) ||
          (navigator.userAgent.match(/BlackBerry/i)) ||
          (navigator.userAgent.match(/Windows Phone/i));

        if (isMobile) {
          setWPTutorialTab('mobile');
        } else {
          setWPTutorialTab('pc');
        }
      }
    }, 1000);
  }
}

window.closeWPTutorial = function () {
  try {
    localStorage.setItem('wp_tutorial_seen_v12', 'true');
  } catch (error) {
    console.error('Failed to save tutorial state:', error);
  }
  const popupId = 'wp-tutorial-popup';
  const el = document.getElementById(popupId);
  if (el) {
    // If toggleWPPopup exists and is global, use it for consistency
    if (typeof window.toggleWPPopup === 'function') {
      window.toggleWPPopup(popupId);
    } else {
      el.classList.add('hidden');
    }
  }
};

function setupWPToolbarEvents() {
  const buttons = document.querySelectorAll('.wp-tool-btn[data-tool]');
  buttons.forEach(btn => {
    btn.onclick = () => {
      const tool = btn.getAttribute('data-tool');
      if (tool === 'blocks') {
        window.wpCatalogueThumbPick = null;
        document.getElementById('blockCatalogue').classList.toggle('hidden');
        return;
      }
      if (tool === 'visibility') {
        const header = document.querySelector('.wp-header');
        const footer = document.querySelector('.wp-footer-ui');
        const exitBtn = document.getElementById('wp-view-exit');

        header.style.display = 'none';
        footer.style.opacity = '0';
        footer.style.pointerEvents = 'none';

        if (exitBtn) {
          exitBtn.classList.remove('hidden');
        }
        return;
      }

      if (tool === 'background') {
        toggleWPPopup('wp-bg-popup');
        return;
      }

      wpCurrentTool = tool;
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (typeof window.wpCancelSelection === 'function') {
        window.wpCancelSelection();
      }
    };
  });

  // Sync initial tool
  const activeBtn = document.querySelector('.wp-tool-btn.active[data-tool]');
  if (activeBtn) wpCurrentTool = activeBtn.getAttribute('data-tool');

  // Drag to scroll on PC/Desktop for .wp-toolbar
  const toolbar = document.getElementById('wp-toolbar');
  if (toolbar) {
    let isDown = false;
    let startX;
    let scrollLeft;
    let hasDragged = false;
    let startPageX;

    toolbar.addEventListener('mousedown', (e) => {
      // Only drag with left click
      if (e.button !== 0) return;
      // Skip if clicking inputs/selectors
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      isDown = true;
      hasDragged = false;
      toolbar.classList.add('grabbing');
      startX = e.pageX - toolbar.offsetLeft;
      startPageX = e.pageX;
      scrollLeft = toolbar.scrollLeft;
    });

    toolbar.addEventListener('mouseleave', () => {
      isDown = false;
      toolbar.classList.remove('grabbing');
    });

    toolbar.addEventListener('mouseup', () => {
      isDown = false;
      toolbar.classList.remove('grabbing');
    });

    toolbar.addEventListener('mousemove', (e) => {
      if (!isDown) return;

      const deltaX = Math.abs(e.pageX - startPageX);
      if (deltaX > 5) {
        hasDragged = true;
      }

      if (hasDragged) {
        e.preventDefault();
        const x = e.pageX - toolbar.offsetLeft;
        const walk = (x - startX) * 1.5; // Drag scroll speed factor
        toolbar.scrollLeft = scrollLeft - walk;
      }
    });

    // Capture-phase click intercept to prevent selecting a tool if user dragged
    toolbar.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        hasDragged = false; // reset
      }
    }, true);
  }
}

window.toggleWPInventory = function () {
  const drawer = document.getElementById('wp-inventory-drawer');
  if (drawer) {
    drawer.classList.toggle('closed');
  }
};

function getWPMinZoom() {
  const viewport = document.getElementById('wp-viewport');
  if (!viewport) return 0.3;
  // Use clientWidth/Height to get current viewport size
  const vWidth = viewport.clientWidth - 40;
  const vHeight = viewport.clientHeight - 40;
  const cWidth = WORLD_WIDTH * BLOCK_SIZE;
  const cHeight = WORLD_HEIGHT * BLOCK_SIZE;

  // Return the smaller scale to ensure the whole 100x45 grid fits
  return Math.min(vWidth / cWidth, vHeight / cHeight);
}

function wpZoomTo(delta, mouseX, mouseY) {
  const oldZoom = wpZoom;
  const minZoom = getWPMinZoom();
  const newZoom = Math.max(minZoom, Math.min(oldZoom + delta, 3));

  if (newZoom === oldZoom) return;

  // Zoom anchoring: Keep the world position under the mouse the same
  if (mouseX !== undefined && mouseY !== undefined) {
    const rect = getWPCanvasRect();
    const localX = mouseX - rect.left;
    const localY = mouseY - rect.top;

    // World position before zoom
    const worldX = localX / oldZoom - wpOffsetX;
    const worldY = localY / oldZoom - wpOffsetY;

    wpZoom = newZoom;

    // Adjust offsets to keep worldX/worldY at the same localX/localY
    wpOffsetX = localX / wpZoom - worldX;
    wpOffsetY = localY / wpZoom - worldY;
  } else {
    wpZoom = newZoom;
  }

  applyWPTransform();
}

window.wpZoomIn = function () {
  const viewport = document.getElementById('wp-viewport');
  const centerX = viewport ? viewport.clientWidth / 2 : window.innerWidth / 2;
  const centerY = viewport ? viewport.clientHeight / 2 : window.innerHeight / 2;
  wpZoomTo(0.1, centerX, centerY);
};

window.wpZoomOut = function () {
  const viewport = document.getElementById('wp-viewport');
  const centerX = viewport ? viewport.clientWidth / 2 : window.innerWidth / 2;
  const centerY = viewport ? viewport.clientHeight / 2 : window.innerHeight / 2;
  wpZoomTo(-0.1, centerX, centerY);
};


function applyWPTransform() {
  wpMarkDirty();
}

window.wpReposition = function () {
  const minZoom = getWPMinZoom();
  wpZoom = minZoom;

  const viewport = document.getElementById('wp-viewport');
  if (viewport) {
    const vWidth = viewport.clientWidth;
    const vHeight = viewport.clientHeight;
    // Calculation matching the initialization logic
    wpOffsetX = (vWidth / wpZoom - WORLD_WIDTH * BLOCK_SIZE) / 2;
    wpOffsetY = (vHeight / wpZoom - WORLD_HEIGHT * BLOCK_SIZE) / 2;
  } else {
    wpOffsetX = 0;
    wpOffsetY = 0;
  }
  applyWPTransform();
};

// Add a resize listener to keep canvases in sync with viewport
window.addEventListener('resize', handleWPResize);
window.addEventListener('orientationchange', handleWPResize);

function handleWPResize() {
  wpCanvasCachedRect = null;
  if (wpCanvas && document.getElementById('world-planner-container').style.display !== 'none') {
    const viewport = document.getElementById('wp-viewport');
    const dpr = window.devicePixelRatio || 1;
    if (viewport) {
      // FIX: Apply DPR scaling to match initialization (lines 5354-5406)
      // Reset transform before resizing to avoid compounding scales
      wpCtx.setTransform(1, 0, 0, 1, 0, 0);
      wpCanvas.width = viewport.clientWidth * dpr;
      wpCanvas.height = viewport.clientHeight * dpr;
      wpCanvas.style.width = viewport.clientWidth + 'px';
      wpCanvas.style.height = viewport.clientHeight + 'px';
      wpCtx.scale(dpr, dpr);
      disableWPSmoothing(wpCtx);

      if (wpRainbowAnimatedCanvas) {
        wpRainbowAnimatedCtx.setTransform(1, 0, 0, 1, 0, 0);
        wpRainbowAnimatedCanvas.width = viewport.clientWidth * dpr;
        wpRainbowAnimatedCanvas.height = viewport.clientHeight * dpr;
        wpRainbowAnimatedCtx.scale(dpr, dpr);
        disableWPSmoothing(wpRainbowAnimatedCtx);
      }
      if (wpTempCanvas) {
        wpTempCtx.setTransform(1, 0, 0, 1, 0, 0);
        wpTempCanvas.width = viewport.clientWidth * dpr;
        wpTempCanvas.height = viewport.clientHeight * dpr;
        wpTempCtx.scale(dpr, dpr);
        disableWPSmoothing(wpTempCtx);
      }
    }
    wpMarkDirty();
  }
}

window.wpHistoryBaseline = null;

window.initWPHistoryState = function () {
  const deepCopyGrid = (grid) => grid.map(row => row.slice().map(cell =>
    (typeof cell === 'object' && cell !== null) ? { ...cell } : cell
  ));
  window.wpHistoryBaseline = {
    fg: deepCopyGrid(wpGrid),
    bg: deepCopyGrid(wpBackgroundGrid)
  };
};

window.wpUpdateHistoryStateSilently = function (x, y, layer, val) {
  if (!window.wpHistoryBaseline) return;
  const target = layer === 'bg' ? window.wpHistoryBaseline.bg : window.wpHistoryBaseline.fg;
  target[y][x] = (typeof val === 'object' && val !== null) ? { ...val } : val;
};

window.wpUndo = function () {
  if (wpHistoryIndex >= 0) {
    const state = wpHistory[wpHistoryIndex];
    if (state.deltas) {
      // Revert each modified block
      for (const d of state.deltas) {
        const targetGrid = d.l === 'bg' ? wpBackgroundGrid : wpGrid;
        const val = d.prev;
        targetGrid[d.y][d.x] = (typeof val === 'object' && val !== null) ? { ...val } : val;
        window.wpUpdateHistoryStateSilently(d.x, d.y, d.l, val);
        wpUpdateTilingAt(d.x, d.y);
      }
      if (typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(state.deltas, true);
    } else {
      // Legacy backwards-compatibility for old snapshot behavior before delta-rewrite
      if (state.bg) { wpGrid = JSON.parse(JSON.stringify(state.fg)); wpBackgroundGrid = JSON.parse(JSON.stringify(state.bg)); }
      else { wpGrid = JSON.parse(JSON.stringify(state)); }
      window.initWPHistoryState(); 
    }
    
    wpHistoryIndex--;
    updateWPAnimatedCellList();
    updateWPBlockCount();
    wpMarkStaticDirty();
  }
};

window.wpRedo = function () {
  if (wpHistoryIndex < wpHistory.length - 1) {
    wpHistoryIndex++;
    const state = wpHistory[wpHistoryIndex];
    if (state.deltas) {
      for (const d of state.deltas) {
        const targetGrid = d.l === 'bg' ? wpBackgroundGrid : wpGrid;
        const val = d.next;
        targetGrid[d.y][d.x] = (typeof val === 'object' && val !== null) ? { ...val } : val;
        window.wpUpdateHistoryStateSilently(d.x, d.y, d.l, val);
        wpUpdateTilingAt(d.x, d.y);
      }
      if (typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(state.deltas, false);
    } else {
      // Legacy
      if (state.bg) { wpGrid = JSON.parse(JSON.stringify(state.fg)); wpBackgroundGrid = JSON.parse(JSON.stringify(state.bg)); }
      else { wpGrid = JSON.parse(JSON.stringify(state)); }
      window.initWPHistoryState();
    }

    updateWPAnimatedCellList();
    updateWPBlockCount();
    wpMarkStaticDirty();
  }
};

function saveWPHistory() {
  if (!window.wpHistoryBaseline) window.initWPHistoryState();

  if (wpHistoryIndex < wpHistory.length - 1) {
    wpHistory.splice(wpHistoryIndex + 1);
  }

  const changes = [];
  
  // Find all deltas between Current Grid and Baseline
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      // Check FG
      const fgOld = window.wpHistoryBaseline.fg[y][x];
      const fgNew = wpGrid[y][x];
      if (JSON.stringify(fgOld) !== JSON.stringify(fgNew)) {
        changes.push({ x, y, l: 'fg', prev: fgOld, next: fgNew });
        window.wpHistoryBaseline.fg[y][x] = (typeof fgNew === 'object' && fgNew !== null) ? { ...fgNew } : fgNew;
      }
      // Check BG
      const bgOld = window.wpHistoryBaseline.bg[y][x];
      const bgNew = wpBackgroundGrid[y][x];
      if (JSON.stringify(bgOld) !== JSON.stringify(bgNew)) {
        changes.push({ x, y, l: 'bg', prev: bgOld, next: bgNew });
        window.wpHistoryBaseline.bg[y][x] = (typeof bgNew === 'object' && bgNew !== null) ? { ...bgNew } : bgNew;
      }
    }
  }

  // Only push if there are actual diffs
  if (changes.length > 0) {
    wpHistory.push({ deltas: changes });
    if (wpHistory.length > MAX_HISTORY) {
      wpHistory.shift();
    }
    wpHistoryIndex = wpHistory.length - 1;
    return changes; // Return deltas for multiplayer broadcasting
  }
  return null;
}

window.wpToggleGrid = function () {
  wpShowGrid = !wpShowGrid;
  wpMarkDirty();
};

window.wpClearWorld = function () {
  if (confirm("Are you sure you want to clear the entire world?")) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      wpGrid[y].fill(null);
    }
    saveWPHistory();
    saveActiveWorld();
    updateWPAnimatedCellList();
    updateWPBlockCount();
    wpMarkStaticDirty();
  }
};

window.wpSaveWorld = async function () {
  const data = JSON.stringify(wpGrid);
  await window.downloadFile(data, 'world_plan.json', 'application/json');
};

// VIEW MODE EXIT
window.exitWPViewMode = function () {
  const header = document.querySelector('.wp-header');
  const footer = document.querySelector('.wp-footer-ui');
  const exitBtn = document.getElementById('wp-view-exit');

  header.style.display = 'flex';
  footer.style.opacity = '1';
  footer.style.pointerEvents = 'auto';
  if (exitBtn) exitBtn.classList.add('hidden');
};

// POPUPS & BACKGROUNDS & SAVE SLOTS
window.toggleWPPopup = function (id) {
  const popup = document.getElementById(id);
  if (!popup) return;

  const isHidden = popup.classList.contains('hidden');

  // Close other popups first
  document.querySelectorAll('.wp-popup').forEach(p => p.classList.add('hidden'));

  if (isHidden) {
    popup.classList.remove('hidden');
    if (id === 'wp-save-popup') renderWPWorldSlots();
  }
};

window.saveWPWorldToSlot = saveWPWorldToSlot;
window.loadWPWorldFromSlot = loadWPWorldFromSlot;

async function saveWPWorldToSlot(slotNumber) {
  // Check if slot already has data and confirm override
  const existingData = localStorage.getItem(`wpSaveSlot_${slotNumber}`);
  if (existingData) {
    if (!confirm('This slot already has a saved world. Are you sure you want to override it?')) {
      return;
    }
  }

  const preview = await generateWPWorldPreview();
  const viewport = document.getElementById('wp-viewport');

  const saveData = {
    grid: wpGrid,
    bgGrid: wpBackgroundGrid,
    background: viewport ? viewport.style.backgroundImage : wpCanvas.style.backgroundImage,
    backgroundColor: viewport ? viewport.style.backgroundColor : wpCanvas.style.backgroundColor,
    themeId: wpCurrentTheme,
    preview: preview,
    timestamp: Date.now()
  };

  try {
    localStorage.setItem(`wpSaveSlot_${slotNumber}`, JSON.stringify(saveData));
    renderWPWorldSlots();
  } catch (error) {
    console.error('Failed to save world to slot:', error);
    alert('Storage cache is full! Please delete some other slots (character/world/thumbnails) to free up space.');
  }
}

function loadWPWorldFromSlot(slotNumber, skipToggle = false) {
  const dataStr = localStorage.getItem(`wpSaveSlot_${slotNumber}`);
  if (!dataStr) return;

  try {
    const data = JSON.parse(dataStr);
    
    // --- GRID LOADING (mirrors loadActiveWorld) ---
    let loadedGrid = data.grid || [];
    
    // Pad from TOP for saves with fewer rows
    while (loadedGrid.length < WORLD_HEIGHT) {
      const y = WORLD_HEIGHT - loadedGrid.length - 1;
      const isBedrock = y >= WORLD_HEIGHT - 5;
      loadedGrid.unshift(new Array(WORLD_WIDTH).fill(isBedrock ? 'spr_fg_bedrock' : null));
    }

    // Standardize IDs
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (!loadedGrid[y]) { loadedGrid[y] = new Array(WORLD_WIDTH).fill(null); continue; }
      // Pad row width if needed
      while (loadedGrid[y].length < WORLD_WIDTH) loadedGrid[y].push(null);
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const bd = loadedGrid[y][x];
        const bid = (typeof bd === 'object' && bd !== null) ? bd.id : bd;
        if (bid === 'bedrock') {
          if (typeof bd === 'object') loadedGrid[y][x].id = 'spr_fg_bedrock';
          else loadedGrid[y][x] = 'spr_fg_bedrock';
        }
        if (bid === 'spr_fg_dirt_0' || bid === 'dirt_0' || bid === 'dirt_1') {
          if (typeof bd === 'object') loadedGrid[y][x].id = 'spr_fg_dirt';
          else loadedGrid[y][x] = 'spr_fg_dirt';
        }
      }
    }
    wpGrid = loadedGrid;

    // --- BG GRID LOADING ---
    let loadedBGGrid = data.bgGrid || [];
    if (!loadedBGGrid || loadedBGGrid.length === 0) {
      loadedBGGrid = [];
      for (let y = 0; y < WORLD_HEIGHT; y++) loadedBGGrid[y] = new Array(WORLD_WIDTH).fill(null);
    }
    while (loadedBGGrid.length < WORLD_HEIGHT) {
      loadedBGGrid.unshift(new Array(WORLD_WIDTH).fill(null));
    }
    // Pad row widths
    for (let y = 0; y < loadedBGGrid.length; y++) {
      if (!loadedBGGrid[y]) { loadedBGGrid[y] = new Array(WORLD_WIDTH).fill(null); continue; }
      while (loadedBGGrid[y].length < WORLD_WIDTH) loadedBGGrid[y].push(null);
    }
    wpBackgroundGrid = loadedBGGrid;

    // --- THEME ---
    const viewport = document.getElementById('wp-viewport');
    if (data.themeId) {
      // Use setWPTheme to properly sync UI variables and cache state
      setWPTheme(data.themeId);
      if (viewport) {
         viewport.style.backgroundImage = ''; // Clear inline styles prioritizing
         viewport.style.backgroundColor = 'transparent';
      }
      if (typeof setupWPBackgrounds === 'function') {
        setupWPBackgrounds();
      }
    } else if (data.background && viewport) {
      viewport.style.backgroundImage = data.background;
      viewport.style.backgroundColor = data.backgroundColor || 'transparent';
      wpCurrentTheme = data.themeId || 'bg_forest';
      if (typeof setupWPBackgrounds === 'function') {
        setupWPBackgrounds();
      }
    }

    // --- APPLY TILING (critical for dirt/auto-tile blocks) ---
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        wpUpdateTilingAt(x, y);
      }
    }

    updateWPAnimatedCellList();
    updateWPBlockCount();
    saveWPHistory();
    saveActiveWorld();
    wpMarkStaticDirty();
    if (!skipToggle) toggleWPPopup('wp-save-popup');
    else {
      // Just ensure popups are closed for MP host
      document.querySelectorAll('.wp-popup').forEach(p => p.classList.add('hidden'));
    }

    // MULTIPLAYER SYNC: Broadcast the full world to all other players
    if (typeof mpActive !== 'undefined' && mpActive && typeof mpBroadcastFillAction === 'function') {
      const allChanges = [];
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
          allChanges.push({ x, y, l: 'bg', v: wpBackgroundGrid[y][x] });
          allChanges.push({ x, y, l: 'fg', v: wpGrid[y][x] });
        }
      }
      mpBroadcastFillAction(allChanges);
    }
    
    // Force a full redraw
    setTimeout(() => {
      wpDirty = true;
      wpStaticDirty = true;
    }, 50);
  } catch (e) {
    console.error('Failed to load world slot:', e);
  }
}

window.addNewWPWorldSlot = function () {
  const allSlots = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]');
  let next = 1;
  while (allSlots.includes(next)) next++;
  allSlots.push(next);
  localStorage.setItem('wpSaveSlotsList', JSON.stringify(allSlots));
  renderWPWorldSlots();
};

window.deleteWPWorldSlot = function (slot) {
  if (confirm(`Delete World Slot ${slot}?`)) {
    localStorage.removeItem(`wpSaveSlot_${slot}`);
    const allSlots = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]');
    const idx = allSlots.indexOf(slot);
    if (idx > -1) allSlots.splice(idx, 1);
    localStorage.setItem('wpSaveSlotsList', JSON.stringify(allSlots));
    renderWPWorldSlots();
  }
};

function renderWPWorldSlots() {
  const container = document.getElementById('wpSaveSlotsContainer');
  if (!container) return;

  const allSlots = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]');
  container.innerHTML = '';

  allSlots.forEach(slot => {
    const dataStr = localStorage.getItem(`wpSaveSlot_${slot}`);
    const hasData = !!dataStr;
    let preview = '';
    if (hasData) {
      preview = JSON.parse(dataStr).preview || '';
    }

    const div = document.createElement('div');
    div.className = 'wp-save-slot';
    div.innerHTML = `
      <div class="wp-save-slot-preview" style="background-image: url('${preview}')"></div>
      <div class="wp-save-slot-info">
        <div class="wp-save-slot-label">World Slot ${slot}</div>
        <div class="wp-save-slot-actions">
          <button class="wp-save-btn" onclick="saveWPWorldToSlot(${slot})">Save Current</button>
          ${hasData ? `
            <button class="wp-save-btn" style="background: #2a9d8f" onclick="loadWPWorldFromSlot(${slot})">Load</button>
            <button class="wp-save-btn" style="background: #e76f51" onclick="downloadWPWorldPNG(${slot})" title="Download PNG">
              <i data-lucide="download" style="width: 14px; height: 14px; vertical-align: middle;"></i>
            </button>
            <button class="wp-save-btn" style="background: #6c5ce7" onclick="exportWPWorldSlot(${slot})" title="Export World File">
              <i data-lucide="share-2" style="width: 14px; height: 14px; vertical-align: middle;"></i>
            </button>
          ` : ''}
        </div>
      </div>
      <button class="wp-delete-btn" onclick="deleteWPWorldSlot(${slot})" title="Delete Slot">
        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
      </button>
    `;
    container.appendChild(div);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}

// --- WORLD TRANSFER (EXPORT / IMPORT) ---

window.exportWPWorldSlot = async function(slotNumber) {
  const dataStr = localStorage.getItem(`wpSaveSlot_${slotNumber}`);
  if (!dataStr) return;

  const data = JSON.parse(dataStr);
  // Build a portable export object (exclude the preview image to keep file size small)
  const exportData = {
    _type: 'bwsp_world_v1',
    grid: data.grid,
    bgGrid: data.bgGrid,
    themeId: data.themeId || 'bg_forest',
    timestamp: data.timestamp || Date.now()
  };

  const jsonStr = JSON.stringify(exportData);
  await window.downloadFile(jsonStr, `bwsp_world_slot${slotNumber}_${Date.now()}.json`, 'application/json');
};

window.importWPWorldFile = function() {
  const input = document.getElementById('wp-world-import-input');
  if (input) input.click();
};

window.handleWPWorldImport = async function(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset input so the same file can be re-imported
  event.target.value = '';

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate structure
    if (!data.grid || !Array.isArray(data.grid)) {
      alert('Invalid world file: missing grid data.');
      return;
    }

    // Pad grid height if needed
    while (data.grid.length < WORLD_HEIGHT) {
      const y = WORLD_HEIGHT - data.grid.length - 1;
      const isBedrock = y >= WORLD_HEIGHT - 5;
      data.grid.unshift(new Array(WORLD_WIDTH).fill(isBedrock ? 'spr_fg_bedrock' : null));
    }

    // Ensure bgGrid exists and is padded
    if (!data.bgGrid || !Array.isArray(data.bgGrid)) {
      data.bgGrid = [];
      for (let y = 0; y < WORLD_HEIGHT; y++) data.bgGrid[y] = new Array(WORLD_WIDTH).fill(null);
    }
    while (data.bgGrid.length < WORLD_HEIGHT) {
      data.bgGrid.unshift(new Array(WORLD_WIDTH).fill(null));
    }

    // Standardize IDs (same as loadActiveWorld)
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (!data.grid[y]) continue;
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const bd = data.grid[y][x];
        const bid = (typeof bd === 'object' && bd !== null) ? bd.id : bd;
        if (bid === 'bedrock') {
          if (typeof bd === 'object') data.grid[y][x].id = 'spr_fg_bedrock';
          else data.grid[y][x] = 'spr_fg_bedrock';
        }
        if (bid === 'spr_fg_dirt_0' || bid === 'dirt_0' || bid === 'dirt_1') {
          if (typeof bd === 'object') data.grid[y][x].id = 'spr_fg_dirt';
          else data.grid[y][x] = 'spr_fg_dirt';
        }
      }
    }

    // --- APPLY TILING (critical for connective blocks: barrier rope, gingerbread, etc.) ---
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        if (data.grid[y] && data.grid[y][x]) {
          wpUpdateTilingAt(x, y);
        }
      }
    }

    // Create a new slot
    const allSlots = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]');
    let next = 1;
    while (allSlots.includes(next)) next++;
    allSlots.push(next);
    localStorage.setItem('wpSaveSlotsList', JSON.stringify(allSlots));

    let preview = '';
    try {
      preview = await generateWPWorldExportDataURL(data.grid, data.bgGrid, data.themeId || 'bg_forest', data.background, true);
    } catch(e) {
      console.warn('Preview generation failed for import:', e);
    }

    // Resolve theme background for the save
    let background = '';
    let backgroundColor = '';
    const themeId = data.themeId || 'bg_forest';
    const theme = wpManifestThemes.find(t => t.id === themeId);
    if (theme) {
      background = `url('${theme.src}')`;
    }

    // Save the slot
    const saveData = {
      grid: data.grid,
      bgGrid: data.bgGrid,
      background: background,
      backgroundColor: backgroundColor,
      themeId: themeId,
      preview: preview,
      timestamp: data.timestamp || Date.now()
    };
    localStorage.setItem(`wpSaveSlot_${next}`, JSON.stringify(saveData));

    renderWPWorldSlots();
    alert(`World imported successfully into Slot ${next}!`);
  } catch (e) {
    console.error('Failed to import world file:', e);
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || (e.message && e.message.toLowerCase().includes('quota')))) {
      alert('Storage cache is full! Please delete some other slots (character/world/thumbnails) to free up space.');
    } else {
      alert('Failed to import world file. Please make sure the file is a valid BreaWorlds world export.');
    }
  }
};

/**
 * Helper to generate a complete world render data URL offline.
 * @param {boolean} isThumbnail - If true, scales the output by 0.15 for save slots.
 */
async function generateWPWorldExportDataURL(gridData, bgGridData, baseThemeId, baseBackground, isThumbnail = false) {
  // Create a high-res canvas for the whole world
  const exportCanvas = document.createElement('canvas');
  const scale = isThumbnail ? 0.15 : 1;
  exportCanvas.width = WORLD_WIDTH * BLOCK_SIZE * scale;
  exportCanvas.height = WORLD_HEIGHT * BLOCK_SIZE * scale;
  const eCtx = exportCanvas.getContext('2d');
  eCtx.imageSmoothingEnabled = false;

  // 1. Resolve Theme
  const themeId = baseThemeId || wpCurrentTheme;
  const theme = wpManifestThemes.find(t => t.id === themeId);

  // 2. Gather ALL unique image paths needed for this world
  const imageUrls = new Set();

  // Theme BG
  if (theme) imageUrls.add(theme.src);
  else if (baseBackground && baseBackground !== 'none') {
    const bgMatch = baseBackground.match(/url\(['"]?([^'"]+)['"]?\)/);
    if (bgMatch) imageUrls.add(bgMatch[1]);
  }

  const getPath = (bd, blk, x, y, layer) => {
    if (!blk) return null;
    let path = blk.src;

    // Fluid check (Water, Acid, Mud)
    const bid = typeof bd === 'object' ? bd.id : bd;
    const isFluid = bid === 'spr_fg_water_block' || bid === 'spr_fg_acid_block' || bid === 'spr_fg_mud_block';

    if (isFluid && (typeof bd !== 'object' || bd.state === undefined)) {
      const grid = layer === 'fg' ? gridData : bgGridData;
      const blockAbove = (y > 0) ? grid[y - 1][x] : null;
      const bidAbove = (typeof blockAbove === 'object' && blockAbove !== null) ? blockAbove.id : blockAbove;
      const isSameFluidAbove = (bidAbove === bid);
      const start = blk.frameStart || 0;
      const frameIndex = isSameFluidAbove ? (start + 4) : start;
      path = `${blk.framesPath}${frameIndex}.png`;
    }
    else if (blk.framesPath && (typeof bd !== 'object' || bd.state === undefined)) {
      const fs = blk.frameStart || 0;
      path = `${blk.framesPath}${fs}.png`;
    }
    else if (blk.isDirt) path = getDirtSrc(blk, (bd.dirtState || 0));
    else if (typeof bd === 'object' && bd.state !== undefined && blk.framesPath) path = `${blk.framesPath}${bd.state}.png`;
    return path;
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (!gridData[y]) continue;
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const bd = gridData[y][x];
      const bg = bgGridData[y] ? bgGridData[y][x] : null;
      if (bd) {
        const p = getPath(bd, wpBlockMap[typeof bd === 'object' ? bd.id : bd], x, y, 'fg');
        if (p) imageUrls.add(p);
      }
      if (bg) {
        const p = getPath(bg, wpBlockMap[typeof bg === 'object' ? bg.id : bg], x, y, 'bg');
        if (p) imageUrls.add(p);
      }
    }
  }

  // 3. Pre-load ALL images in parallel
  const imageCache = {};
  await Promise.allSettled(Array.from(imageUrls).map(async (url) => {
    try {
      imageCache[url] = await loadImage(url);
    } catch (e) {
      console.warn("Pre-load fail:", url, e);
    }
  }));

  // 4. Draw Background (Stretched)
  if (theme && imageCache[theme.src]) {
    const bgImg = imageCache[theme.src];
    eCtx.drawImage(bgImg, 0, 0, exportCanvas.width, exportCanvas.height);
  } else if (baseBackground && baseBackground !== 'none') {
    const bgMatch = baseBackground.match(/url\(['"]?([^'"]+)['"]?\)/);
    if (bgMatch && imageCache[bgMatch[1]]) {
      const bgImg = imageCache[bgMatch[1]];
      eCtx.drawImage(bgImg, 0, 0, exportCanvas.width, exportCanvas.height);
    }
  } else {
    eCtx.fillStyle = '#0a0a1a';
    eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  // 5. Three-Pass Drawing (matches live renderer layer order: BG → Shadows → FG)
  const shadowAlpha = 0.4, shadowOffset = 4 * scale;
  const rainbowMaskCanvas = document.createElement('canvas');
  rainbowMaskCanvas.width = exportCanvas.width;
  rainbowMaskCanvas.height = exportCanvas.height;
  const rmCtx = rainbowMaskCanvas.getContext('2d');
  disableWPSmoothing(rmCtx);
  let hasRainbow = false;

  // Helper to draw a block at position
  const drawBlock = (bd, blk, x, y, layerName) => {
    const bid = typeof bd === 'object' ? bd.id : bd;
    const isRainbow = bid && bid.includes('rainbow');
    const path = getPath(bd, blk, x, y, layerName);
    const img = imageCache[path];
    if (img) {
      const nw = img.naturalWidth, nh = img.naturalHeight;
      const px = x * BLOCK_SIZE * scale + (BLOCK_SIZE - nw) / 2 * scale;
      let py = (blk.verticalAlign === 'center') ? (y * BLOCK_SIZE * scale + (BLOCK_SIZE - nh) / 2 * scale) : ((y + 1) * BLOCK_SIZE * scale - nh * scale + (blk.yOffset || 0) * scale);
      eCtx.drawImage(img, px, py, nw * scale, nh * scale);
      if (isRainbow) {
        hasRainbow = true;
        rmCtx.drawImage(img, px, py, nw * scale, nh * scale);
      }
    }
  };

  // Pass 1: All Background Blocks
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (!bgGridData[y]) continue;
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const bd = bgGridData[y][x];
      if (!bd) continue;
      const blk = wpBlockMap[typeof bd === 'object' ? bd.id : bd];
      if (blk) drawBlock(bd, blk, x, y, 'bg');
    }
  }

  // Pass 2: All Foreground Shadows
  // Fix: ensure the staging canvas exists before drawing
  if (!wpShadowStagingCanvas) {
    wpShadowStagingCanvas = document.createElement('canvas');
    wpShadowStagingCanvas.width = 256;
    wpShadowStagingCanvas.height = 256;
    wpShadowStagingCtx = wpShadowStagingCanvas.getContext('2d');
  }
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (!gridData[y]) continue;
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const bdFG = gridData[y][x];
      if (!bdFG) continue;
      const blk = wpBlockMap[typeof bdFG === 'object' ? bdFG.id : bdFG];
      if (!blk || blk.noShadow || blk.verticalAlign === 'center') continue;
      const path = getPath(bdFG, blk, x, y, 'fg');
      const img = imageCache[path];
      if (!img) continue;
      const nw = img.naturalWidth, nh = img.naturalHeight;

      // DRAW SHADOW VIA STAGING (Fixes iOS coloring)
      wpShadowStagingCtx.clearRect(0, 0, 256, 256);
      wpShadowStagingCtx.drawImage(img, 0, 0);
      wpShadowStagingCtx.globalCompositeOperation = 'source-in';
      wpShadowStagingCtx.fillStyle = 'black';
      wpShadowStagingCtx.fillRect(0, 0, nw, nh);
      wpShadowStagingCtx.globalCompositeOperation = 'source-over';

      eCtx.save();
      eCtx.globalAlpha = shadowAlpha;
      const px = x * BLOCK_SIZE * scale + (BLOCK_SIZE - nw) / 2 * scale + shadowOffset + (blk.xOffset || 0) * scale;
      const py = (y + 1) * BLOCK_SIZE * scale - nh * scale + shadowOffset + (blk.yOffset || 0) * scale;
      eCtx.drawImage(wpShadowStagingCanvas, 0, 0, nw, nh, px, py, nw * scale, nh * scale);
      eCtx.restore();
    }
  }

  // Pass 3: All Foreground Blocks
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (!gridData[y]) continue;
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const bd = gridData[y][x];
      if (!bd) continue;
      const blk = wpBlockMap[typeof bd === 'object' ? bd.id : bd];
      if (blk) drawBlock(bd, blk, x, y, 'fg');
    }
  }

  // 6. Apply Rainbow Effect to Export
  if (hasRainbow) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = exportCanvas.width;
    tempCanvas.height = exportCanvas.height;
    const tCtx = tempCanvas.getContext('2d');
    disableWPSmoothing(tCtx);

    const pattern = tCtx.createPattern(wpRainbowPatternCanvas, 'repeat');
    if (scale !== 1) {
      // Scale pattern matrix
      const matrix = new DOMMatrix().scale(scale, scale);
      pattern.setTransform(matrix);
    }
    tCtx.fillStyle = pattern;
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(rainbowMaskCanvas, 0, 0);

    eCtx.save();
    eCtx.globalCompositeOperation = 'multiply';
    eCtx.drawImage(tempCanvas, 0, 0);
    eCtx.restore();
  }

  return exportCanvas.toDataURL('image/png');
}

/**
 * Downloads the world from a specific slot as a PNG image.
 */
window.downloadWPWorldPNG = async function (slotNumber) {
  const dataStr = localStorage.getItem(`wpSaveSlot_${slotNumber}`);
  if (!dataStr) return;

  const data = JSON.parse(dataStr);
  const background = data.background;

  const url = await generateWPWorldExportDataURL(data.grid || [], data.bgGrid || [], data.themeId, background, false);
  if (!url) return;

  await window.downloadFile(url, `world_export_slot${slotNumber}.png`, 'image/png');
};

async function generateWPWorldPreview() {
  const offCanvas = document.createElement('canvas');
  const worldWidth = WORLD_WIDTH * BLOCK_SIZE;
  const worldHeight = WORLD_HEIGHT * BLOCK_SIZE;
  const scale = 0.15;
  offCanvas.width = worldWidth * scale;
  offCanvas.height = worldHeight * scale;
  const offCtx = offCanvas.getContext('2d');
  offCtx.imageSmoothingEnabled = false;

  // 1. Resolve Theme & Gather necessary images
  let bgUrl = null;
  if (wpCurrentTheme) {
    const theme = wpManifestThemes.find(t => t.id === wpCurrentTheme);
    if (theme) bgUrl = theme.src;
  }
  if (!bgUrl) {
    const viewport = document.getElementById('wp-viewport');
    const background = viewport ? (viewport.style.backgroundImage || viewport.style.getPropertyValue('--wp-theme-bg')) : '';
    const bgMatch = background.match(/url\(['"]?([^'"]+)['"]?\)/);
    if (bgMatch) bgUrl = bgMatch[1];
  }

  const imageUrls = new Set();
  if (bgUrl) imageUrls.add(bgUrl);

  // Animated blocks (first frame) + rainbow blocks
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      [wpGrid, wpBackgroundGrid].forEach(grid => {
        const bd = grid[y][x];
        if (!bd) return;
        const bid = (typeof bd === 'object') ? bd.id : bd;
        const blk = wpBlockMap[bid];
        const isRainbow = bid && bid.includes('rainbow');

        // Preload rainbow blocks OR animated blocks
        if (isRainbow && blk) {
          imageUrls.add(blk.src);
        } else if (blk && blk.framesPath && (typeof bd !== 'object' || bd.state === undefined)) {
          const fs = blk.frameStart || 0;
          imageUrls.add(`${blk.framesPath}${fs}.png`);
        }
      });
    }
  }

  // 2. Load all in parallel
  const cache = {};
  await Promise.allSettled(Array.from(imageUrls).map(async url => {
    try { cache[url] = await loadImage(url); } catch (e) { }
  }));

  try {
    // 3. Draw Background (Stretched)
    if (bgUrl && cache[bgUrl]) {
      offCtx.drawImage(cache[bgUrl], 0, 0, offCanvas.width, offCanvas.height);
    } else {
      offCtx.fillStyle = '#0a0a1a';
      offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
    }

    // 4. Static Layers
    offCtx.save();
    offCtx.scale(scale, scale);
    if (wpStaticBGCanvas) offCtx.drawImage(wpStaticBGCanvas, 0, 0);
    if (wpStaticShadowCanvas) offCtx.drawImage(wpStaticShadowCanvas, 0, 0);
    if (wpStaticBlockCanvas) offCtx.drawImage(wpStaticBlockCanvas, 0, 0);
    offCtx.restore();

    // 5. Animated Layers (Synchronous using cache) - includes rainbow blocks
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        [wpGrid, wpBackgroundGrid].forEach(grid => {
          const bd = grid[y][x];
          if (!bd) return;
          const bid = (typeof bd === 'object') ? bd.id : bd;
          const blk = wpBlockMap[bid];
          const isRainbow = bid && bid.includes('rainbow');

          // Draw animated blocks OR rainbow blocks
          if ((blk && blk.framesPath && (typeof bd !== 'object' || bd.state === undefined)) || isRainbow) {
            let path, img;

            if (isRainbow) {
              // Rainbow blocks use their base image
              path = blk.src;
              img = cache[path];
            } else {
              // Regular animated blocks use first frame
              const fs = blk.frameStart || 0;
              path = `${blk.framesPath}${fs}.png`;
              img = cache[path];
            }

            if (img) {
              const nw = img.naturalWidth, nh = img.naturalHeight;
              const px = (x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2 + (blk.xOffset || 0)) * scale;
              const py = (blk.verticalAlign === 'center') ?
                (y * BLOCK_SIZE + (BLOCK_SIZE - nh) / 2) * scale :
                ((y + 1) * BLOCK_SIZE - nh + (blk.yOffset || 0)) * scale;
              offCtx.drawImage(img, px, py, nw * scale, nh * scale);

              // Add rainbow overlay for rainbow blocks in preview (multiply blend)
              if (isRainbow) {
                const hue = ((x + y * 0.5) * 10) % 360;
                offCtx.save();
                offCtx.globalCompositeOperation = 'multiply';
                offCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                offCtx.fillRect(px, py, nw * scale, nh * scale);
                offCtx.restore();
              }
            }
          }
        });
      }
    }
    return offCanvas.toDataURL('image/webp', 0.8);
  } catch (e) {
    console.warn("High-fidelity preview blocked (Tainted Canvas), falling back to solid colors", e);
    // (Solid color fallback logic remains as is, but updated for object support)
    offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
    offCtx.fillStyle = '#0a0a1a';
    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const blockData = wpGrid[y][x];
        if (blockData) {
          const blockId = (typeof blockData === 'object' && blockData !== null) ? blockData.id : blockData;
          offCtx.fillStyle = '#8e44ad'; // Default purple
          offCtx.fillRect(x * BLOCK_SIZE * scale, y * BLOCK_SIZE * scale, BLOCK_SIZE * scale, BLOCK_SIZE * scale);
        }
      }
    }
    return offCanvas.toDataURL();
  }
}

function setupWPBackgrounds() {
  const list = document.getElementById('wp-bg-list');
  if (!list) return;

  // Use ONLY themes from the manifest as requested
  const bgs = wpManifestThemes.map(t => ({
    id: t.id,
    name: t.name,
    src: t.src
  }));

  list.innerHTML = '';
  bgs.forEach(bg => {
    const item = document.createElement('div');
    item.className = 'wp-bg-item';
    if (wpCurrentTheme === bg.id) item.classList.add('active');

    const img = document.createElement('img');
    img.src = bg.src;
    img.alt = bg.name;
    item.appendChild(img);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'wp-cat-name'; // Consistent with block catalogue naming style or dedicated span
    nameSpan.textContent = bg.name;
    item.appendChild(nameSpan);

    item.onclick = () => {
      document.querySelectorAll('.wp-bg-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      setWPTheme(bg.id);
      saveActiveWorld();
    };
    list.appendChild(item);
  });
}

function setupWPEvents() {
  // Track which mouse button is being held for panning
  let wpRightMouseDown = false;

  wpCanvas.onmousedown = (e) => {
    wpCanvasCachedRect = null;
    document.body.classList.add('wp-dragging');
    wpLastGridX = -1;
    wpLastGridY = -1;
    if (e.button === 1) {
      e.preventDefault();
      pickWPBlock(e);
      return;
    }
    if (e.button === 2) {
      // Right-click always pans, regardless of tool
      e.preventDefault();
      wpRightMouseDown = true;
      isPanning = true;
      wpIsPanningActive = true;
      return;
    }
    if (wpCurrentTool === 'move' && e.button === 0) {
      isPanning = true;
      wpIsPanningActive = true;
      return;
    }
    if (e.button === 0) {
      e.preventDefault();
      const rect = getWPCanvasRect();
      const canvasMouseX = (e.clientX - rect.left) / wpZoom - wpOffsetX;
      const canvasMouseY = (e.clientY - rect.top) / wpZoom - wpOffsetY;
      const x = Math.floor(canvasMouseX / BLOCK_SIZE);
      const y = Math.floor(canvasMouseY / BLOCK_SIZE);

      // --- SELECT TOOL ---
      if (wpCurrentTool === 'select') {
        if (wpPasteMode) {
          if (wpClipboardData) {
            if (wpSelectionBox && x >= wpSelectionBox.x && x < wpSelectionBox.x + wpSelectionBox.w && y >= wpSelectionBox.y && y < wpSelectionBox.y + wpSelectionBox.h) {
              wpSelectionStartX = x; wpSelectionStartY = y;
              wpSelectionMoving = true;
              hideWPSelectionMenu();
            } else {
              wpSelectionBox = { x: x, y: y, w: wpClipboardWidth, h: wpClipboardHeight };
              wpCopiedData = JSON.parse(JSON.stringify(wpClipboardData));
              wpSelectionStartX = x; wpSelectionStartY = y;
              wpSelectionEndX = x; wpSelectionEndY = y;
              showWPSelectionMenu();
              wpMarkDirty();
            }
          }
          return;
        }

        if (wpSelectionBox && x >= wpSelectionBox.x && x < wpSelectionBox.x + wpSelectionBox.w && y >= wpSelectionBox.y && y < wpSelectionBox.y + wpSelectionBox.h) {
          wpSelectionStartX = x;
          wpSelectionStartY = y;
          wpSelectionMoving = true;
          if (!wpCopiedData) wpCopySelectionToDragBuffer(true);
          hideWPSelectionMenu();
          return;
        } else {
          if (wpSelectionBox && wpCopiedData && !wpPasteMode) {
            wpDropSelectionBuffer();
            if (typeof window.mpBroadcastSelectionEnd === 'function') {
                window.mpBroadcastSelectionEnd();
            }
            saveWPHistory(); // GUARANTEE HISTORY SAVE ON DROP!
            wpNeedsPostProcess = true;
          }
          wpSelectionStartX = x;
          wpSelectionStartY = y;
          wpSelectionEndX = x;
          wpSelectionEndY = y;
          wpSelectionBox = null;
          wpCopiedData = null;
          wpSelectionMoving = false;
          hideWPSelectionMenu();
          wpMarkDirty();
          // We don't set isPainting=true here, because clicking away handles just dropping the selection.
          // Wait, if we click ON an empty block, we might want to start drawing a new selection rectangle?
          // Yes, setting wpSelectionStartX/Y starts the selection rectangle. We SHOULD set isPainting = true so mousemove tracks the drag.
          isPainting = true;
          return;
        }
      }

      // --- FILL TOOL ---
      if (wpCurrentTool === 'fill') {
        if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
          wpExecuteFloodFill(x, y);
        }
        return;
      }

      isPainting = true;

      // Smart Erase Check: If starting on a matching block, activate Smart Erase Mode
      if (wpCurrentTool === 'pencil') {
        if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
          const newBlock = wpBlockMap[wpSelectedBlockId];
          if (newBlock) {
            const isBg = newBlock.type === 'background';
            const targetGrid = isBg ? wpBackgroundGrid : wpGrid;
            const currentData = targetGrid[y][x];
            const currentId = (typeof currentData === 'object' && currentData !== null) ? currentData.id : currentData;

            if (currentId === wpSelectedBlockId) {
              isSmartEraserMode = true;
            }
          }
        }
      }
    }
    handleWPInteraction(e);
  };

  // Centralized mouseup handler Ã¢â‚¬â€  runs on document to catch releases outside canvas
  function wpHandleMouseUp(e) {
    // If right mouse was released, clear panning
    if (e && e.button === 2) {
      wpRightMouseDown = false;
    }

    isSmartEraserMode = false; // Reset Smart Erase Mode
    wpEraserTargetLayer = null; // Reset Eraser Layer Lock

    if (wpCurrentTool === 'select' && (isPainting || wpSelectionMoving)) {
      if (wpSelectionMoving) {
        if (wpSelectionBox) {
          wpSelectionBox.x += (wpSelectionEndX - wpSelectionStartX);
          wpSelectionBox.y += (wpSelectionEndY - wpSelectionStartY);
          wpSelectionStartX = wpSelectionBox.x;
          wpSelectionEndX = wpSelectionBox.x;
          wpSelectionStartY = wpSelectionBox.y;
          wpSelectionEndY = wpSelectionBox.y;
        }
        wpSelectionMoving = false;
        showWPSelectionMenu();
        wpNeedsPostProcess = true;
      } else {
        if (wpSelectionStartX !== -1 && wpSelectionEndX !== -1) {
          const x1 = Math.min(wpSelectionStartX, wpSelectionEndX);
          const y1 = Math.min(wpSelectionStartY, wpSelectionEndY);
          const x2 = Math.max(wpSelectionStartX, wpSelectionEndX);
          const y2 = Math.max(wpSelectionStartY, wpSelectionEndY);
          
          if (x2 >= x1 && y2 >= y1) {
            wpSelectionBox = { 
              x: Math.max(0, x1), 
              y: Math.max(0, y1), 
              w: Math.min(WORLD_WIDTH - 1, x2) - Math.max(0, x1) + 1, 
              h: Math.min(WORLD_HEIGHT - 1, y2) - Math.max(0, y1) + 1 
            };
            showWPSelectionMenu();
          } else {
            wpSelectionBox = null;
          }
        }
      }
      isPainting = false;
      wpMarkDirty();
    }

    if (isPainting || isErasing) {
      // Defer heavy history and save operations to prevent UI freeze
      setTimeout(() => {
        saveWPHistory();
        if (wpNeedsPostProcess) {
          saveActiveWorld();
          updateWPBlockCount();
          renderWPInventory();
          wpNeedsPostProcess = false;
        }
      }, 10);
    }
    isPainting = false;
    isErasing = false;
    isPanning = false;
    if (wpIsPanningActive) {
      wpIsPanningActive = false;
      wpMarkDirty(); // Final full-quality redraw with animations
    }
    document.body.classList.remove('wp-dragging');
  }

  // Use both window.onmouseup and document listener for maximum reliability
  window.onmouseup = wpHandleMouseUp;
  document.addEventListener('mouseup', wpHandleMouseUp);

  window.wpLastMouseX = 0;
  window.wpLastMouseY = 0;

  window.wpUpdateCoordsDisplay = function(clientX, clientY, rect) {
    const coordsDiv = document.getElementById('wp-coords-display');
    if (!coordsDiv) return;
    
    // Only show if world planner is active
    const wpContainer = document.getElementById('world-planner-container');
    if (!wpContainer || wpContainer.style.display === 'none') {
      coordsDiv.style.display = 'none';
      return;
    }

    if (!rect) rect = getWPCanvasRect();
    const worldX = (clientX - rect.left) / wpZoom - wpOffsetX;
    const worldY = (clientY - rect.top) / wpZoom - wpOffsetY;
    const gridX = Math.floor(worldX / BLOCK_SIZE);
    const gridY = Math.floor(worldY / BLOCK_SIZE);
    
    if (gridX >= 0 && gridX < WORLD_WIDTH && gridY >= 0 && gridY < WORLD_HEIGHT) {
      coordsDiv.style.display = 'block';
      coordsDiv.textContent = `${gridX}, ${gridY}`;
    } else {
      coordsDiv.style.display = 'none';
    }
  };

  wpCanvas.onmousemove = (e) => {
    const rect = getWPCanvasRect();
    window.wpLastMouseX = (e.clientX - rect.left) / wpZoom - wpOffsetX;
    window.wpLastMouseY = (e.clientY - rect.top) / wpZoom - wpOffsetY;
    wpUpdateCoordsDisplay(e.clientX, e.clientY, rect);

    if (typeof mpSendCursorPosition === 'function') {
      mpSendCursorPosition(window.wpLastMouseX, window.wpLastMouseY);
    }

    // Safety guard: if no mouse buttons are pressed, force-reset panning/painting
    // This prevents the "stuck panning" bug when mouseup is missed (e.g. right-click)
    if (e.buttons === 0) {
      if (isPanning || wpRightMouseDown) {
        isPanning = false;
        wpRightMouseDown = false;
        if (wpIsPanningActive) {
          wpIsPanningActive = false;
          wpMarkDirty();
        }
      }
      return;
    }

    if (isPanning) {
      wpOffsetX += e.movementX / wpZoom;
      wpOffsetY += e.movementY / wpZoom;
      // Coalesce pan redraws: only trigger one redraw per animation frame
      if (!wpPanPending) {
        wpPanPending = true;
        requestAnimationFrame(() => {
          wpPanPending = false;
          applyWPTransform();
        });
      }
      return;
    }
    handleWPInteraction(e);
  };

  wpCanvas.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05; // Even slower wheel zoom
    wpZoomTo(delta, e.clientX, e.clientY);
  };

  // --- MOBILE TOUCH SUPPORT ---
  let lastPinchDist = 0;
  let wpTouchTimer = null;
  let wpTouchStartX = 0;
  let wpTouchStartY = 0;
  let wpTouchDidMove = false;

  wpCanvas.addEventListener('touchstart', (e) => {
    wpCanvasCachedRect = null;
    e.preventDefault();
    wpTouchActive = true;
    wpTouchDidMove = false;

    // Reset timer on new touch
    if (wpTouchTimer) clearTimeout(wpTouchTimer);

    if (e.touches.length === 1) {
      // Single finger: Potential Long Press for Pick Block
      wpTouchStartX = e.touches[0].clientX;
      wpTouchStartY = e.touches[0].clientY;
      wpUpdateCoordsDisplay(e.touches[0].clientX, e.touches[0].clientY);

      wpTouchTimer = setTimeout(() => {
        // Long Press Triggered!
        pickWPBlock({ clientX: wpTouchStartX, clientY: wpTouchStartY });
        // Optional: Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);
        // Cancel painting action that might have started
        isPainting = false;
        isErasing = false;
        wpTouchTimer = null;
      }, 500); // 500ms hold
    }

    if (e.touches.length > 1) {
      if (wpTouchTimer) clearTimeout(wpTouchTimer); // Cancel long press
      isPanning = false;
      isPainting = false;
      isErasing = false;
      wpSelectionMoving = false;
      wpMultiTouchActive = true; // LOCK ON
      wpLastGridX = -1; wpLastGridY = -1; // Wipe coordinate history to prevent "jumps"

      lastPinchDist = 0; // Reset pinch state
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      lastPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      wpLastTouchX = (t1.clientX + t2.clientX) / 2;
      wpLastTouchY = (t1.clientY + t2.clientY) / 2;
    } else if (e.touches.length === 1) {
      lastPinchDist = 0;
      wpLastGridX = -1; wpLastGridY = -1; // Reset on every new stroke
      if (wpCurrentTool === 'move') {
        isPanning = true;
        wpIsPanningActive = true;
      } else {
        const rect = getWPCanvasRect();
        const canvasTouchX = (e.touches[0].clientX - rect.left) / wpZoom - wpOffsetX;
        const canvasTouchY = (e.touches[0].clientY - rect.top) / wpZoom - wpOffsetY;
        const x = Math.floor(canvasTouchX / BLOCK_SIZE);
        const y = Math.floor(canvasTouchY / BLOCK_SIZE);

        if (typeof mpSendCursorPosition === 'function') {
          mpSendCursorPosition(canvasTouchX, canvasTouchY);
        }

        if (wpCurrentTool === 'select') {
          if (wpPasteMode) {
            if (wpClipboardData) {
              if (wpSelectionBox && x >= wpSelectionBox.x && x < wpSelectionBox.x + wpSelectionBox.w && y >= wpSelectionBox.y && y < wpSelectionBox.y + wpSelectionBox.h) {
                wpSelectionStartX = x; wpSelectionStartY = y;
                wpSelectionMoving = true;
                hideWPSelectionMenu();
              } else {
                wpSelectionBox = { x: x, y: y, w: wpClipboardWidth, h: wpClipboardHeight };
                wpCopiedData = JSON.parse(JSON.stringify(wpClipboardData));
                wpSelectionStartX = x; wpSelectionStartY = y;
                wpSelectionEndX = x; wpSelectionEndY = y;
                showWPSelectionMenu();
                wpMarkDirty();
              }
            }
            wpLastTouchX = e.touches[0].clientX;
            wpLastTouchY = e.touches[0].clientY;
            return;
          }

          if (wpSelectionBox && x >= wpSelectionBox.x && x < wpSelectionBox.x + wpSelectionBox.w && y >= wpSelectionBox.y && y < wpSelectionBox.y + wpSelectionBox.h) {
            wpSelectionStartX = x;
            wpSelectionStartY = y;
            wpSelectionMoving = true;
            if (!wpCopiedData) wpCopySelectionToDragBuffer(true);
            hideWPSelectionMenu();
          } else {
            if (wpSelectionBox && wpCopiedData && !wpPasteMode) {
              wpDropSelectionBuffer();
              saveWPHistory(); // GUARANTEE HISTORY SAVE ON DROP!
              wpNeedsPostProcess = true;
            }
            wpSelectionStartX = x;
            wpSelectionStartY = y;
            wpSelectionEndX = x;
            wpSelectionEndY = y;
            wpSelectionBox = null;
            wpCopiedData = null;
            wpSelectionMoving = false;
            hideWPSelectionMenu();
            wpMarkDirty();
            isPainting = true;
          }
          wpLastTouchX = e.touches[0].clientX;
          wpLastTouchY = e.touches[0].clientY;
          return;
        }

        // --- FILL TOOL ---
        if (wpCurrentTool === 'fill') {
          if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
            wpExecuteFloodFill(x, y);
          }
          wpLastTouchX = e.touches[0].clientX;
          wpLastTouchY = e.touches[0].clientY;
          return;
        }


        // Smart Erase Check: If starting on a matching block, activate Smart Erase Mode
        if (wpCurrentTool === 'pencil') {
          if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
            const newBlock = wpBlockMap[wpSelectedBlockId];
            if (newBlock) {
              const isBg = newBlock.type === 'background';
              const targetGrid = isBg ? wpBackgroundGrid : wpGrid;
              const currentData = targetGrid[y][x];
              const currentId = (typeof currentData === 'object' && currentData !== null) ? currentData.id : currentData;

              if (currentId === wpSelectedBlockId) {
                isSmartEraserMode = true;
              }
            }
          }
        }
        // Start painting (will be completed on touchmove or touchend if no movement)
        isPainting = true;
      }
      wpLastTouchX = e.touches[0].clientX;
      wpLastTouchY = e.touches[0].clientY;
    }
  }, { passive: false });

  wpCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling

    // Check for movement threshold to cancel long press
    if (wpTouchTimer && e.touches.length === 1) {
      const moveX = Math.abs(e.touches[0].clientX - wpTouchStartX);
      const moveY = Math.abs(e.touches[0].clientY - wpTouchStartY);
      if (moveX > 10 || moveY > 10) {
        wpTouchDidMove = true;
        clearTimeout(wpTouchTimer);
        wpTouchTimer = null;
      }
    }

    if (e.touches.length === 1) {
      wpUpdateCoordsDisplay(e.touches[0].clientX, e.touches[0].clientY);
    }

    if (e.touches.length >= 2) {
      wpMultiTouchActive = true;
      isPanning = false;
      isPainting = false;
      isErasing = false;
      wpSelectionMoving = false;

      // Pinch to Zoom AND Move
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const centerX = (t1.clientX + t2.clientX) / 2;
      const centerY = (t1.clientY + t2.clientY) / 2;

      // Pan while Pinching (rAF coalesced)
      if (wpLastTouchX !== undefined && wpLastTouchY !== undefined) {
        wpOffsetX += (centerX - wpLastTouchX) / wpZoom;
        wpOffsetY += (centerY - wpLastTouchY) / wpZoom;
        if (!wpPanPending) {
          wpPanPending = true;
          requestAnimationFrame(() => {
            wpPanPending = false;
            applyWPTransform();
          });
        }
      }
      wpLastTouchX = centerX;
      wpLastTouchY = centerY;

      if (lastPinchDist > 0) {
        const delta = (dist - lastPinchDist) / 300;
        wpZoomTo(delta, centerX, centerY);
      }
      lastPinchDist = dist;
    } else if (e.touches.length === 1) {
      if (isPanning) {
        const touch = e.touches[0];
        if (wpLastTouchX !== undefined && wpLastTouchY !== undefined) {
          wpOffsetX += (touch.clientX - wpLastTouchX) / wpZoom;
          wpOffsetY += (touch.clientY - wpLastTouchY) / wpZoom;
          // Coalesce pan redraws
          if (!wpPanPending) {
            wpPanPending = true;
            requestAnimationFrame(() => {
              wpPanPending = false;
              applyWPTransform();
            });
          }
        }
        wpLastTouchX = touch.clientX;
        wpLastTouchY = touch.clientY;
      } else if (isPainting || wpSelectionMoving) {
        // Paint while moving
        handleWPInteraction(e.touches[0]);
      }
      
      if (typeof mpSendCursorPosition === 'function') {
        const rect = getWPCanvasRect();
        const touch = e.touches[0];
        const cx = (touch.clientX - rect.left) / wpZoom - wpOffsetX;
        const cy = (touch.clientY - rect.top) / wpZoom - wpOffsetY;
        mpSendCursorPosition(cx, cy);
      }
    }
  }, { passive: false });

  wpCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (e.touches.length < 2) lastPinchDist = 0;
    if (e.touches.length === 0) {
      wpMultiTouchActive = false; // UNLOCK
      wpTouchActive = false;

      // If no movement occurred and long press didn't trigger, do a single paint action
      if (!wpTouchDidMove && wpTouchTimer !== null && isPainting) {
        clearTimeout(wpTouchTimer);
        wpTouchTimer = null;
        handleWPInteraction({ clientX: wpTouchStartX, clientY: wpTouchStartY });
      }

      // Trigger mouseup-style cleanup
      window.onmouseup();
      wpLastTouchX = undefined;
      wpLastTouchY = undefined;
      wpTouchDidMove = false;
      wpMarkDirty(); // Final high-quality redraw
    }
  }, { passive: false });

  wpCanvas.oncontextmenu = (e) => e.preventDefault();

  // Prevent native Safari gesture scaling to eliminate lag spikes on zoom
  wpCanvas.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  wpCanvas.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
}

let wpLastTouchX, wpLastTouchY;

function pickWPBlock(e) {
  const rect = getWPCanvasRect();
  const canvasMouseX = (e.clientX - rect.left) / wpZoom - wpOffsetX;
  const canvasMouseY = (e.clientY - rect.top) / wpZoom - wpOffsetY;
  const x = Math.floor(canvasMouseX / BLOCK_SIZE);
  const y = Math.floor(canvasMouseY / BLOCK_SIZE);

  if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
    let blockData = wpGrid[y][x];
    if (!blockData) blockData = wpBackgroundGrid[y][x]; // Fallback to background layer

    if (!blockData) return;

    const blockId = (typeof blockData === 'object' && blockData !== null) ? blockData.id : blockData;
    const block = wpBlockMap[blockId];
    if (!block) return;

    wpSelectedBlockId = block.id;
    wpCurrentTool = 'pencil';
    if (typeof window.mpSendCursorPosition === 'function') {
      window.mpSendCursorPosition(window.wpLastMouseX, window.wpLastMouseY, true);
    }
    if (block.type) wpCurrentTab = block.type;

    // Update UI
    // 1. Toolbar
    document.querySelectorAll('.wp-tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === 'pencil');
    });

    // 2. Tabs
    document.querySelectorAll('.wp-tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === wpCurrentTab);
    });

    // 3. Catalog
    renderWPCollection();

    // 4. Inventory
    pushToWPInventory(block.id);
    renderWPInventory(); // Update inventory slot visually
  }
}

function handleWPInteractionLine(x1, y1, x2, y2) {
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const ix2 = Math.round(x2);
  const iy2 = Math.round(y2);

  const dx = Math.abs(ix2 - ix1);
  const dy = Math.abs(iy2 - iy1);
  const sx = ix1 < ix2 ? 1 : -1;
  const sy = iy1 < iy2 ? 1 : -1;

  let minX = ix1, minY = iy1, maxX = ix1, maxY = iy1;
  let err = dx - dy;
  let x = ix1, y = iy1;

  // Bresenham line algorithm - guarantees visiting all cells in the line
  while (true) {
    handleWPInteractionAt(x, y, true);

    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);

    if (x === ix2 && y === iy2) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  // Batch refresh the entire line boundary in one clean Pass-Shadow/Pass-Block sequence
  wpUpdateStaticCacheRegion(minX, minY, maxX, maxY);
  wpMarkDirty();
}

function handleWPInteraction(e) {
  if (wpMultiTouchActive) return; // Safety lock
  if (!isPainting && !isErasing && !wpSelectionMoving) {
    wpLastGridX = -1;
    wpLastGridY = -1;
    return;
  }
  if (wpCurrentTool === 'move') return;

  const rect = getWPCanvasRect();
  const canvasMouseX = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
  const canvasMouseY = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

  const x = Math.floor(canvasMouseX / wpZoom / BLOCK_SIZE - wpOffsetX / BLOCK_SIZE);
  const y = Math.floor(canvasMouseY / wpZoom / BLOCK_SIZE - wpOffsetY / BLOCK_SIZE);

  // Mobile Optimization: Prevent processing the same grid cell multiple times in a single drag event
  if (x === wpLastGridX && y === wpLastGridY) return;

  if (x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT) {
    if (wpCurrentTool === 'select' && (isPainting || wpSelectionMoving)) {
      if (wpSelectionMoving) {
        // Dragging existing selection
        wpSelectionEndX = Math.floor(((e.clientX || (e.touches && e.touches[0].clientX)) - rect.left) / wpZoom / BLOCK_SIZE - wpOffsetX / BLOCK_SIZE);
        wpSelectionEndY = Math.floor(((e.clientY || (e.touches && e.touches[0].clientY)) - rect.top) / wpZoom / BLOCK_SIZE - wpOffsetY / BLOCK_SIZE);
      } else {
        // Dragging new selection bounds
        wpSelectionEndX = x;
        wpSelectionEndY = y;
      }
      wpMarkDirty();
      return;
    }

    if (wpLastGridX !== -1 && wpLastGridY !== -1) {
      // Interpolate line between last position and current
      handleWPInteractionLine(wpLastGridX, wpLastGridY, x, y);
    } else {
      handleWPInteractionAt(x, y);
    }
    wpLastGridX = x;
    wpLastGridY = y;
  }
}

function handleWPInteractionAt(x, y, isBatched = false) {
  if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;

  // USER REQUEST: Protect bedrock foundation from editing/erasing
  if (y >= WORLD_HEIGHT - 5) return;

  const effectiveErasing = isErasing || wpCurrentTool === 'eraser';
  const effectivePainting = isPainting && wpCurrentTool === 'pencil';
  const effectiveWrench = isPainting && wpCurrentTool === 'wrench';
  const effectiveCopy = isPainting && wpCurrentTool === 'copy';
  const effectiveInvert = isPainting && wpCurrentTool === 'invert';

  if (effectivePainting) {
    const newBlock = wpBlockMap[wpSelectedBlockId];
    if (!newBlock) return;

    // Determine target layer, prioritizing Foreground if new block is FG, etc.
    // Logic: 
    // - If placing FG: Check FG first. If FG has SAME block -> Erase it. If FG has DIFF block -> Replace it? (User didn't specifying replacing, but usually yes).
    // - User said: "if i specifically draw over the same block im equipping then it removes those blocks, and if i go into an empty space it doesnt draw over it"
    // This implies that if I START a drag on a matching block, I enter "Smart Erase Mode".
    // I need to implement `wpSmartEraseMode` global or check it in the event handler.

    // Let's defer this to a read of the event handler first to be sure.
    // I will return the original content for now and do a separate read.
    const isBackground = newBlock.type === 'background';
    const targetGrid = isBackground ? wpBackgroundGrid : wpGrid;

    const currentBlockData = targetGrid[y][x];
    const currentId = (typeof currentBlockData === 'object' && currentBlockData !== null) ? currentBlockData.id : currentBlockData;
    let wasUpdated = false;

    // SMART ERASE LOGIC
    if (isSmartEraserMode) {
      // If in smart erase mode, ONLY erase matching blocks
      if (currentId === wpSelectedBlockId) {
        targetGrid[y][x] = null; // Erase!
        wasUpdated = true; // Flag for updates
        
        if (typeof mpBroadcastBlockErase === 'function') {
          mpBroadcastBlockErase(x, y, isBackground ? 'bg' : 'fg');
        }

        // Trigger generic updates for removal
        updateWPAnimatedCellList(x, y, true);

        if (!isBackground) {
          // Update neighbors for tiling fix
          wpUpdateTilingAt(x, y + 1);
          wpUpdateTilingAt(x, y - 1);
          wpUpdateTilingAt(x + 1, y);
          wpUpdateTilingAt(x - 1, y);
        }

        wpNeedsPostProcess = true;
        if (!isBatched) {
          wpUpdateStaticCacheArea(x, y, 1);
          wpMarkDirty();
        }
        return; // Done for this cell
      } else {
        return; // Skip non-matching blocks and empty space in smart erase mode
      }
    }

    if (currentId === wpSelectedBlockId) return;

    let blockData = { id: wpSelectedBlockId };
    if (newBlock.defaultState !== undefined) {
      blockData.state = newBlock.defaultState;
    }
    // Track placement time for per-block animation desync
    if (newBlock.framesPath || wpSelectedBlockId === 'spr_fg_gem_machine') {
      blockData.placedAt = performance.now();
    }
    
    // Store object if we added metadata, otherwise plain ID
    const finalData = (blockData.state !== undefined || blockData.placedAt !== undefined) ? blockData : wpSelectedBlockId;
    
    targetGrid[y][x] = finalData;
    wasUpdated = true;
    
    if (typeof mpBroadcastBlockPlace === 'function') {
      mpBroadcastBlockPlace(x, y, wpSelectedBlockId, isBackground ? 'bg' : 'fg', finalData);
    }

    // Prefetch frames
    if (newBlock.framesPath && newBlock.frameCount) {
      for (let f = (newBlock.frameStart || 0); f < (newBlock.frameStart || 0) + newBlock.frameCount; f++) {
        getWPImage(`${newBlock.framesPath}${f}.png`);
      }
    }

    if (!isBackground) {
      // Only update immediate cardinal neighbors Ã¢â‚¬â€  no chain walk
      wpUpdateTilingAt(x, y);     // Self
      wpUpdateTilingAt(x, y + 1); // Below
      wpUpdateTilingAt(x, y - 1); // Above
      wpUpdateTilingAt(x + 1, y); // Right
      wpUpdateTilingAt(x - 1, y); // Left
    }

    updateWPAnimatedCellList(x, y); // Incremental update

    if (wpInventory.indexOf(wpSelectedBlockId) === -1) {
      pushToWPInventory(wpSelectedBlockId);
    }

    wpNeedsPostProcess = true;
    if (!isBatched) {
      wpUpdateStaticCacheArea(x, y, 1);
      wpMarkDirty();
    }
  } else if (effectiveErasing) {
    // Eraser priority: Foreground first, then Background. 
    // Lock to the first layer erased to prevent destroying both layers on one stroke.
    let wasRemoved = false;

    // Determine target layer on FIRST erase interaction of this stroke
    if (wpEraserTargetLayer === null) {
      if (wpGrid[y][x] !== null) wpEraserTargetLayer = 'fg';
      else if (wpBackgroundGrid[y][x] !== null) wpEraserTargetLayer = 'bg';
      else wpEraserTargetLayer = 'none'; // clicked empty space
    }

    if (wpEraserTargetLayer === 'fg' && wpGrid[y][x] !== null) {
      wpGrid[y][x] = null;
      // Only update immediate cardinal neighbors Ã¢â‚¬â€  no chain walk
      wpUpdateTilingAt(x, y + 1);
      wpUpdateTilingAt(x, y - 1);
      wpUpdateTilingAt(x + 1, y);
      wpUpdateTilingAt(x - 1, y);
      wasRemoved = true;
    } else if (wpEraserTargetLayer === 'bg' && wpBackgroundGrid[y][x] !== null) {
      wpBackgroundGrid[y][x] = null;
      wasRemoved = true;
    }

    if (wasRemoved) {
      if (typeof mpBroadcastBlockErase === 'function') {
        mpBroadcastBlockErase(x, y, wpEraserTargetLayer);
      }
      updateWPAnimatedCellList(x, y, true);
      wpNeedsPostProcess = true;
      if (!isBatched) {
        wpUpdateStaticCacheArea(x, y, 1);
        wpMarkDirty();
      }
    }
  } else if (effectiveWrench) {
    // Wrench priority: Foreground first, then Background
    let targetData = wpGrid[y][x];
    let gridType = 'fg';

    if (!targetData) {
      targetData = wpBackgroundGrid[y][x];
      gridType = 'bg';
    }

    if (!targetData) return;

    const blockId = (typeof targetData === 'object' && targetData !== null) ? targetData.id : targetData;
    const block = wpBlockMap[blockId];

    // STRICT OPT-IN: Wrench only works if explicitly enabled or if it's a multi-frame block NOT explicitly disabled
    // User requested: "disable wrench button for all blocks except the ones im currently working on"
    // So we will strictly require block.wrench === true for now.
    if (block && block.wrench && block.frameCount > 1) {
      let currentState = (typeof targetData === 'object' && targetData !== null) ? (targetData.state || 0) : 0;
      let newState = (currentState + 1) % block.frameCount;

      const newData = { id: blockId, state: newState };
      if (gridType === 'fg') wpGrid[y][x] = newData;
      else wpBackgroundGrid[y][x] = newData;

      if (typeof mpBroadcastWrenchAction === 'function') {
        mpBroadcastWrenchAction(x, y, gridType, blockId, newState);
      }

      saveActiveWorld();
      updateWPAnimatedCellList();

      wpUpdateStaticCacheArea(x, y, 1);
      wpMarkDirty();
    }
    isPainting = false;
  } else if (effectiveCopy) {
    let targetId = null;
    const fgData = wpGrid[y][x];
    const bgData = wpBackgroundGrid[y][x];

    if (fgData) {
      targetId = (typeof fgData === 'object' && fgData !== null) ? fgData.id : fgData;
    } else if (bgData) {
      targetId = (typeof bgData === 'object' && bgData !== null) ? bgData.id : bgData;
    }

    if (targetId) {
      wpSelectedBlockId = targetId;
      wpCurrentTool = 'pencil';
      if (typeof window.mpSendCursorPosition === 'function') {
        window.mpSendCursorPosition(window.wpLastMouseX, window.wpLastMouseY, true);
      }

      // Update UI buttons
      const buttons = document.querySelectorAll('.wp-tool-btn[data-tool]');
      buttons.forEach(btn => btn.classList.remove('active'));
      const pencilBtn = document.querySelector('.wp-tool-btn[data-tool="pencil"]');
      if (pencilBtn) pencilBtn.classList.add('active');

      // Refresh inventory to show active highlight
      renderWPInventory();
    }
    isPainting = false;
  } else if (effectiveInvert) {
    let targetData = wpGrid[y][x];
    let gridType = 'fg';

    if (!targetData) {
      targetData = wpBackgroundGrid[y][x];
      gridType = 'bg';
    }

    if (targetData) {
      const blockId = (typeof targetData === 'object' && targetData !== null) ? targetData.id : targetData;
      let invertedState = (typeof targetData === 'object' && targetData !== null) ? !targetData.inverted : true;

      let newData;
      if (typeof targetData === 'object' && targetData !== null) {
          newData = { ...targetData, inverted: invertedState };
      } else {
          newData = { id: blockId, inverted: invertedState };
      }

      if (gridType === 'fg') wpGrid[y][x] = newData;
      else wpBackgroundGrid[y][x] = newData;

      if (typeof mpBroadcastBlockPlace === 'function') {
        mpBroadcastBlockPlace(x, y, blockId, gridType, newData);
      }

      saveActiveWorld();
      updateWPAnimatedCellList(x, y);

      wpNeedsPostProcess = true;
      if (!isBatched) {
        wpUpdateStaticCacheArea(x, y, 1);
        wpMarkDirty();
      }
    }
    isPainting = false;
  }
}

// Check if a block ID refers to a dirt-type block via the manifest isDirt flag
function isDirtBlock(blockId) {
  if (!blockId) return false;
  const block = wpBlockMap[blockId];
  if (block && block.isDirt) return true;
  // Fallback for common ID patterns (Excluding bedrock as per User Request Phase 18)
  return blockId.includes('dirt');
}

// Get the correct image src for a dirt block given its dirtState (0 or 1)
function getDirtSrc(block, dirtState) {
  // block.src is always the _0 image. Swap _0 for _1 if dirtState is 1
  if (dirtState === 1) {
    return block.src.replace('_0.png', '_1.png');
  }
  return block.src;
}

// Tiling Chain Update: Ensures contiguous blocks of the same type all update together
function wpUpdateTilingChainAt(x, y, bid) {
  if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;
  const targetData = wpGrid[y][x];
  if (!targetData) return;
  const targetId = bid || ((typeof targetData === 'object') ? targetData.id : targetData);

  // Find vertical bounds
  let yMin = y; while (yMin > 0 && getWPBlockId(x, yMin - 1) === targetId) yMin--;
  let yMax = y; while (yMax < WORLD_HEIGHT - 1 && getWPBlockId(x, yMax + 1) === targetId) yMax++;

  // Find horizontal bounds
  let xMin = x; while (xMin > 0 && getWPBlockId(xMin - 1, y) === targetId) xMin--;
  let xMax = x; while (xMax < WORLD_WIDTH - 1 && getWPBlockId(xMax + 1, y) === targetId) xMax++;

  // Update all in cross-shape (usually only one direction is needed but this is safe)
  for (let ty = yMin; ty <= yMax; ty++) wpUpdateTilingAt(x, ty);
  for (let tx = xMin; tx <= xMax; tx++) wpUpdateTilingAt(tx, y);
}

function getWPBlockId(x, y) {
  if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return null;
  const d = wpGrid[y][x];
  return (typeof d === 'object' && d !== null) ? d.id : d;
}

// Unified Tiling System (Replaces wpApplyDirtLogic)
function wpUpdateTilingAt(x, y) {
  if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) return;

  const currentData = wpGrid[y][x];
  if (!currentData) return;
  const bid = (typeof currentData === 'object') ? currentData.id : currentData;
  const blk = wpBlockMap[bid];
  if (!blk) return;

  let newState = -1; // -1 means no change needed for 'state'
  let newDirtState = -1;

  // 1. DIRT LOGIC
  if (isDirtBlock(bid)) {
    const blockAboveData = y > 0 ? wpGrid[y - 1][x] : null;
    const blockAboveId = (typeof blockAboveData === 'object' && blockAboveData !== null) ? blockAboveData.id : blockAboveData;
    const isDirtAbove = isDirtBlock(blockAboveId);
    newDirtState = isDirtAbove ? 1 : 0;
  }

  // Helper to get neighbor IDs
  const getID = (nx, ny) => {
    if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= WORLD_HEIGHT) return null;
    const d = wpGrid[ny][nx];
    return (typeof d === 'object' && d !== null) ? d.id : d;
  };

  // 2. BARRIER ROPE (Horizontal Connecting: Lone, Start, Middle, End)
  if (bid === 'spr_fg_barrier_rope') {
    const isL = getID(x - 1, y) === 'spr_fg_barrier_rope';
    const isR = getID(x + 1, y) === 'spr_fg_barrier_rope';
    if (!isL && !isR) newState = 0;
    else if (!isL && isR) newState = 1;
    else if (isL && isR) newState = 2;
    else if (isL && !isR) newState = 3;
  }

  // 3. CANDY CANE / VINES (Vertical Stacking: Top=0, Rest=1)
  const isVine = bid === 'spr_fg_climbing_vine' || bid === 'spr_fg_crystal_vine';
  const isCandy = bid === 'spr_fg_candy_cane';
  if (isVine || isCandy) {
    const isAboveSame = getID(x, y - 1) === bid;
    newState = isAboveSame ? 1 : 0;
  }

  // 4. SPIKES (Attachment: Above+NoBelow=1, otherwise=0)
  if (bid && bid.includes('spike')) {
    const isAboveSolid = getID(x, y - 1) !== null;
    const isBelowSolid = getID(x, y + 1) !== null;
    newState = (isAboveSolid && !isBelowSolid) ? 1 : 0;
  }

  // 5. PILLARS (4 Frames: 0=Alone, 1=Top/Ceiling, 2=Middle, 3=Bottom)
  if (bid === 'spr_fg_pillar') {
    const isAboveSame = getID(x, y - 1) === bid;
    const isBelowSame = getID(x, y + 1) === bid;
    const isBlockAbove = !isAboveSame && getID(x, y - 1) !== null;

    if (isAboveSame && isBelowSame) newState = 2; // Frame 2 (Middle)
    else if (isAboveSame) newState = 3; // Frame 3 (Bottom)
    else if (isBelowSame || isBlockAbove) newState = 1; // Frame 1 (Top/Ceiling)
    else newState = 0; // Frame 0 (Alone)
  }

  // 6. GINGERBREAD BLOCK (47-State 8-Neighbor Tiling)
  if (bid === 'spr_fg_gingerbread_block') {
    const s = getID(x, y + 1) === bid;
    const e = getID(x + 1, y) === bid;
    const w = getID(x - 1, y) === bid;
    const n = getID(x, y - 1) === bid;

    // 100% Verified Cardinal Bits: S=1, E=2, W=4, N=8
    const mask = (s ? 1 : 0) | (e ? 2 : 0) | (w ? 4 : 0) | (n ? 8 : 0);

    const cardinalMap = {
      0: 0,           // Alone
      1: 1, 2: 2, 8: 3, 4: 4,   // Ends (1:Top, 2:Left, 3:Bottom, 4:Right)
      3: 36, 5: 39, 10: 37, 12: 38, // Corners (3:TL, 5:TR, 10:BL, 12:BR)
      9: 26, 6: 27,           // Straights (26:Vertical Middle, 27:Horizontal Middle)
      7: 15, 11: 13, 13: 14, 14: 16 // T-Junctions
    };

    if (mask === 15) {
      // Surrounded: Use _46 as requested
      newState = 46;
    } else {
      newState = (cardinalMap[mask] !== undefined) ? cardinalMap[mask] : 0;
    }
  }

  // 6b. CLOUD BLOCK (16-State 4-Neighbor Tiling)
  if (bid === 'spr_cloud_block') {
    const n = getID(x, y - 1) === bid;
    const e = getID(x + 1, y) === bid;
    const s = getID(x, y + 1) === bid;
    const w = getID(x - 1, y) === bid;

    // Mask layout: N=1, E=2, S=4, W=8
    const mask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
    
    // User requested frame mapping:
    const cloudMap = [0, 3, 2, 6, 1, 14, 5, 10, 4, 7, 15, 11, 8, 12, 9, 13];
    newState = cloudMap[mask];
  }

  // 7. BEDROCK LOGIC (Depth-based frames 0 to 4)
  if (bid === 'spr_fg_bedrock') {
    const depthFromBottom = (WORLD_HEIGHT - 1) - y;
    if (depthFromBottom === 0) newState = 4;
    else if (depthFromBottom === 1) newState = 3;
    else if (depthFromBottom === 2) newState = 2;
    else if (depthFromBottom === 3) newState = 1;
    else newState = 0; // Layer 5+ from bottom (or any other manually placed bedrock)
  }

  // APPLY CHANGES
  let changed = false;
  let finalData = (typeof currentData === 'object') ? { ...currentData } : { id: bid };

  if (newState !== -1 && finalData.state !== newState) {
    finalData.state = newState;
    changed = true;
  }

  if (newDirtState !== -1 && finalData.dirtState !== newDirtState) {
    finalData.dirtState = newDirtState;
    changed = true;
  }

  if (changed) {
    wpGrid[y][x] = finalData;
  }
}

// Memory cache for images
const wpImageCache = {};
const wpShadowCache = {};

function getWPImage(src) {
  if (wpImageCache[src]) return wpImageCache[src];
  const img = new Image();
  if (window.location.protocol !== 'file:') {
    img.crossOrigin = 'anonymous';
  }
  img.src = src;
  wpImageCache[src] = img;
  img.onload = () => {
    wpMarkStaticDirty();
  };
  return img;
}

function getWPShadow(src) {
  if (wpShadowCache[src]) return wpShadowCache[src];

  const img = getWPImage(src);
  if (!img.complete || img.naturalWidth === 0) return null;

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = img.naturalWidth;
  shadowCanvas.height = img.naturalHeight;
  const sCtx = shadowCanvas.getContext('2d');

  sCtx.drawImage(img, 0, 0);
  sCtx.globalCompositeOperation = 'source-in';
  sCtx.fillStyle = 'black';
  sCtx.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);

  wpShadowCache[src] = shadowCanvas;
  return shadowCanvas;
}

function drawWPWorld(timestamp) {
  wpFrameScheduled = false; // PERF: Allow new frames to be scheduled
  if (!wpCtx) return;
  // Reduce overhead: Only force sharp pixels on dirty frames or once per second
  if (wpDirty || !wpLastSmoothingReset || (timestamp - wpLastSmoothingReset > 1000)) {
    disableWPSmoothing(wpCtx);
    wpLastSmoothingReset = timestamp;
  }

  const container = document.getElementById('world-planner-container');
  if (!container || container.style.display === 'none' || document.visibilityState === 'hidden') {
    wpAnimationId = null;
    return;
  }

  const now = timestamp || performance.now();

  // Throttled animation tick check
  const animTick = (now - wpLastAnimTick) >= WP_ANIM_INTERVAL;
  const hasAnimatedBlocks = wpAnimatedCells && wpAnimatedCells.length > 0;

  // Skip frame if nothing changed and no animation tick due
  let isMultiplayerActive = false;
  try { isMultiplayerActive = mpActive; } catch(e) {}

  // PERF: Don't self-schedule here — the animation ticker interval will wake us when needed
  if (!wpDirty && !(hasAnimatedBlocks && animTick) && wpCurrentTool !== 'wrench' && !isMultiplayerActive) {
    return;
  }

  if (animTick) wpLastAnimTick = now;
  wpDirty = false;

  // Use CSS width/height for culling logic, but scaled width/height for clearing
  const dpr = window.devicePixelRatio || 1;
  const viewWidth = wpCanvas.width / dpr;
  const viewHeight = wpCanvas.height / dpr;
  const scaledWidth = wpCanvas.width;
  const scaledHeight = wpCanvas.height;

  // Grid culling bounds
  const vStartX = Math.max(0, Math.floor(-wpOffsetX / BLOCK_SIZE));
  const vEndX = Math.min(WORLD_WIDTH - 1, Math.ceil((-wpOffsetX + viewWidth / wpZoom) / BLOCK_SIZE));
  const vStartY = Math.max(0, Math.floor(-wpOffsetY / BLOCK_SIZE));
  const vEndY = Math.min(WORLD_HEIGHT - 1, Math.ceil((-wpOffsetY + viewHeight / wpZoom) / BLOCK_SIZE));

  wpCtx.clearRect(0, 0, scaledWidth, scaledHeight);

  // Buffer prep
  let hasRainbow = false;
  let rainbowBufferCleared = false;
  // Previously: wpRainbowAnimatedCtx.clearRect(0, 0, viewWidth, viewHeight); <-- REMOVED (now lazy)

  // Rebuild static cache if blocks changed
  if (wpStaticDirty) rebuildWPStaticCache();

  // Sorting removed (now handled incrementally in updateWPAnimatedCellList)

  // Ã¢â€ â‚¬Ã¢â€ â‚¬ BLIT STATIC CACHE (Separate passes for layering) Ã¢â€ â‚¬Ã¢â€ â‚¬
  const sx = vStartX * BLOCK_SIZE;
  const sy = vStartY * BLOCK_SIZE;
  const sw = (vEndX - vStartX + 1) * BLOCK_SIZE;
  const sh = (vEndY - vStartY + 1) * BLOCK_SIZE;
  const dx = (vStartX * BLOCK_SIZE + wpOffsetX) * wpZoom;
  const dy = (vStartY * BLOCK_SIZE + wpOffsetY) * wpZoom;
  const dw = sw * wpZoom;
  const dh = sh * wpZoom;

  // Spotlight: fade all blocks to very low opacity
  const _spotActive = window.wpSpotlightActiveIds && window.wpSpotlightActiveIds.size > 0;
  if (_spotActive) wpCtx.globalAlpha = 0.2;

  // 1. Static Backgrounds
  if (wpStaticBGCanvas) {
    wpCtx.drawImage(wpStaticBGCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // AESTHETIC WORLD BORDER (Lightweight Canvas Path)
  wpCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  wpCtx.lineWidth = 2;
  wpCtx.strokeRect(wpOffsetX * wpZoom, wpOffsetY * wpZoom, WORLD_WIDTH * BLOCK_SIZE * wpZoom, WORLD_HEIGHT * BLOCK_SIZE * wpZoom);

  // 2. Static Shadows (Blitted with 1.0 as it already contains 0.4 alpha per block)
  if (wpStaticShadowCanvas) {
    wpCtx.drawImage(wpStaticShadowCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // 2. Animated Shadows (Direct Draw Optimization - skipping buffer clear/blit)
  if (wpZoom >= 0.5) {
    // We draw directly to wpCtx with alpha 0.4
    // This avoids:
    // 1. Clearing full screen rainbow buffer
    // 2. Drawing to buffer
    // 3. Blitting buffer to screen
    // Trade-off: Overlapping animated shadows will be slightly darker (additive alpha). Acceptable for mobile perf.

    // Reset DPR transform for manual screen-space positioning if needed?
    // Actually, wpCtx already has DPR transform applied via setTransform/scale done externally...
    // Wait, let's check: in initWorldPlanner we do wpCtx.scale(dpr, dpr).
    // So 'px' calculation should be logical pixels if we use standard drawImage.

    // BUT the original code used manual dpr scaling for shadows?
    // "Compute in screen-space (accounting for DPR)... wpRainbowAnimatedCtx.setTransform(dprShadow...)"

    // Let's use straightforward logical coords on wpCtx (which is dpr-scaled).
    // The previous buffer logic was complex to handle the buffer's dpr.
    // Direct drawing simplifies this: logical coords work automatically.

    wpCtx.save();
    wpCtx.globalAlpha = 0.4;

    const shadowOffset = 4 * wpZoom; // Logical pixels

    for (const cell of wpAnimatedCells) {
      if (cell.layer !== 'fg') continue; // Background blocks don't cast shadows
      if (cell.x < vStartX || cell.x > vEndX || cell.y < vStartY || cell.y > vEndY) continue;

      const bd = wpGrid[cell.y][cell.x];
      if (!bd) continue;
      const bid = (typeof bd === 'object') ? bd.id : bd;
      const blk = wpBlockMap[bid];
      if (!blk || blk.noShadow || blk.verticalAlign === 'center') continue;
      // Skip shadow for fluids (lava/water/acid/mud/bloody water) Ã¢â‚¬â€  they don't cast shadows in-game
      const isFluid = bid === 'spr_fg_water_block' || bid === 'spr_fg_acid_block' || bid === 'spr_fg_mud_block' || bid === 'spr_fg_lava_block' || bid === 'spr_fg_bloody_water_block';
      if (isFluid) continue;
      // Skip shadow for rainbow blocks (they're drawn with overlay, shadow looks doubled)
      const isRainbow = bid && bid.includes('rainbow');
      if (isRainbow) continue;

      const isDjBox = bid === 'spr_fg_xmas_dj_box';
      const isGemMachine = bid === 'spr_fg_gem_machine';
      const isAnimated = blk.framesPath && (isDjBox || isGemMachine || !(typeof bd === 'object' && bd.state !== undefined));

      let imgPath;
      if (isAnimated) {
        let fps = blk.fps || 10;
        if (blk.frameCount === 2) fps = 1; // 2-frame blocks always use 1 FPS (matches game sway speed)

        // Speed up specific flowers and grass
        if (bid === 'spr_fg_tulips' || bid === 'spr_fg_roses' || bid === 'spr_fg_begonias' ||
            bid === 'spr_fg_grass' || bid === 'spr_fg_snow_grass' || bid === 'spr_fg_withered_grass') {
          fps = 2;
        }

        const placedAt = (typeof bd === 'object' && bd.placedAt) ? bd.placedAt : 0;
        const blockNow = now - placedAt;

        let frameIndex;
        // Fix: Support frameDurations for shadows (Bear Trap, etc.)
        if (blk.frameDurations && Array.isArray(blk.frameDurations)) {
          const totalDuration = blk.frameDurations.reduce((a, b) => a + b, 0);
          let elapsed = blockNow % totalDuration;
          if (elapsed < 0) elapsed += totalDuration;
          let cumulative = 0;
          frameIndex = 0;
          for (let i = 0; i < blk.frameDurations.length; i++) {
            cumulative += blk.frameDurations[i];
            if (elapsed < cumulative) {
              frameIndex = i;
              break;
            }
          }
          frameIndex += (blk.frameStart || 0);
        } else if (isDjBox) {
          fps = 3;
          const state = (typeof bd === 'object' && bd.state !== undefined) ? bd.state : 0;
          if (state === 1) {
            const m = Math.floor(blockNow / (1000 / fps));
            frameIndex = 4 + ((m % 5 + 5) % 5); // Frames 4-8 (9th frame _9 is missing)
          } else {
            const m = Math.floor(blockNow / (1000 / fps));
            frameIndex = ((m % 4 + 4) % 4); // Frames 0-3
          }
        } else if (bid === 'spr_fg_gem_machine') {
          const state = (typeof bd === 'object' && bd.state !== undefined) ? bd.state : 0;
          frameIndex = (state === 1) ? 11 : 0;
        } else {
          const m = Math.floor(blockNow / (1000 / fps));
          const fc = blk.frameCount;
          frameIndex = ((m % fc + fc) % fc) + (blk.frameStart || 0);
        }
        imgPath = `${blk.framesPath}${frameIndex}.png`;
      } else {
        if (bid === 'spr_fg_gem_machine') {
          const state = (typeof bd === 'object' && bd.state !== undefined) ? bd.state : 0;
          imgPath = `${blk.framesPath}${(state === 1) ? 11 : 0}.png`;
        } else {
          imgPath = (typeof bd === 'object' && bd.state !== undefined && blk.framesPath) ? `${blk.framesPath}${bd.state}.png` : blk.src;
        }
      }
      const shadowImg = getWPShadow(imgPath);
      if (shadowImg) {
        const nw = shadowImg.width;
        const nh = shadowImg.height;
        // Compute logical position
        const px = (cell.x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2 + wpOffsetX) * wpZoom + shadowOffset;
        const py = ((cell.y + 1) * BLOCK_SIZE - nh + (blk.yOffset || 0) + wpOffsetY) * wpZoom + shadowOffset;

        wpDrawBlockImage(wpCtx, shadowImg, px, py, nw * wpZoom, nh * wpZoom, bd);
      }
    }
    wpCtx.restore();
  }

  // 3. Static Blocks (Background & Foreground cached)
  if (wpStaticBlockCanvas) {
    wpCtx.drawImage(wpStaticBlockCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // Reset alpha after static cache blits
  if (_spotActive) wpCtx.globalAlpha = 1.0;

  // 4. Animated Blocks (Background then Foreground)
  const drawAnimBlock = (cell) => {
    const grid = cell.layer === 'fg' ? wpGrid : wpBackgroundGrid;
    const bd = grid[cell.y][cell.x];
    if (!bd) return;
    const bid = (typeof bd === 'object') ? bd.id : bd;
    const blk = wpBlockMap[bid];
    if (!blk) return;

    const isRainbow = bid && bid.includes('rainbow');
    const isAnimated = blk.framesPath && (bid === 'spr_fg_xmas_dj_box' || bid === 'spr_fg_gem_machine' || !(typeof bd === 'object' && bd.state !== undefined));

    let imgPath;
    if (isAnimated) {
      const useStaticIcon = blk.verticalAlign === 'center' && wpZoom < 0.6;
      if (useStaticIcon) imgPath = blk.src;
      else {
        let fps = blk.fps || 10;
        if (blk.frameCount === 2) fps = 1; // 2-frame blocks always use 1 FPS (matches game sway speed)

        // USER REQUEST: Slow down NPC animations by 2x (Exempt Lion NPC)
        if (bid && bid.toLowerCase().includes('npc') && bid !== 'spr_fg_lion_npc') {
          fps = fps / 2;
        }

        // Speed up specific flowers and grass
        if (bid === 'spr_fg_tulips' || bid === 'spr_fg_roses' || bid === 'spr_fg_begonias' ||
            bid === 'spr_fg_grass' || bid === 'spr_fg_snow_grass' || bid === 'spr_fg_withered_grass') {
          fps = 2; // Double the default sway speed (1 -> 2)
        }

        // Use block's placement time to offset animation if available
        const placedAt = (typeof bd === 'object' && bd.placedAt) ? bd.placedAt : 0;
        const blockNow = now - placedAt;

        let frameIndex;
        const isFluid = bid === 'spr_fg_water_block' || bid === 'spr_fg_acid_block' || bid === 'spr_fg_mud_block' || bid === 'spr_fg_lava_block' || bid === 'spr_fg_bloody_water_block';

        if (blk.frameDurations && Array.isArray(blk.frameDurations)) {
          const totalDuration = blk.frameDurations.reduce((a, b) => a + b, 0);
          let elapsed = blockNow % totalDuration;
          if (elapsed < 0) elapsed += totalDuration;
          let cumulative = 0;
          frameIndex = 0;
          for (let i = 0; i < blk.frameDurations.length; i++) {
            cumulative += blk.frameDurations[i];
            if (elapsed < cumulative) {
              frameIndex = i;
              break;
            }
          }
          frameIndex += (blk.frameStart || 0);
        } else if (bid === 'spr_fg_xmas_dj_box') {
          fps = 3; // Force 3 FPS (override frameCount=2 logic)
          const state = (typeof bd === 'object' && bd.state !== undefined) ? bd.state : 0;
          if (state === 1) {
            // State 1 (Wrenched): Frames 4-8 (spr_fg_xmas_dj_box_9.png is missing)
            const m = Math.floor(blockNow / (1000 / fps));
            frameIndex = 4 + ((m % 5 + 5) % 5);
          } else {
            // State 0 (Default): Frames 0-3
            const m = Math.floor(blockNow / (1000 / fps));
            frameIndex = ((m % 4 + 4) % 4);
          }
        } else if (bid === 'spr_fg_gem_machine') {
          const state = (typeof bd === 'object' && bd.state !== undefined) ? bd.state : 0;
          frameIndex = (state === 1) ? 11 : 0;
        } else if (isFluid) {
          // Check block above (y-1) in same layer
          const blockAbove = (cell.y > 0) ? grid[cell.y - 1][cell.x] : null;
          const bidAbove = (typeof blockAbove === 'object' && blockAbove !== null) ? blockAbove.id : blockAbove;
          const isSameFluidAbove = (bidAbove === bid);

          if (!isSameFluidAbove) {
            // Surface animation (First 4 frames: 0-3)
            const m = Math.floor(blockNow / (1000 / fps));
            const surfaceFrames = Math.min(4, blk.frameCount);
            frameIndex = ((m % surfaceFrames + surfaceFrames) % surfaceFrames);
          } else {
            // Submerged animation (Frames 4-7 if available, otherwise use last surface frame)
            const m = Math.floor(blockNow / (1000 / fps));
            if (blk.frameCount > 4) {
              const subFrames = blk.frameCount - 4;
              frameIndex = 4 + ((m % subFrames + subFrames) % subFrames);
            } else {
              // No submerged frames available (e.g. Bloody Water) - use last frame as solid fill
              frameIndex = blk.frameCount - 1;
            }
          }
        } else {
          const m = Math.floor(blockNow / (1000 / fps));
          const fc = blk.frameCount;
          frameIndex = ((m % fc + fc) % fc) + (blk.frameStart || 0);
        }

        imgPath = `${blk.framesPath}${frameIndex}.png`;
      }
    } else {
      if (bid === 'spr_fg_gem_machine') {
        const state = (typeof bd === 'object' && bd.state !== undefined) ? bd.state : 0;
        imgPath = `${blk.framesPath}${(state === 1) ? 11 : 0}.png`;
      } else {
        imgPath = (typeof bd === 'object' && bd.state !== undefined && blk.framesPath) ? `${blk.framesPath}${bd.state}.png` : blk.src;
      }
    }

    const img = getWPImage(imgPath);
    if (img.complete && img.naturalWidth > 0) {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const startXReal = (cell.x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2 + (blk.xOffset || 0) + wpOffsetX) * wpZoom;
      const endXReal = startXReal + nw * wpZoom;
      const px = Math.round(startXReal);
      const drawW = Math.round(endXReal) - px;
      
      let startYReal;
      const useStaticIcon = blk.verticalAlign === 'center' && wpZoom < 0.6;
      if (blk.verticalAlign === 'center' && !useStaticIcon) {
        startYReal = (cell.y * BLOCK_SIZE + (BLOCK_SIZE - nh) / 2 + wpOffsetY) * wpZoom;
      } else {
        startYReal = ((cell.y + 1) * BLOCK_SIZE - nh + (blk.yOffset || 0) + wpOffsetY) * wpZoom;
      }
      const endYReal = startYReal + nh * wpZoom;
      const py = Math.round(startYReal);
      const drawH = Math.round(endYReal) - py;

      // Draw the block at full opacity (always)
      // Math.round-based width/height scaling prevents drawing overlaps and gaps
      wpDrawBlockImage(wpCtx, img, px, py, drawW, drawH, bd);

      // For rainbow blocks, use multiply blend like PNG export (darker, richer colors)
      if (isRainbow) {
        const w = Math.round(nw * wpZoom);
        const h = Math.round(nh * wpZoom);

        // Calculate hue based on block position + time (slower animation)
        const spatialOffset = (cell.x + cell.y * 0.5) * 10;
        const timeOffset = (now / 100); // Slower: 100ms instead of 50ms
        const hue = ((spatialOffset + timeOffset) % 360);

        // Use multiply blend mode (matches PNG export method)
        wpCtx.save();
        
        // Move origin for rotation/inversion on rainbow overlay precisely matching block bounds
        const cx = px + w / 2;
        const cy = py + h / 2;
        wpCtx.translate(cx, cy);
        
        const inverted = (typeof bd === 'object' && bd !== null) ? !!bd.inverted : false;
        const rotation = (typeof bd === 'object' && bd !== null) ? (bd.rotation || 0) : 0;
        if (rotation !== 0) wpCtx.rotate((rotation * Math.PI) / 180);
        if (inverted) wpCtx.scale(-1, 1);

        wpCtx.globalCompositeOperation = 'multiply';
        wpCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        wpCtx.fillRect(-w / 2, -h / 2, w, h);
        wpCtx.restore();
      }
    }
  };

  // 4. Animated Blocks (Unified Y-sorted pass)
  if (_spotActive) wpCtx.globalAlpha = 0.2;
  for (const cell of wpAnimatedCells) {
    if (cell.x < vStartX || cell.x > vEndX || cell.y < vStartY || cell.y > vEndY) continue;
    drawAnimBlock(cell);
  }
  if (_spotActive) wpCtx.globalAlpha = 1.0;

  // ÃƒÂ¢Ã¢â‚¬Â Ã¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬Â Ã¢â€šÂ¬ RAINBOW EFFECT ÃƒÂ¢Ã¢â‚¬Â Ã¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬Â Ã¢â€šÂ¬
  // PERF: Skip rainbow effect during active pan
  if (hasRainbow) {
    const cycleWidth = 1600;
    const offset = (now / 28) % cycleWidth;

    // Draw rainbow with a pattern created on the temp context so the
    // transform will be correct for the temp buffer (accounts for DPR).
    wpTempCtx.clearRect(0, 0, scaledWidth, scaledHeight);
    wpTempCtx.save();
    try {
      const dpr = window.devicePixelRatio || 1;
      const tPattern = wpTempCtx.createPattern(wpRainbowPatternCanvas, 'repeat');
      if (tPattern && typeof DOMMatrix !== 'undefined') {
        const m = new DOMMatrix();
        // Apply pan (logical pixels * zoom) then rotate and offset
        m.translateSelf(wpOffsetX * wpZoom * dpr, wpOffsetY * wpZoom * dpr);
        m.rotateSelf(45);
        m.translateSelf(-offset * dpr, 0);
        m.scaleSelf(wpZoom * dpr, wpZoom * dpr);
        tPattern.setTransform(m);
      }
      wpTempCtx.fillStyle = tPattern || wpTempCtx.createPattern(wpRainbowPatternCanvas, 'repeat');
      wpTempCtx.fillRect(0, 0, scaledWidth, scaledHeight);
      wpTempCtx.globalCompositeOperation = 'destination-in';
      wpTempCtx.drawImage(wpRainbowAnimatedCanvas, 0, 0, scaledWidth, scaledHeight);
    } finally {
      wpTempCtx.restore();
    }

    wpCtx.save();
    wpCtx.globalCompositeOperation = 'multiply';
    wpCtx.drawImage(wpTempCanvas, 0, 0, scaledWidth, scaledHeight);
    wpCtx.restore();
  }

  // ── SPOTLIGHT: Redraw matching blocks at full opacity ──
  if (_spotActive) {
    const spotIds = window.wpSpotlightActiveIds;
    wpCtx.save();
    wpCtx.globalAlpha = 1.0;

    for (let y = vStartY; y <= vEndY; y++) {
      for (let x = vStartX; x <= vEndX; x++) {
        // Check foreground
        const fgData = wpGrid[y] ? wpGrid[y][x] : null;
        if (fgData) {
          const fgId = (typeof fgData === 'object' && fgData !== null) ? fgData.id : fgData;
          const isBedrock = (fgId === 'bedrock' || fgId === 'spr_fg_bedrock') && y >= WORLD_HEIGHT - 5;
          if (spotIds.has(fgId) || isBedrock) {
            const blk = wpBlockMap[fgId];
            if (blk) {
              let imgPath = blk.src;
              if (blk.isDirt) imgPath = getDirtSrc(blk, (fgData.dirtState || 0));
              else if (typeof fgData === 'object' && fgData.state !== undefined && blk.framesPath) imgPath = `${blk.framesPath}${fgData.state}.png`;
              const img = getWPImage(imgPath);
              if (img.complete && img.naturalWidth > 0) {
                const nw = img.naturalWidth;
                const nh = img.naturalHeight;
                const px = (x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2 + (blk.xOffset || 0) + wpOffsetX) * wpZoom;
                const py = ((y + 1) * BLOCK_SIZE - nh + (blk.yOffset || 0) + wpOffsetY) * wpZoom;
                wpDrawBlockImage(wpCtx, img, Math.round(px), Math.round(py), Math.round(nw * wpZoom), Math.round(nh * wpZoom), fgData);
              }
            }
          }
        }
        // Check background
        const bgData = wpBackgroundGrid[y] ? wpBackgroundGrid[y][x] : null;
        if (bgData) {
          const bgId = (typeof bgData === 'object' && bgData !== null) ? bgData.id : bgData;
          if (spotIds.has(bgId)) {
            const blk = wpBlockMap[bgId];
            if (blk) {
              let imgPath = blk.src;
              if (typeof bgData === 'object' && bgData.state !== undefined && blk.framesPath) imgPath = `${blk.framesPath}${bgData.state}.png`;
              const img = getWPImage(imgPath);
              if (img.complete && img.naturalWidth > 0) {
                const nw = img.naturalWidth;
                const nh = img.naturalHeight;
                const px = (x * BLOCK_SIZE + (BLOCK_SIZE - nw) / 2 + (blk.xOffset || 0) + wpOffsetX) * wpZoom;
                const py = ((y + 1) * BLOCK_SIZE - nh + (blk.yOffset || 0) + wpOffsetY) * wpZoom;
                wpDrawBlockImage(wpCtx, img, Math.round(px), Math.round(py), Math.round(nw * wpZoom), Math.round(nh * wpZoom), bgData);
              }
            }
          }
        }
      }
    }
    wpCtx.restore();
  }

  if (wpShowGrid && wpZoom > 0.3) {
    wpCtx.save();
    wpCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    wpCtx.lineWidth = 1;
    wpCtx.beginPath();
    for (let x = vStartX; x <= vEndX + 1; x++) {
      const gx = (x * BLOCK_SIZE + wpOffsetX) * wpZoom;
      wpCtx.moveTo(gx, (vStartY * BLOCK_SIZE + wpOffsetY) * wpZoom);
      wpCtx.lineTo(gx, (vEndY * 1 * BLOCK_SIZE + BLOCK_SIZE + wpOffsetY) * wpZoom);
    }
    for (let y = vStartY; y <= vEndY + 1; y++) {
      const gy = (y * BLOCK_SIZE + wpOffsetY) * wpZoom;
      wpCtx.moveTo((vStartX * BLOCK_SIZE + wpOffsetX) * wpZoom, gy);
      wpCtx.lineTo((vEndX * 1 * BLOCK_SIZE + BLOCK_SIZE + wpOffsetX) * wpZoom, gy);
    }
    wpCtx.stroke();
    wpCtx.restore();
  }

  // Ã¢â€ â‚¬Ã¢â€ â‚¬ WRENCH INDICATOR Ã¢â€ â‚¬Ã¢â€ â‚¬
  // Ã¢â€ â‚¬Ã¢â€ â‚¬ WRENCH INDICATOR Ã¢â€ â‚¬Ã¢â€ â‚¬
  if (wpCurrentTool === 'wrench') {
    // Ensure wrench icon is loaded
    if (!window.wpWrenchIcon) {
      window.wpWrenchIcon = new Image();
      window.wpWrenchIcon.src = 'worldplanner/Blocks/spr_wrench/spr_wrench_0.png';
    }

    if (window.wpWrenchIcon.complete && window.wpWrenchIcon.naturalWidth > 0) {
      // Wiggle animation: +/- 15 degrees (approx 0.26 rad)
      const wiggleAngle = Math.sin(now / 150) * 0.26;

      for (let y = vStartY; y <= vEndY; y++) {
        if (!wpGrid[y]) continue;
        for (let x = vStartX; x <= vEndX; x++) {
          // Determine target block (FG priority, then BG)
          let targetBlock = null;

          // Check Foreground
          let bd = wpGrid[y][x];
          if (bd) {
            const bid = (typeof bd === 'object') ? bd.id : bd;
            const blk = wpBlockMap[bid];
            if (blk && blk.wrench) targetBlock = blk;
          }

          // Check Background if no FG target
          if (!targetBlock) {
            let bdbg = wpBackgroundGrid[y][x];
            if (bdbg) {
              const bid = (typeof bdbg === 'object') ? bdbg.id : bdbg;
              const blk = wpBlockMap[bid];
              if (blk && blk.wrench) targetBlock = blk;
            }
          }

          if (targetBlock) {
            // Center of the block
            const px = (x * BLOCK_SIZE + wpOffsetX + BLOCK_SIZE / 2) * wpZoom;
            const py = (y * BLOCK_SIZE + wpOffsetY + BLOCK_SIZE / 2) * wpZoom;

            wpCtx.save();
            wpCtx.translate(px, py);
            wpCtx.rotate(wiggleAngle);

            // Draw centered (size: 24x24 scaled)
            const w = 24 * wpZoom;
            const h = 24 * wpZoom;
            wpCtx.drawImage(window.wpWrenchIcon, -w / 2, -h / 2, w, h);

            wpCtx.restore();
          }
        }
      }
    }
  }

  // Ã¢â€ â‚¬Ã¢â€ â‚¬ SELECTION TOOL DRAWING Ã¢â€ â‚¬Ã¢â€ â‚¬
  if (wpCurrentTool === 'select' || wpPasteMode) {
    drawWPSelection(wpCtx, wpZoom, wpOffsetX, wpOffsetY);
  }

  if (typeof mpDrawRemoteCursors === 'function') mpDrawRemoteCursors(wpCtx, wpZoom, wpOffsetX, wpOffsetY);
  // PERF: Don't self-schedule — the animation ticker or wpMarkDirty() will wake us when needed
}

// Page Visibility API Protection
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const container = document.getElementById('world-planner-container');
    if (container && container.style.display !== 'none') {
      if (typeof mpDrawRemoteCursors === 'function') mpDrawRemoteCursors(wpCtx, wpZoom, wpOffsetX, wpOffsetY);
      wpMarkDirty(); // PERF: Use demand-driven scheduling instead of direct rAF
    }
  }
});


// O(1) block lookup map ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â  populated in loadWPManifest
let wpBlockMap = {};

// Utility: Preload a single World Planner image and add it to cache
function preloadWPImage(src) {
  if (wpImageCache[src] && wpImageCache[src].complete) {
    return Promise.resolve(wpImageCache[src]);
  }
  return new Promise((resolve) => {
    const img = new Image();
    if (window.location.protocol !== 'file:') {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      wpImageCache[src] = img;
      wpMarkStaticDirty();
      resolve(img);
    };
    img.onerror = () => {
      // Resolve anyway to prevent blocking the loading screen if an image is missing
      resolve(null);
    };
    img.src = src;
  });
}

// Preload all assets used in the active world canvas, backgrounds, and inventory slots
async function preloadWorldAssets(progressCallback) {
  const uniqueSrcs = new Set();
  
  // 1. Preload all background themes to prevent black background when switching slots or themes
  if (Array.isArray(wpManifestThemes) && wpManifestThemes.length > 0) {
    wpManifestThemes.forEach(t => {
      if (t && t.src) uniqueSrcs.add(t.src);
    });
  } else {
    const savedThemeId = localStorage.getItem('wp_planner_theme_id') || 'bg_forest';
    const defTheme = wpManifestThemes.find(t => t.id === savedThemeId);
    if (defTheme && defTheme.src) uniqueSrcs.add(defTheme.src);
  }

  // 2. Scan unique block IDs in the grid, background grid, and inventory slots
  const uniqueBlockIds = new Set();
  
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (wpGrid[y]) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const cell = wpGrid[y][x];
        if (cell) {
          const bid = (typeof cell === 'object') ? cell.id : cell;
          if (bid) uniqueBlockIds.add(bid);
        }
      }
    }
  }

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (wpBackgroundGrid[y]) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const cell = wpBackgroundGrid[y][x];
        if (cell) {
          const bid = (typeof cell === 'object') ? cell.id : cell;
          if (bid) uniqueBlockIds.add(bid);
        }
      }
    }
  }

  if (Array.isArray(wpInventory)) {
    wpInventory.forEach(id => {
      if (id) uniqueBlockIds.add(id);
    });
  }

  // Fallback defaults
  const defaultBlocks = ['spr_fg_dirt', 'spr_fg_grass', 'spr_fg_obsidian_block', 'spr_fg_bedrock'];
  defaultBlocks.forEach(id => uniqueBlockIds.add(id));

  // Collect image sources
  uniqueBlockIds.forEach(id => {
    const block = wpBlockMap[id];
    if (block) {
      if (block.src) {
        uniqueSrcs.add(block.src);
      }
      if (block.framesPath && block.frameCount > 0) {
        for (let f = 0; f < block.frameCount; f++) {
          uniqueSrcs.add(`${block.framesPath}${f}.png`);
        }
      }
    }
  });

  const srcList = Array.from(uniqueSrcs);
  const total = srcList.length;
  if (total === 0) {
    if (progressCallback) progressCallback(100);
    return;
  }

  let loadedCount = 0;
  const promises = srcList.map(src => {
    return preloadWPImage(src).then(() => {
      loadedCount++;
      if (progressCallback) {
        const percent = Math.min(100, Math.round((loadedCount / total) * 100));
        progressCallback(percent);
      }
    });
  });

  await Promise.all(promises);
}

async function loadWPManifest() {
  try {
    const response = await fetch(`worldplanner/blocks_manifest.json?t=${Date.now()}`);
    const data = await response.json();
    wpBlocks = data.blocks || [];
    wpManifestThemes = data.themes || [];
    
    // Explicitly update window object references for cross-script scoping
    window.wpBlocks = wpBlocks;
    window.wpManifestThemes = wpManifestThemes;

    // SCAN blocks for themes if dedicated themes array is empty
    if (wpManifestThemes.length === 0) {
      wpManifestThemes = wpBlocks.filter(b => b.type === 'theme');
    }

    // Build O(1) lookup map
    wpBlockMap = {};
    for (const b of wpBlocks) wpBlockMap[b.id] = b;

    renderWPCollection();
    setupTabListeners();
    updateWPAnimatedCellList();

    // CLEANUP & DEFAULTS (Must happen after manifest is loaded)
    if (!wpBlocks.find(b => b.id === wpSelectedBlockId)) {
      wpSelectedBlockId = 'spr_fg_dirt';
    }
    wpInventory = wpInventory.filter(id => wpBlocks.find(b => b.id === id));
    if (wpInventory.length === 0) {
      // Default set if empty
      wpInventory = ['spr_fg_dirt', 'spr_fg_grass', 'spr_fg_obsidian_block', 'spr_fg_bedrock'];
    }

    renderWPInventory(); // Fix: Render inventory after blocks are loaded

    // LOAD WORLD & TILING (Must happen after manifest is loaded)
    // Check if grid is just empty nulls from the failsafe init in initWorldPlanner()
    const isMeaningfullyEmpty = wpGrid.length === 0 || wpGrid.every(row => row.every(cell => cell === null));

    if (isMeaningfullyEmpty) {
      loadActiveWorld();
    }

    // Ensure bedrock foundation if still empty (fallback if loadActiveWorld failed or returned empty)
    const isStillEmpty = wpGrid.length === 0 || wpGrid.every(row => row.every(cell => cell === null));
    if (isStillEmpty) {
      wpGrid = getWPDefaultGrid();
      // Apply tiling logic initially
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        for (let x = 0; x < WORLD_WIDTH; x++) {
          wpUpdateTilingAt(x, y);
        }
      }
    }

    // PRELOAD BLOCKS used in the active world, theme background, and inventory slots
    // OPTIMIZATION: Skip preloading entirely if assets have already been preloaded during loading screen
    if (!window.wpAssetsPreloaded) {
      try {
        const loaderProgressFill = document.querySelector("#loader-initial .loader-progress-fill");
        if (loaderProgressFill) {
          loaderProgressFill.style.animation = "progress-slide 2s linear infinite";
          loaderProgressFill.style.width = "0%";
        }
        await preloadWorldAssets((percent) => {
          if (loaderProgressFill) {
            loaderProgressFill.style.width = `${percent}%`;
          }
        });
        window.wpAssetsPreloaded = true;
      } catch (e) {
        console.warn("Preloading world assets failed, using fallback load-on-demand:", e);
      }
    }

    // Ensure buffers are correctly sized
    const viewport = document.getElementById('wp-viewport');
    if (viewport) {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      // Reset transforms before resizing to avoid compounding
      wpRainbowAnimatedCtx.setTransform(1, 0, 0, 1, 0, 0);
      wpRainbowAnimatedCanvas.width = vw * dpr;
      wpRainbowAnimatedCanvas.height = vh * dpr;
      wpRainbowAnimatedCtx.scale(dpr, dpr);
      disableWPSmoothing(wpRainbowAnimatedCtx);

      wpTempCtx.setTransform(1, 0, 0, 1, 0, 0);
      wpTempCanvas.width = vw * dpr;
      wpTempCanvas.height = vh * dpr;
      wpTempCtx.scale(dpr, dpr);
      disableWPSmoothing(wpTempCtx);
    }

    // Ensure Static Cache is ready
    rebuildWPStaticCache();

    // Restore Theme AFTER manifest loads
    const savedThemeId = localStorage.getItem('wp_planner_theme_id');
    if (savedThemeId && wpManifestThemes.length > 0) {
      setWPTheme(savedThemeId);
    } else if (wpManifestThemes.length > 0) {
      // Default fallback: Forest
      setWPTheme('bg_forest');
    }

    setupWPBackgrounds();
  } catch (err) {
    console.warn("Could not load blocks manifest, using defaults.", err);
  }
}

function setupTabListeners() {
  const tabs = document.querySelectorAll('.wp-tab-btn');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      wpCurrentTab = tab.dataset.tab;
      renderWPCollection();
    };
  });
}

function closeWPCatalogue() {
  const catalogue = document.getElementById('blockCatalogue');
  if (catalogue) catalogue.classList.add('hidden');
  window.wpCatalogueThumbPick = null;
}

function renderWPCollection() {
  const grid = document.getElementById('blockCatalogueGrid');
  if (!grid) return;

  grid.innerHTML = '';

  // Valentine block IDs for prioritized section
  const valentineForegroundIds = [
    'spr_fg_amethyst_ore_block', 'spr_bg_church_curtain', 'spr_fg_crystal_love_lock', 
    'spr_fg_cupid_fountain', 'spr_fg_flamingo', 'spr_fg_flowery_bush', 'spr_fg_foliage_block', 
    'spr_fg_goddess_trophy', 'spr_fg_heart_bush', 'spr_fg_heart_castle_block', 
    'spr_fg_heart_ceiling_light', 'spr_fg_heart_checkpoint', 'spr_fg_love_table_block', 
    'spr_fg_magma_block', 'spr_fg_pink_pillar', 'spr_fg_sakura_foliage_block', 
    'spr_fg_tree_heart', 'spr_fg_tree_trunk_block', 'spr_fg_valentine_chair', 
    'spr_fg_valentine_music_box', 'spr_fg_valentines_block', 'spr_fg_wedding_chair', 
    'spr_fg_wedding_fountain', 'spr_bg_wedding_chandelier', 'spr_bg_love_lantern',
    'spr_bg_heart_arrow_led_left', 'spr_bg_heart_arrow_led_right'
  ];
  const valentineBackgroundIds = [
    'spr_bg_heart_castle_background', 'spr_bg_stained_glass', 'spr_bg_valentines_bg'
  ];

  // Filter by current tab (foreground vs background)
  let itemsToRender = [];
  let valentineIds = [];
  if (wpCurrentTab === 'background') {
    // Show only items that start with spr_bg_, are type background, and are not seeds
    itemsToRender = wpBlocks.filter(b => b.id.startsWith('spr_bg_') && b.type === 'background' && !b.id.toLowerCase().includes('seed'));
    valentineIds = valentineBackgroundIds;
  } else {
    itemsToRender = wpBlocks.filter(b => b.type === wpCurrentTab);
    valentineIds = valentineForegroundIds;
  }

  // Get search query
  const searchInput = document.getElementById('blockSearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Filter by search query
  if (query) {
    itemsToRender = itemsToRender.filter(b => b.name.toLowerCase().includes(query));
  }

  // Separate Valentine items from the rest
  const valentineItems = itemsToRender.filter(b => valentineIds.includes(b.id));
  const otherItems = itemsToRender.filter(b => !valentineIds.includes(b.id));

  // Sort each group alphabetically
  valentineItems.sort((a, b) => a.name.localeCompare(b.name));
  otherItems.sort((a, b) => a.name.localeCompare(b.name));

  // Helper to create a block item element
  function createBlockItem(block) {
    const item = document.createElement('div');
    item.className = 'wp-cat-item';
    if (wpSelectedBlockId === block.id) item.classList.add('active');

    item.onclick = () => {
      if (typeof window.wpCatalogueThumbPick === 'function') {
        window.wpCatalogueThumbPick(block);
        closeWPCatalogue();
        return;
      }
      wpSelectedBlockId = block.id;
      pushToWPInventory(block.id);
      renderWPCollection(); 
      closeWPCatalogue(); 
      if (typeof window.mpSendCursorPosition === 'function') {
        window.mpSendCursorPosition(window.wpLastMouseX, window.wpLastMouseY, true);
      }
      
      const swapPopup = document.getElementById('wp-swap-popup');
      if (swapPopup && !swapPopup.classList.contains('hidden')) {
        const replacementImg = document.getElementById('wp-swap-replacement-img');
        if (replacementImg) replacementImg.src = block.src;
      }
    };

    const img = document.createElement('img');
    img.src = block.src;
    img.alt = block.name;
    item.appendChild(img);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'wp-cat-name';
    nameSpan.textContent = block.name;
    item.appendChild(nameSpan);

    return item;
  }

  // Render Valentine section first (only if there are matching items)
  if (valentineItems.length > 0) {
    const header = document.createElement('div');
    header.className = 'wp-cat-section-header';
    header.innerHTML = 'VALENTINE\'S';
    grid.appendChild(header);

    valentineItems.forEach(block => {
      grid.appendChild(createBlockItem(block));
    });

    // Add separator before the rest
    if (otherItems.length > 0) {
      const separator = document.createElement('div');
      separator.className = 'wp-cat-section-header';
      separator.innerHTML = wpCurrentTab === 'background' ? 'ALL BACKGROUNDS' : 'ALL BLOCKS';
      grid.appendChild(separator);
    }
  }

  // Render remaining items
  otherItems.forEach(block => {
    grid.appendChild(createBlockItem(block));
  });
}

function pushToWPInventory(blockId) {
  const idx = wpInventory.indexOf(blockId);
  if (idx !== -1) {
    // If already exists, move it to the front
    wpInventory.splice(idx, 1);
  }

  wpInventory.unshift(blockId);
  if (wpInventory.length > 10) wpInventory.pop();

  // If we are actively painting, we defer the re-render to onmouseup
  if (!isPainting) renderWPInventory();

  // USER REQUEST: Auto-save inventory on change
  saveActiveWorld();
}

function renderWPInventory() {
  const container = document.querySelector('.wp-inventory');
  if (!container) return;

  container.innerHTML = '';

  // Always show 10 slots
  for (let i = 0; i < 10; i++) {
    const slot = document.createElement('div');
    slot.className = 'wp-slot';
    if (wpInventory[i] === wpSelectedBlockId) slot.classList.add('active');

    const blockId = wpInventory[i];
    if (blockId) {
      const block = wpBlocks.find(b => b.id === blockId);
      if (block) {
        const img = document.createElement('img');
        img.src = block.src;
        slot.appendChild(img);
        slot.onclick = () => {
          wpSelectedBlockId = blockId;
          if (typeof window.mpSendCursorPosition === 'function') {
            window.mpSendCursorPosition(window.wpLastMouseX, window.wpLastMouseY, true);
          }
          updateWPBlockCount();
          renderWPInventory();
        };
      }
    }

    container.appendChild(slot);
  }
}

window.searchBlocks = function () {
  // We now use renderWPCollection for search filtering
  renderWPCollection();

  // Automatically open catalogue if user is searching
  const catalogue = document.getElementById('blockCatalogue');
  if (catalogue) catalogue.classList.remove('hidden');
};

function setWPTheme(themeId, fromNetwork = false) {
  const theme = wpManifestThemes.find(t => t.id === themeId);
  if (!theme) return;

  const viewport = document.getElementById('wp-viewport');
  if (viewport) {
    viewport.style.setProperty('--wp-theme-bg', `url("${theme.src}")`);
    
    // Direct fallback: Set inline background-image directly on the grid element to avoid browser pseudo-element repaint timing bugs
    const gridBg = document.getElementById('wp-grid-bg');
    if (gridBg) {
      gridBg.style.backgroundImage = `url("${theme.src}")`;
      void gridBg.offsetHeight; // Force immediate style update
    }
    
    // Force immediate style update on viewport
    void viewport.offsetHeight;

    wpCurrentTheme = themeId;
    window.wpCurrentTheme = themeId;
    try {
      localStorage.setItem('wp_planner_theme_bg', `url("${theme.src}")`);
      localStorage.setItem('wp_planner_theme_id', themeId);
    } catch (error) {
      console.error('Failed to save active theme options:', error);
    }
  }

  // Sync to other players
  if (!fromNetwork && typeof mpBroadcastThemeChange === 'function') {
    mpBroadcastThemeChange(themeId);
  }
}

window.mpBroadcastSelectionEnd = function() {
  if (!mpActive) return;
  const data = { type: 'selection_end', peerId: mpPeer.id };
  if (mpIsHost) mpBroadcast(data);
  else mpConnections[0].send(data);
};

window.mpBroadcastThemeChange = function(themeId) {
  if (!mpActive) return;
  const data = { type: 'theme_change', themeId: themeId };
  if (mpIsHost) mpBroadcast(data);
  else mpConnections[0].send(data);
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (window.location.protocol !== 'file:') img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/* ========================================= */
/* IMAGE TO WORLD CONVERTER LOGIC (v2)       */
/* ========================================= */

let wpBlockColorMap = null;

// Ã¢â€ â‚¬Ã¢â€ â‚¬ CIE Lab Color Space Utilities Ã¢â€ â‚¬Ã¢â€ â‚¬

// Convert sRGB [0-255] to linear RGB [0-1]
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Convert RGB [0-255] to CIE Lab
function rgbToLab(r, g, b) {
  // RGB Ã¢â€ â€™ linear Ã¢â€ â€™ XYZ (D65 illuminant)
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  let x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  let y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750);
  let z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;
  // XYZ Ã¢â€ â€™ Lab
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// CIE76 ÃŽâ€ E distance (perceptual)
function labColorDistance(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const dA = lab1[1] - lab2[1];
  const dB = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

// Full-resolution average color of an image source (samples all opaque pixels)
async function getFullResImageColor(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 128) { // Only count opaque pixels
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          count++;
        }
      }
      if (count === 0) {
        resolve({ rgb: [0, 0, 0, 0], lab: [0, 0, 0], opaqueRatio: 0 });
      } else {
        const r = Math.round(rSum / count);
        const g = Math.round(gSum / count);
        const b = Math.round(bSum / count);
        const lab = rgbToLab(r, g, b);
        const opaqueRatio = count / (w * h);
        resolve({ rgb: [r, g, b, 255], lab, opaqueRatio });
      }
    };
    img.onerror = () => {
      resolve({ rgb: [0, 0, 0, 0], lab: [0, 0, 0], opaqueRatio: 0 });
    };
    img.src = src;
  });
}

// Pre-compute colors of all available blocks (v2: full-res + Lab)
async function computeWPBlockColors() {
  if (wpBlockColorMap) return wpBlockColorMap;

  // Show loading indicator
  const btn = document.querySelector('.wp-tool-btn[onclick*="wp-image-import"]');
  if (btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="spin"></i><span class="wp-tool-label">Loading</span>';
    if (window.lucide) lucide.createIcons();
    btn.dataset.originalHtml = originalHtml;
  }

  wpBlockColorMap = [];

  for (const block of wpBlocks) {
    const colorData = await getFullResImageColor(block.src);
    // Only add blocks that have meaningful opaque pixels
    if (colorData.opaqueRatio > 0.02) {
      const group = (block.group || "").toLowerCase();
      const name = block.name.toLowerCase();
      const id = block.id.toLowerCase();

      // Aesthetic score: higher is better for "solid wall/tile" blocks
      let score = 100;

      // STRONG boost for solid block types ideal for image conversion
      if (name.includes("block") && !name.includes("display") && !name.includes("arrow")) score += 80;
      if (name.includes("brick")) score += 70;
      if (name.includes("metal panel")) score += 60;
      if (name.includes("plastic block")) score += 60;
      if (group.includes("bricks")) score += 50;
      if (group.includes("basic blocks")) score += 40;

      // Moderate boost for terrain/natural
      if (group.includes("terrain") || group.includes("nature")) score += 30;
      if (name.includes("dirt") || name.includes("grass") || name.includes("stone") || name.includes("sand")) score += 30;
      if (name.includes("obsidian") || name.includes("marble") || name.includes("granite")) score += 30;
      if (name.includes("wood block") || name.includes("ice block") || name.includes("snow block")) score += 25;

      // Backgrounds that are solid colored get a boost
      if (block.type === 'background' && name.includes("background")) score += 40;
      if (block.type === 'background' && name.includes("brick")) score += 30;

      // Penalize blocks that don't fill the full tile
      if (colorData.opaqueRatio < 0.5) score -= 80;  // Less than half-filled
      else if (colorData.opaqueRatio < 0.7) score -= 40;

      // Penalize animated/framed blocks
      if (block.framesPath) score -= 50;

      // Penalize decorative/furniture items heavily
      if (name.includes("seed") || name.includes("curtain") || name.includes("window")) score -= 40;
      if (id.includes("border") || id.includes("corner") || id.includes("slope")) score -= 30;
      if (name.includes("platform") || name.includes("ladder") || name.includes("fence")) score -= 60;
      if (name.includes("pillar") || name.includes("vine") || name.includes("rope")) score -= 60;
      if (name.includes("lamp") || name.includes("torch") || name.includes("chandelier")) score -= 70;
      if (name.includes("chair") || name.includes("bed") || name.includes("table")) score -= 70;
      if (name.includes("door") || name.includes("entrance")) score -= 70;
      if (name.includes("tree") || name.includes("bush") || name.includes("plant") || name.includes("flower")) score -= 60;
      if (name.includes("chest") || name.includes("box") || name.includes("crate")) score -= 50;
      if (name.includes("sign") || name.includes("display")) score -= 50;
      if (name.includes("spike") || name.includes("trap")) score -= 60;
      if (name.includes("checkpoint") || name.includes("spawn")) score -= 70;
      if (name.includes("portal")) score -= 50;
      if (name.includes("jelly")) score -= 30;

      wpBlockColorMap.push({
        id: block.id,
        name: block.name,
        group: block.group,
        type: block.type,
        color: colorData.rgb,
        lab: colorData.lab,
        opaqueRatio: colorData.opaqueRatio,
        hasFrames: !!block.framesPath,
        isDirt: !!block.isDirt,
        defaultState: block.defaultState,
        score: score
      });
    }
  }

  // Restore button
  if (btn && btn.dataset.originalHtml) {
    btn.innerHTML = btn.dataset.originalHtml;
    if (window.lucide) lucide.createIcons();
  }

  return wpBlockColorMap;
}

// Check if a block is "obtainable" based on user criteria (v2: expanded exclusions)
function isWPBlockObtainable(block) {
  const id = block.id.toLowerCase();
  const name = block.name.toLowerCase();
  const group = (block.group || "").toLowerCase();

  // EXTREME NPC/ENTITY EXCLUSIONS
  const entityKeywords = ["npc", "bot", "droid", "scientist", "doctor", "guard", "person", "character", "security", "assistant", "merchant", "villager", "citizen", "non player character"];
  if (entityKeywords.some(kw => id.includes(kw) || name.includes(kw) || group.includes(kw))) return false;

  // EXTREME LOCK EXCLUSIONS
  if (id.includes("lock") || name.includes("lock") || group.includes("locks")) return false;

  // EXTREME ACID/LAVA EXCLUSIONS
  if (id.includes("acid") || id.includes("lava") || name.includes("acid") || name.includes("lava")) return false;

  // EXTREME ORE EXCLUSIONS (allow natural dirt/stone/basic blocks, but block these specific ores)
  const oreKeywords = ["ore copper", "ore diamond", "ore emerald", "ore gold", "ore iron", "ore lithium", "ore ruby", "blood ore block", "nightmare ore block"];
  if (oreKeywords.some(kw => id.includes(kw) || name.includes(kw))) return false;

  // ARCADE / CASINO / CARNIVAL 
  const gamblingKeywords = ["arcade", "casino", "slot machine", "poker", "roulette", "carnival"];
  if (gamblingKeywords.some(kw => id.includes(kw) || name.includes(kw) || group.includes(kw))) return false;

  // TROPHIES & PODIUMS
  if (name.includes("trophy") || name.includes("podium") || group.includes("trophy")) return false;

  // HOLIDAYS / EVENTS (Halloween, Christmas, Valentine, Easter, Summer)
  const holidayKeywords = ["halloween", "xmas", "christmas", "valentine", "easter", "summer"];
  if (holidayKeywords.some(kw => name.includes(kw) || id.includes(kw))) return false;

  // REWARDS
  if (name.includes("reward") || name.includes("gift") || name.includes("prize")) return false;

  // META / SYSTEM
  if (name.includes("bedrock") || id.includes("bedrock") || name.includes("barrier") || id.includes("barrier")) return false;

  // MISC EXCLUSIONS SPECIFIED BY USER
  const specificExclusions = [
    "anti talk block", "anti drop block", "anti punch block",
    "blue mushroom", "box of candy crate", "brewing cup", 
    "collector block", "cupid fountain", "disco", "electric pole", 
    "elf potrait", "elf portrait", "entrance", "exclamation sign", "ferris wheel", 
    "fountain", "game leaderboard", "garment suitcase", "go left sign", "go right sign", 
    "grumpy bunny", "heart checkpoint", "heart led sign", "jump sign", "lead rope", 
    "lion cage", "marketplace box", "mine block", "popcorn machine", "pot o gold", 
    "prestige wheel", "pumpkin candy block", "pumpkin block", "recycle bin", 
    "signal button", "small tree", "snow wall", "time block", "vip box", 
    "vip entrance", "vip sign", "world indicator", "music", "boomin box", "nano"
  ];
  if (specificExclusions.some(ex => id.includes(ex) || name.includes(ex))) return false;

  // Filter Signs strictly (only allow basic ones)
  if (name.includes("sign")) {
    const allowedSigns = ["candy sign", "wooden sign", "iron sign", "blank sign"];
    return allowedSigns.some(s => name.includes(s));
  }

  return true;
}

// Find closest block using CIE Lab perceptual distance (v2)
function getClosestWPBlock(r, g, b, placementPolicy, obtainableOnly = true) {
  let closestDist = Infinity;
  let bestCandidate = null;
  const targetLab = rgbToLab(r, g, b);

  for (const blockData of wpBlockColorMap) {
    if (placementPolicy === 'foreground' && blockData.type !== 'foreground') continue;
    if (placementPolicy === 'background' && blockData.type !== 'background') continue;
    if (obtainableOnly && !isWPBlockObtainable(blockData)) continue;

    // Use perceptual Lab distance
    let dist = labColorDistance(targetLab, blockData.lab);

    // Light aesthetic penalty (disabled as per user request to maximize block variety)
    // const penaltyValue = Math.max(0, (150 - blockData.score)) * 0.15;
    // dist += penaltyValue;

    if (dist < closestDist) {
      closestDist = dist;
      bestCandidate = blockData;
    }
  }

  return bestCandidate;
}

window.handleWPImageImport = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      // Store loaded image globally for the confirm step
      window.wpImportImageCurrent = img;

      // Update preview canvas
      const canvas = document.getElementById('wp-import-preview-canvas');
      const ctx = canvas.getContext('2d');

      // Calculate display scale
      const maxWidth = 300;
      const maxHeight = 200;
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((maxWidth / w) * h);
        w = maxWidth;
      }
      if (h > maxHeight) {
        w = Math.round((maxHeight / h) * w);
        h = maxHeight;
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      // Show modal
      toggleWPPopup('wp-import-modal');

      // Pre-compute block colors in background if not done yet
      computeWPBlockColors();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Clear the input so it can be re-used
  event.target.value = '';
};

window.confirmWPImageImport = async function () {
  if (!window.wpImportImageCurrent) return;

  const img = window.wpImportImageCurrent;
  const placement = document.getElementById('wp-import-placement').value;
  const resizeLogic = document.getElementById('wp-import-resize').value;
  const obtainableOnly = true;

  if (wpBlockColorMap && wpBlockColorMap.length > 0 && !wpBlockColorMap[0].lab) {
    wpBlockColorMap = null;
  }

  await computeWPBlockColors();
  toggleWPPopup('wp-import-modal');

  const pCanvas = document.createElement('canvas');
  let targetW = img.width;
  let targetH = img.height;

  if (resizeLogic === 'stretch') {
    targetW = WORLD_WIDTH;
    targetH = WORLD_HEIGHT - 5;
  } else if (resizeLogic === 'scale') {
    const maxW = WORLD_WIDTH;
    const maxH = WORLD_HEIGHT - 5;
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    targetW = Math.max(1, Math.round(img.width * ratio));
    targetH = Math.max(1, Math.round(img.height * ratio));
  }

  pCanvas.width = targetW;
  pCanvas.height = targetH;
  const pCtx = pCanvas.getContext('2d');
  pCtx.drawImage(img, 0, 0, targetW, targetH);

  const imageData = pCtx.getImageData(0, 0, targetW, targetH).data;
  const startX = Math.floor((WORLD_WIDTH - targetW) / 2);
  const startY = (WORLD_HEIGHT - 5) - targetH;

  const fillBothLayers = (placement === 'both');
  let changedDeltas = [];

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const i = (y * targetW + x) * 4;
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const a = imageData[i + 3];

      const worldX = startX + x;
      const worldY = startY + y;

      if (worldX < 0 || worldX >= WORLD_WIDTH || worldY < 0 || worldY >= WORLD_HEIGHT) continue;

      if (a > 128) {
        if (fillBothLayers) {
          const bestOverall = getClosestWPBlock(r, g, b, 'both', obtainableOnly);
          if (bestOverall) {
            const isBg = (bestOverall.type === 'background');
            const blockDataToSet = (bestOverall.defaultState !== undefined) ? { id: bestOverall.id, state: bestOverall.defaultState } : bestOverall.id;
            
            changedDeltas.push({ x: worldX, y: worldY, l: isBg ? 'bg' : 'fg', v: blockDataToSet });

            if (isBg) {
              wpBackgroundGrid[worldY][worldX] = blockDataToSet;
              wpGrid[worldY][worldX] = null;
              changedDeltas.push({ x: worldX, y: worldY, l: 'fg', v: null });
            } else {
              wpGrid[worldY][worldX] = blockDataToSet;
              if (bestOverall.opaqueRatio < 0.95) {
                const bestBG = getClosestWPBlock(r, g, b, 'background', obtainableOnly);
                if (bestBG) {
                    const bgDataToSet = (bestBG.defaultState !== undefined) ? { id: bestBG.id, state: bestBG.defaultState } : bestBG.id;
                    wpBackgroundGrid[worldY][worldX] = bgDataToSet;
                    changedDeltas.push({ x: worldX, y: worldY, l: 'bg', v: bgDataToSet });
                }
              } else {
                wpBackgroundGrid[worldY][worldX] = null;
                changedDeltas.push({ x: worldX, y: worldY, l: 'bg', v: null });
              }
            }
          }
        } else {
          const bestBlock = getClosestWPBlock(r, g, b, placement, obtainableOnly);
          if (bestBlock) {
            const blockId = bestBlock.id;
            const isBg = (bestBlock.type === 'background');
            const blockDataToSet = (bestBlock.defaultState !== undefined) ? { id: blockId, state: bestBlock.defaultState } : blockId;
            
            changedDeltas.push({ x: worldX, y: worldY, l: isBg ? 'bg' : 'fg', v: blockDataToSet });

            if (isBg) {
              wpBackgroundGrid[worldY][worldX] = blockDataToSet;
              wpGrid[worldY][worldX] = null;
              changedDeltas.push({ x: worldX, y: worldY, l: 'fg', v: null });
            } else {
              wpGrid[worldY][worldX] = blockDataToSet;
              wpBackgroundGrid[worldY][worldX] = null;
              changedDeltas.push({ x: worldX, y: worldY, l: 'bg', v: null });
            }
          }
        }
        updateWPAnimatedCellList(worldX, worldY, false);
      }
    }
  }

  for (let wy = startY - 1; wy <= startY + targetH; wy++) {
    for (let wx = startX - 1; wx <= startX + targetW; wx++) {
      if (wx >= 0 && wx < WORLD_WIDTH && wy >= 0 && wy < WORLD_HEIGHT) {
        wpUpdateTilingAt(wx, wy);
      }
    }
  }

  if (typeof mpBroadcastBulkAction === 'function' && changedDeltas.length > 0) {
      const formattedDeltas = changedDeltas.map(d => ({ x: d.x, y: d.y, l: d.l, next: d.v }));
      mpBroadcastBulkAction(formattedDeltas, false);
  }

  saveWPHistory();
  saveActiveWorld();
  updateWPAnimatedCellList();
  updateWPBlockCount();
  wpMarkStaticDirty();
  wpMarkDirty();
};

/* WHAT'S NEW MODAL LOGIC */
function initWhatsNewModal() {
  const overlay = document.getElementById('whats-new-overlay');
  const scrollContainer = document.getElementById('whats-new-scroll-container');
  const confirmBtn = document.getElementById('whats-new-confirm-btn');
  const setList = document.getElementById('new-set-planner-list');
  const worldList = document.getElementById('new-world-planner-list');

  if (!overlay || !scrollContainer || !confirmBtn) {
    return;
  }

  // Data to populate
  const newItems = {
    "set_planner": [
      "spr_wa_blissful_wings", "spr_wa_blue_bear_hoodie", "spr_wa_candy_love_sword",
      "spr_wa_cherub_wings_gold", "spr_wa_cherub_wings_normal", "spr_wa_cherub_wings_pink",
      "spr_wa_dual_pickaxe", "spr_wa_fallen_angel_wings",
      "spr_wa_florence_bouquet", 
      "spr_wa_heart_jetpack", 
      "spr_wa_lovers_cap", "spr_wa_mining_backpack", "spr_wa_paladin_armor",
      "spr_wa_paladin_boots", "spr_wa_paladin_helmet", "spr_wa_paladin_pants",
      "spr_wa_pet_cupid", "spr_wa_pet_dark_heart", 
      "spr_wa_pet_love_bear", 
      "spr_wa_pet_paladin_bird", "spr_wa_pink_bear_hoodie",
      "spr_wa_pink_fedora", "spr_wa_pink_velvet_pants", "spr_wa_pink_wedding_dress",
      "spr_wa_red_velvet_pants", "spr_wa_red_wedding_dress",
      "spr_wa_rose_bouquet", 
      "spr_wa_white_wedding_dress",
      "spr_wa_red_velvet_suit", "spr_wa_pink_velvet_suit", "spr_wa_pink_shoes",
      "spr_wa_heart_dufflejacket", "spr_wa_pink_dufflejacket", "spr_wa_yellow_dufflejacket",
      "spr_wa_lucious_hair_blonde", "spr_wa_black_slimy_hair", "spr_wa_brown_kimpy_hair",
      "spr_wa_pompadour_hair", "spr_wa_pink_eyes", "spr_wa_pink_headphones",
      "spr_wa_pink_car", "spr_wa_golden_car", "spr_wa_heart_cape",
      "spr_wa_heart_glasses", "spr_wa_water_tube_flamingo_waist2",
      "spr_wa_pink_heart_shirt"
    ],
    "world_planner": [
      "spr_bg_heart_castle_background", "spr_bg_stained_glass", "spr_bg_church_curtain",
      "spr_bg_heart_arrow_led_left", "spr_bg_heart_arrow_led_right", "spr_bg_love_lantern",
      "spr_bg_wedding_chandelier", "spr_fg_amethyst_ore_block", "spr_fg_crystal_love_lock",
      "spr_fg_flowery_bush", "spr_fg_foliage_block", "spr_fg_heart_bush",
      "spr_fg_heart_castle_block", "spr_fg_love_table_block", "spr_fg_magma_block",
      "spr_fg_sakura_foliage_block", "spr_fg_tree_heart", "spr_fg_tree_trunk_block",
      "spr_fg_valentine_chair", "spr_fg_wedding_chair", "spr_fg_wedding_fountain",
      "spr_fg_flamingo", "spr_bg_heart_led", "spr_fg_valentine_music_box",
      "spr_fg_valentines_block", "spr_fg_cupid_fountain",
      "spr_fg_heart_ceiling_light", "spr_fg_pink_pillar", "spr_fg_heart_checkpoint",
      "spr_fg_goddess_trophy", "spr_bg_valentines_bg"
    ]
  };

  function createItemCard(id, type) {
    const card = document.createElement('div');
    card.className = 'wn-item-card';
    
    const img = document.createElement('img');
    let imgSrc = null;

    if (type === 'set_planner') {
      const menuListItems = Array.from(document.querySelectorAll('.menu-list .submenu li')).filter(li => !li.closest('#updatesMenu'));
      const idWords = id.replace(/^spr_(wa|fg|bg)_/, '').replace(/_/g, ' ').toLowerCase().split(' ').filter(w => w.length > 1);
      
      for (const li of menuListItems) {
        const liImg = li.querySelector('img.item-icon');
        if (!liImg) continue;
        
        const itemText = li.textContent.trim().toLowerCase();
        const textWords = itemText.replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 1);
        const imgSrcAttr = liImg.getAttribute('src');

        // Robust match: Check if all significant words from ID are in the item text, or vice versa
        const matchesWords = (idWords.length > 0 && idWords.every(w => textWords.includes(w))) ||
                            (textWords.length > 0 && textWords.every(w => idWords.includes(w)));
        
        // Match by filename fallback
        const matchesFile = imgSrcAttr && (imgSrcAttr.includes(id) || imgSrcAttr.includes(id.replace('spr_wa_', '')));

        if (matchesWords || matchesFile || (id.includes('slimy') && itemText.includes('slimy'))) {
          imgSrc = imgSrcAttr;
          break;
        }
      }

      // Final fallbacks for Set Planner items
      if (!imgSrc) {
        if (id.includes('slimy')) imgSrc = 'hair/slimyd.png';
        else imgSrc = `worldplanner/new/${id}/${id}_0.png`;
      }

      img.onerror = () => {
        if (id.includes('slimy')) img.src = 'hair/slimyd.png'; 
        else {
          img.src = `display/${id}.png`;
          img.onerror = () => { img.style.display = 'none'; };
        }
      };
    } else {
      // world_planner: priority worldplanner/Blocks
      if (id === 'spr_bg_valentines_bg') {
        imgSrc = 'worldplanner/Blocks/spr_fg_valentines_bg/spr_fg_valentines_bg_0.png';
      } else {
        imgSrc = `worldplanner/Blocks/${id}/${id}_0.png`;
      }
      img.onerror = () => {
        img.src = `worldplanner/Blocks/${id}/${id}.png`;
        img.onerror = () => {
          img.src = `worldplanner/new/${id}/${id}_0.png`;
          img.onerror = () => {
            img.src = `display/${id}.png`;
            img.onerror = () => { img.style.display = 'none'; };
          };
        };
      };
    }

    img.src = imgSrc;
    
    const label = document.createElement('span');
    
    // Custom name mappings to exact user strings
    const customNames = {
      'spr_wa_cherub_wings_gold': 'Golden Cherub Wings',
      'spr_wa_cherub_wings_pink': 'Pink Cherub Wings',
      'spr_wa_cherub_wings_normal': 'Cherub Wings',
      'spr_wa_red_velvet_suit': 'Velvet Suit',
      'spr_wa_pink_velvet_suit': 'Love Suit',
      'spr_wa_pink_shoes': 'Pink Shoes',
      'spr_wa_heart_dufflejacket': 'Heart Dufflejacket',
      'spr_wa_pink_dufflejacket': 'Pink Dufflejacket',
      'spr_wa_yellow_dufflejacket': 'Yellow Dufflejacket',
      'spr_wa_lucious_hair_blonde': 'Luscious Blonde Hair',
      'spr_wa_brown_kimpy_hair': 'Brown Kimpy Hair',
      'spr_wa_black_slimy_hair': 'Black Slimy Hair',
      'slimy': 'Black Slimy Hair',
      'slimyd': 'Black Slimy Hair',
      'spr_wa_pink_eyes': 'Pink Eyes',
      'spr_wa_pink_headgear': 'Pink Headgear',
      'spr_wa_pink_headphones': 'Pink Headgear',
      'spr_wa_pink_car': 'Pink Car',
      'spr_wa_golden_car': 'Golden Car',
      'spr_wa_heart_glasses': 'Hearted Glasses',
      'spr_wa_water_tube_flamingo_waist2': 'Flamingo Water Tube',
      'spr_fg_valentines_block': 'Heart Block',
      'spr_fg_pink_pillar': 'Love Pillar',
      'spr_fg_heart_ceiling_light': 'Love Ceiling Light',
      'spr_bg_heart_led': 'Heart Led Sign',
      'spr_bg_valentines_bg': 'Heart Background',
      'spr_wa_pink_heart_shirt': 'Love Shirt'
    };

    let nameText = id.replace(/^spr_(wa|fg|bg)_/, '').replace(/_/g, ' ');
    if (customNames[id]) {
      label.textContent = customNames[id];
    } else {
      label.textContent = nameText.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    
    card.appendChild(img);
    card.appendChild(label);
    return card;
  }

  // Clear and populate
  if (setList) {
    setList.innerHTML = '';
    newItems.set_planner.forEach(id => setList.appendChild(createItemCard(id, 'set_planner')));
  }
  if (worldList) {
    worldList.innerHTML = '';
    newItems.world_planner.forEach(id => worldList.appendChild(createItemCard(id, 'world_planner')));
  }

  // Auto-trigger on init
  overlay.style.display = 'flex';
  scrollContainer.scrollTop = 0;
  confirmBtn.disabled = true;
  confirmBtn.classList.remove('enabled');
  confirmBtn.textContent = 'Scroll to read more';

  // Scroll logic
  scrollContainer.onscroll = () => {
    const threshold = 100; 
    const isAtBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop <= scrollContainer.clientHeight + threshold;
    if (isAtBottom && confirmBtn.disabled) {
      confirmBtn.disabled = false;
      confirmBtn.classList.add('enabled');
      confirmBtn.textContent = 'Confirm Changes';
    }
  };

  confirmBtn.onclick = () => {
    if (!confirmBtn.disabled) {
      overlay.style.display = 'none';
      // Set confirmation flag in localStorage
      try {
        localStorage.setItem('whats_new_v251_confirmed', 'true');
      } catch (error) {
        console.error('Failed to save confirmation flag:', error);
      }
    }
  };
  
  // Populate the Updates hamburger menu in Set Planner
}

function populateUpdatesMenu() {
  const updatesMenu = document.getElementById('updatesMenu');
  if (!updatesMenu) return;

  // The Valentine items have very inconsistent naming and many don't exist as <li>s in other menus.
  // We explicitly define the HTML for the menu here acting as redirects to the original items.
  // Using the premium "boxed" design to match other menus.
  updatesMenu.innerHTML = `
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hats/loverd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Lovers Cap</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hats/fedorad.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Fedora</span>
    </li>
    
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hair/pompd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pompadour Hair</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hair/hair22.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Brown Kimpy Hair</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hair/slimyd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Black Slimy Hair</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_lucious_hair_blonde.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Lucious Blonde Hair</span>
    </li>

    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_pink_eyes.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Eyes</span>
    </li>

    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="wings/fallen.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Fallen Angel Wings</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="wings/blissful.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Blissful Wings</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="capes/heartd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Heart Jetpack</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_heart_cape.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Heart Cape</span>
    </li>

    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/bbear/beard.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Blue Bear Hoodie</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/pbear/beard.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Bear Hoodie</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/wedding1/weddingd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Wedding Dress</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/wedding2/weddingd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Red Wedding Dress</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/wedding3/weddingd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">White Wedding Dress</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/yd/ydd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Yellow Dufflejacket</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/pd/pdd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Dufflejacket</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/hd/hdd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Heart Dufflejacket</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_red_velvet_suit.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Velvet Suit</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_pink_heart_shirt.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Love Shirt</span>
    </li>

    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="pants/redv/redd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Red Velvet Pants</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="pants/pinkv/pinkd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Velvet Pants</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_pink_shoes.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Shoes</span>
    </li>

    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hands/rose/rosed.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Rose Bouquet</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hands/florences/florence.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Florence Bouquet</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="hands/dual/duald.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Dual Pickaxe</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="worldplanner/new/spr_wa_candy_love_sword/spr_wa_candy_love_sword_0.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Candy Love Sword</span>
    </li>

    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="cars/spr_wa_golden_car_ride2/1.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Golden Car</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="cars/spr_wa_pink_car_ride2/1.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Car</span>
    </li>
    
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="wings/c1.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Cherub Wings</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="wings/c2.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Golden Cherub Wings</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="wings/c3.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Cherub Wings</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="capes/mining/miningd.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Mining Backpack</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shirts/paladin/paladind.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Paladin Armor</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="shoes/paladin/paladind.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Paladin Boots</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="faces/paladin/paladind.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Paladin Helmet</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="pants/paladin.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Paladin Pants</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="pets/cupid.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pet Cupid</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="worldplanner/new/spr_wa_pet_dark_heart/spr_wa_pet_dark_heart_0.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pet Dark Heart</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="worldplanner/new/spr_wa_pet_love_bear/spr_wa_pet_love_bear_0.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pet Love Bear</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="pets/paladind.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pet Paladin Bird</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_pink_headphones.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Pink Headgear</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="display/spr_wa_heart_glasses.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Hearted Glasses</span>
    </li>
    <li onclick="redirectOriginal(this)">
      <div class="roadmap-item-icon-container">
        <img src="floaties/spr_wa_water_tube_flamingo_waist2.png" class="roadmap-image-icon">
      </div>
      <span class="roadmap-item-text">Flamingo Water Tube</span>
    </li>
  `;
}

// --- NEW TOOL LOGIC ---

// SELECTION
function showWPSelectionMenu() {
  const menu = document.getElementById('wp-selection-menu');
  if (menu && wpSelectionBox) {
    menu.classList.remove('hidden');
    document.getElementById('wp-btn-copy').style.display = wpPasteMode ? 'none' : 'inline-flex';
    document.getElementById('wp-btn-cut').style.display = wpPasteMode ? 'none' : 'inline-flex';
    document.getElementById('wp-btn-clear').style.display = wpPasteMode ? 'none' : 'inline-flex';
    document.getElementById('wp-sel-div-2').style.display = wpPasteMode ? 'none' : 'block';
    document.getElementById('wp-btn-paste').style.display = wpPasteMode ? 'inline-flex' : 'none';
    // Invert and Rotate always available
    const invertBtn = document.getElementById('wp-btn-invert');
    const rotateBtn = document.getElementById('wp-btn-rotate');
    if (invertBtn) invertBtn.style.display = 'inline-flex';
    if (rotateBtn) rotateBtn.style.display = 'inline-flex';
  }
}

function hideWPSelectionMenu() {
  const menu = document.getElementById('wp-selection-menu');
  if (menu) menu.classList.add('hidden');
}

function drawWPSelection(ctx, zoom, offX, offY) {
  if (!ctx) return;
  ctx.save();
  ctx.strokeStyle = '#a8dadc';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = (performance.now() / 50) % 8;

  const box = wpSelectionBox || (wpSelectionStartX !== -1 && wpSelectionEndX !== -1 ? {
    x: Math.min(wpSelectionStartX, wpSelectionEndX),
    y: Math.min(wpSelectionStartY, wpSelectionEndY),
    w: Math.abs(wpSelectionEndX - wpSelectionStartX) + 1,
    h: Math.abs(wpSelectionEndY - wpSelectionStartY) + 1
  } : null);

  if (box) {
    ctx.fillStyle = 'rgba(168, 218, 220, 0.2)';
    let bx = box.x;
    let by = box.y;
    if (wpCurrentTool === 'select' && wpSelectionMoving) {
       bx += (wpSelectionEndX - wpSelectionStartX);
       by += (wpSelectionEndY - wpSelectionStartY);
    }
    
    const x = (bx * BLOCK_SIZE + offX) * zoom;
    const y = (by * BLOCK_SIZE + offY) * zoom;
    const w = box.w * BLOCK_SIZE * zoom;
    const h = box.h * BLOCK_SIZE * zoom;
    
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // Track the selection box UI
    const menu = document.getElementById('wp-selection-menu');
    if (menu && !menu.classList.contains('hidden')) {
      const rect = ctx.canvas.getBoundingClientRect();
      menu.style.position = 'absolute';
      menu.style.left = `${rect.left + x + (w / 2) - (menu.offsetWidth / 2)}px`;
      let menuY = rect.top + y - menu.offsetHeight - 15;
      if (menuY < 0) menuY = rect.top + y + h + 15; // Flip below if off-screen top
      menu.style.top = `${menuY}px`;
    }

    if (wpCopiedData) { // Removed requirement for Moving or PasteMode: always show floating selection
      const dx = wpSelectionMoving ? (wpSelectionEndX - wpSelectionStartX) : 0;
      const dy = wpSelectionMoving ? (wpSelectionEndY - wpSelectionStartY) : 0;
      ctx.globalAlpha = 0.7;
      for (const item of wpCopiedData) {
        const bd = item.fg || item.bg;
        if (!bd) continue;
        const bid = (typeof bd === 'object') ? bd.id : bd;
        const blk = wpBlockMap[bid];
        if (!blk) continue;
        
        let imgPath = blk.src;
        if (typeof bd === 'object') {
          if (bd.state !== undefined && blk.framesPath) {
            imgPath = `${blk.framesPath}${bd.state}.png`;
          } else if (isDirtBlock(bid) && bd.dirtState !== undefined) {
            imgPath = getDirtSrc(blk, bd.dirtState); // Honor dynamic borders natively in preview
          }
        }
        
        const img = getWPImage(imgPath);
        if (img.complete && img.naturalWidth > 0) {
           const px = ((box.x + item.x + dx) * BLOCK_SIZE + offX + (BLOCK_SIZE - img.naturalWidth) / 2) * zoom;
           let py;
           if (blk.verticalAlign === 'center') py = ((box.y + item.y + dy) * BLOCK_SIZE + offY + (BLOCK_SIZE - img.naturalHeight) / 2) * zoom;
           else py = ((box.y + item.y + 1 + dy) * BLOCK_SIZE - img.naturalHeight + (blk.yOffset || 0) + offY) * zoom;
           wpDrawBlockImage(ctx, img, px, py, img.naturalWidth * zoom, img.naturalHeight * zoom, bd);
        }
      }
    }
  }

  ctx.restore();
}

window.wpConfirmPaste = function() {
  if (wpPasteMode && wpSelectionBox && wpCopiedData) {
    wpDropSelectionBuffer();
    const deltas = saveWPHistory();
    if (deltas && typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(deltas, false);
    wpPasteMode = false;
    wpClipboardData = null;
    wpSelectionBox = null;
    wpCopiedData = null;
    hideWPSelectionMenu();
    wpNeedsPostProcess = true;
  }
};

window.wpCopySelection = function() {
  if (!wpSelectionBox) return;
  const wasMoved = !!wpCopiedData;
  if (!wpCopiedData) wpCopySelectionToDragBuffer(false);
  
  wpClipboardData = JSON.parse(JSON.stringify(wpCopiedData));
  wpClipboardWidth = wpSelectionBox.w;
  wpClipboardHeight = wpSelectionBox.h;
  
  if (wasMoved) {
    wpDropSelectionBuffer();
    const deltas = saveWPHistory();
    if (deltas && typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(deltas, false);
    wpNeedsPostProcess = true;
  }
  
  hideWPSelectionMenu();
  wpPasteMode = true;
  wpSelectionBox = null;
  wpCopiedData = null;
};

window.wpCutSelection = function() {
  if (!wpSelectionBox) return;
  if (!wpCopiedData) wpCopySelectionToDragBuffer(true);
  wpClipboardData = JSON.parse(JSON.stringify(wpCopiedData));
  wpClipboardWidth = wpSelectionBox.w;
  wpClipboardHeight = wpSelectionBox.h;
  const deltas = saveWPHistory();
  if (deltas && typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(deltas, false);
  wpNeedsPostProcess = true;
  hideWPSelectionMenu();
  wpPasteMode = true;
  wpSelectionBox = null;
  wpCopiedData = null;
};

window.wpFlipSelection = function(dir) {
  if (!wpSelectionBox) return;
  const wasNotCopied = !wpCopiedData;
  if (wasNotCopied) wpCopySelectionToDragBuffer(true);
  
  const bw = wpSelectionBox.w;
  const bh = wpSelectionBox.h;
  
  for (const item of wpCopiedData) {
    if (dir === 'horizontal') {
      item.x = (bw - 1) - item.x;
    } else if (dir === 'vertical') {
      item.y = (bh - 1) - item.y;
    }
  }

  // Recalculate inner tiling (dirtState)
  if (wpCopiedData) {
    for (const item of wpCopiedData) {
      if (item.fg) {
        const id = typeof item.fg === 'object' ? item.fg.id : item.fg;
        if (isDirtBlock(id)) {
          const isDirtAbove = wpCopiedData.some(o => o.x === item.x && o.y === item.y - 1 && o.fg && isDirtBlock(typeof o.fg === 'object' ? o.fg.id : o.fg));
          if (typeof item.fg === 'object') item.fg.dirtState = isDirtAbove ? 1 : 0;
        }
      }
    }
  }

  if (wasNotCopied && !wpPasteMode) {
    wpDropSelectionBuffer();
    wpCopiedData = null;
    const deltas = saveWPHistory();
    if (deltas && typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(deltas, false);
    showWPSelectionMenu();
  }
  wpNeedsPostProcess = true;
  wpMarkDirty();
};

// INVERT: Toggle the 'inverted' flag on every block in the selection (mirrors sprite horizontally)
window.wpInvertSelection = function() {
  if (!wpSelectionBox) return;
  const wasNotCopied = !wpCopiedData;
  if (wasNotCopied) wpCopySelectionToDragBuffer(true);

  for (const item of wpCopiedData) {
    // Invert foreground block
    if (item.fg) {
      if (typeof item.fg === 'string') item.fg = { id: item.fg };
      item.fg.inverted = !item.fg.inverted;
    }
    // Invert background block
    if (item.bg) {
      if (typeof item.bg === 'string') item.bg = { id: item.bg };
      item.bg.inverted = !item.bg.inverted;
    }
  }

  if (wasNotCopied && !wpPasteMode) {
    wpDropSelectionBuffer();
    wpCopiedData = null;
    const deltas = saveWPHistory();
    if (deltas && typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(deltas, false);
    showWPSelectionMenu();
  }
  wpNeedsPostProcess = true;
  wpMarkDirty();
};

// ROTATE: Rotate the entire selection 90 degrees clockwise and increment per-block rotation
window.wpRotateSelection = function() {
  if (!wpSelectionBox) return;
  const wasNotCopied = !wpCopiedData;
  if (wasNotCopied) wpCopySelectionToDragBuffer(true);

  const bw = wpSelectionBox.w;
  const bh = wpSelectionBox.h;

  for (const item of wpCopiedData) {
    // Rotate position: (x, y) -> (bh - 1 - y, x) for 90° CW
    const oldX = item.x;
    const oldY = item.y;
    item.x = (bh - 1) - oldY;
    item.y = oldX;

    // Increment per-block rotation
    if (item.fg) {
      if (typeof item.fg === 'string') item.fg = { id: item.fg };
      item.fg.rotation = ((item.fg.rotation || 0) + 90) % 360;
    }
    if (item.bg) {
      if (typeof item.bg === 'string') item.bg = { id: item.bg };
      item.bg.rotation = ((item.bg.rotation || 0) + 90) % 360;
    }
  }

  // Swap selection box dimensions after 90° rotation
  wpSelectionBox.w = bh;
  wpSelectionBox.h = bw;

  // Recalculate dirt tiling
  if (wpCopiedData) {
    for (const item of wpCopiedData) {
      if (item.fg) {
        const id = typeof item.fg === 'object' ? item.fg.id : item.fg;
        if (isDirtBlock(id)) {
          const isDirtAbove = wpCopiedData.some(o => o.x === item.x && o.y === item.y - 1 && o.fg && isDirtBlock(typeof o.fg === 'object' ? o.fg.id : o.fg));
          if (typeof item.fg === 'object') item.fg.dirtState = isDirtAbove ? 1 : 0;
        }
      }
    }
  }

  if (wasNotCopied && !wpPasteMode) {
    wpDropSelectionBuffer();
    wpCopiedData = null;
    const deltas = saveWPHistory();
    if (deltas && typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(deltas, false);
    showWPSelectionMenu();
  }
  wpNeedsPostProcess = true;
  wpMarkDirty();
};

window.wpClearSelection = function() {
  if (!wpSelectionBox) return;
  const sx = wpSelectionBox.x;
  const sy = wpSelectionBox.y;
  const sw = wpSelectionBox.w;
  const sh = wpSelectionBox.h;
  for(let y=sy; y<sy+sh; y++) {
    for(let x=sx; x<sx+sw; x++) {
       if (y<WORLD_HEIGHT-5) {
         if (wpGrid[y] && wpGrid[y][x]) { wpGrid[y][x] = null; updateWPAnimatedCellList(x, y, true); }
         if (wpBackgroundGrid[y] && wpBackgroundGrid[y][x]) { wpBackgroundGrid[y][x] = null; updateWPAnimatedCellList(x, y, true); }
         wpUpdateTilingChainAt(x, y);
       }
    }
  }
  const deltas = saveWPHistory();
  if (deltas && typeof mpBroadcastBulkAction === 'function') mpBroadcastBulkAction(deltas, false);
  updateWPBlockCount();
  saveActiveWorld();
  wpCancelSelection();
  wpNeedsPostProcess = true;
  wpUpdateStaticCacheRegion(Math.max(0, sx - 1), Math.max(0, sy - 1), Math.min(WORLD_WIDTH - 1, sx + sw + 1), Math.min(WORLD_HEIGHT - 1, sy + sh + 1));
};

window.wpCancelSelection = function() {
  if (wpCopiedData && !wpPasteMode) {
    wpDropSelectionBuffer();
    saveWPHistory();
    wpNeedsPostProcess = true;
  }
  wpSelectionBox = null;
  wpSelectionStartX = -1; wpSelectionEndX = -1;
  wpSelectionMoving = false;
  wpCopiedData = null;
  wpPasteMode = false;
  wpClipboardData = null;
  hideWPSelectionMenu();
  wpMarkDirty();
  
  if (typeof mpSendCursorPosition === 'function') {
    mpSendCursorPosition(wpLastGridX, wpLastGridY, true); // Force send box: null
  }
};

function wpCopySelectionToDragBuffer(clearOriginal) {
  if (!wpSelectionBox) return;
  wpCopiedData = [];
  for(let y=wpSelectionBox.y; y<wpSelectionBox.y+wpSelectionBox.h; y++) {
    for(let x=wpSelectionBox.x; x<wpSelectionBox.x+wpSelectionBox.w; x++) {
      if (y >= WORLD_HEIGHT - 5) continue;
      const fg = wpGrid[y][x];
      const bg = wpBackgroundGrid[y][x];
      if (fg || bg) {
        wpCopiedData.push({ x: x - wpSelectionBox.x, y: y - wpSelectionBox.y, fg: (typeof fg === 'object' && fg !== null) ? {...fg} : fg, bg: (typeof bg === 'object' && bg !== null) ? {...bg} : bg });
        if (clearOriginal) {
          if (fg) wpGrid[y][x] = null;
          if (bg) wpBackgroundGrid[y][x] = null;
          updateWPAnimatedCellList(x, y, true);
        }
      }
    }
  }
  if (clearOriginal) {
    for(let y=Math.max(0, wpSelectionBox.y - 1); y<=Math.min(WORLD_HEIGHT-1, wpSelectionBox.y+wpSelectionBox.h); y++) {
      for(let x=Math.max(0, wpSelectionBox.x - 1); x<=Math.min(WORLD_WIDTH-1, wpSelectionBox.x+wpSelectionBox.w); x++) {
        wpUpdateTilingAt(x, y);
      }
    }
    wpUpdateStaticCacheRegion(wpSelectionBox.x - 1, wpSelectionBox.y - 1, wpSelectionBox.x+wpSelectionBox.w + 1, wpSelectionBox.y+wpSelectionBox.h + 1);
    
    // Multiplayer Sync: Broadcast the "Cut"
    if (typeof mpBroadcastBulkAction === 'function') {
      const deltas = [];
      for(let y=wpSelectionBox.y; y<wpSelectionBox.y+wpSelectionBox.h; y++) {
        for(let x=wpSelectionBox.x; x<wpSelectionBox.x+wpSelectionBox.w; x++) {
          deltas.push({ x: x, y: y, l: 'fg', next: null });
          deltas.push({ x: x, y: y, l: 'bg', next: null });
        }
      }
      if (deltas.length > 0) mpBroadcastBulkAction(deltas, false);
    }
  }

  // --- ADDED BROADCST OF SELECTION START ---
  if (typeof mpBroadcastSelectionStart === 'function') {
    mpBroadcastSelectionStart(wpSelectionBox, wpCopiedData);
  }
}

function wpDropSelectionBuffer() {
  if (!wpSelectionBox || !wpCopiedData) return;
  const dx = wpSelectionMoving ? (wpSelectionEndX - wpSelectionStartX) : 0;
  const dy = wpSelectionMoving ? (wpSelectionEndY - wpSelectionStartY) : 0;
  
  const nxMin = wpSelectionBox.x + dx;
  const nyMin = wpSelectionBox.y + dy;
  const nxMax = nxMin + wpSelectionBox.w - 1;
  const nyMax = nyMin + wpSelectionBox.h - 1;

  for (const item of wpCopiedData) {
    const nx = wpSelectionBox.x + item.x + dx;
    const ny = wpSelectionBox.y + item.y + dy;
    if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT - 5) {
      if (item.fg) {
        const id = typeof item.fg === 'object' ? item.fg.id : item.fg;
        const blk = wpBlockMap[id];
        let newData = id;
        if (blk && blk.animated) newData = { id: id, animationTick: 0 };
        if (blk && blk.defaultState !== undefined) newData = { id: id, state: blk.defaultState };
        wpGrid[ny][nx] = newData;
        updateWPAnimatedCellList(nx, ny, false);
      }
      if (item.bg) {
        const id = typeof item.bg === 'object' ? item.bg.id : item.bg;
        const blk = wpBlockMap[id];
        let newData = id;
        if (blk && blk.animated) newData = { id: id, animationTick: 0 };
        if (blk && blk.defaultState !== undefined) newData = { id: id, state: blk.defaultState };
        wpBackgroundGrid[ny][nx] = newData;
        updateWPAnimatedCellList(nx, ny, false);
      }
    }
  }

  // Pass 2: Update all states in the dropped area and neighbors
  const stateMinX = Math.max(0, nxMin - 1);
  const stateMinY = Math.max(0, nyMin - 1);
  const stateMaxX = Math.min(WORLD_WIDTH - 1, nxMax + 1);
  const stateMaxY = Math.min(WORLD_HEIGHT - 6, nyMax + 1);

  for (let y = stateMinY; y <= stateMaxY; y++) {
    for (let x = stateMinX; x <= stateMaxX; x++) {
      wpUpdateTilingAt(x, y);
    }
  }

  wpUpdateStaticCacheRegion(stateMinX, stateMinY, stateMaxX, stateMaxY);
  updateWPBlockCount();
  saveActiveWorld();

  // Multiplayer Sync: Broadcast the "Drop"
  if (typeof mpBroadcastBulkAction === 'function') {
    const deltas = [];
    for (const item of wpCopiedData) {
      const nx = wpSelectionBox.x + item.x + dx;
      const ny = wpSelectionBox.y + item.y + dy;
      if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT - 5) {
        if (item.fg) deltas.push({ x: nx, y: ny, l: 'fg', next: item.fg });
        if (item.bg) deltas.push({ x: nx, y: ny, l: 'bg', next: item.bg });
      }
    }
    if (deltas.length > 0) mpBroadcastBulkAction(deltas, false);
  }
}

window.wpExecuteFloodFill = function(startX, startY) {
  if (startY >= WORLD_HEIGHT - 5) return;
  const newBlock = wpBlockMap[wpSelectedBlockId];
  if (!newBlock) return;
  
  const isBg = newBlock.type === 'background';
  const targetGrid = isBg ? wpBackgroundGrid : wpGrid;
  
  const startData = targetGrid[startY][startX];
  const targetId = (typeof startData === 'object' && startData !== null) ? startData.id : startData;
  if (targetId === wpSelectedBlockId) return; // Same block, no fill

  const stack = [{x: startX, y: startY}];
  let fillCount = 0;
  let minX = startX, minY = startY, maxX = startX, maxY = startY;
  const mpChanges = [];

  let blockData = { id: wpSelectedBlockId };
  if (newBlock.defaultState !== undefined) blockData.state = newBlock.defaultState;
  const fillVal = (blockData.state !== undefined) ? blockData : wpSelectedBlockId;

  const startFg = wpGrid[startY][startX];
  const isStartFgEmpty = !(typeof startFg === 'object' && startFg !== null ? startFg.id : startFg);

  while (stack.length > 0) {
    const {x, y} = stack.pop();
    if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT - 5) continue;
    
    const currData = targetGrid[y][x];
    const currId = (typeof currData === 'object' && currData !== null) ? currData.id : currData;
    
    if (currId === targetId) {
      if (isBg && isStartFgEmpty) {
        const fg = wpGrid[y][x];
        if (typeof fg === 'object' && fg !== null ? fg.id : fg) continue;
      }

      // 2. FILL TOOL OVERHAUL: We must enforce deep-cloning of `fillVal` so each tile retains an exclusive memory signature. 
      // Sharing an identical payload object corrupted the entire map when any one block was wrenched later.
      const preciseVal = (typeof fillVal === 'object' && fillVal !== null) ? { ...fillVal } : fillVal;
      targetGrid[y][x] = preciseVal;
      mpChanges.push({x, y, l: isBg ? 'bg' : 'fg', v: preciseVal});
      updateWPAnimatedCellList(x, y, false);
      fillCount++;
      
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);

      stack.push({x: x+1, y});
      stack.push({x: x-1, y});
      stack.push({x, y: y+1});
      stack.push({x, y: y-1});
    }
  }

  if (fillCount > 0) {
    if (typeof mpBroadcastFillAction === 'function') mpBroadcastFillAction(mpChanges);
    if (!isBg) {
      for (let y = minY - 1; y <= maxY + 1; y++) {
        for (let x = minX - 1; x <= maxX + 1; x++) wpUpdateTilingAt(x, y);
      }
    }
    wpUpdateStaticCacheRegion(Math.max(0, minX - 1), Math.max(0, minY - 1), Math.min(WORLD_WIDTH - 1, maxX + 1), Math.min(WORLD_HEIGHT - 1, maxY + 1));
    saveWPHistory();
    updateWPBlockCount();
    saveActiveWorld();
    wpNeedsPostProcess = true;
    wpMarkDirty();
  }
};


window.redirectOriginal = function(element) {
  const imgEl = element.querySelector('img');
  if (!imgEl) return;
  
  const imgSrc = imgEl.getAttribute('src');
  const itemName = element.textContent.trim().toLowerCase();
  
  // Find all li items that are NOT in updatesMenu and specialsMenu
  const allSubmenuItems = document.querySelectorAll(".submenu:not(#updatesMenu):not(#specialsMenu) li");
  
  let matched = false;
  for (const item of allSubmenuItems) {
    const itemImg = item.querySelector('img');
    const itemText = item.textContent.trim().toLowerCase();
    
    // Match by image src (strongest) or exact text name
    if ((itemImg && itemImg.getAttribute('src') === imgSrc) || itemText === itemName) {
      item.click();
      matched = true;
      break;
    }
  }
  
  // Fallback for items with slightly different names
  if (!matched) {
    for (const item of allSubmenuItems) {
      const itemText = item.textContent.trim().toLowerCase();
      if (itemText.includes(itemName) || itemName.includes(itemText)) {
        item.click();
        matched = true;
        break;
      }
    }
  }
  
  if (!matched) {
    console.log("Could not find original item for redirect:", itemName);
    return;
  }
  
  // After equipping, sync ALL Valentine menu highlights based on actual equipped states
  setTimeout(() => {
    const updatesMenu = document.getElementById('updatesMenu');
    if (!updatesMenu) return;
    
    updatesMenu.querySelectorAll('li').forEach(valItem => {
      const valName = valItem.textContent.trim().toLowerCase();
      const valImg = valItem.querySelector('img');
      const valImgSrc = valImg ? valImg.getAttribute('src') : '';
      
      // Find the corresponding original item and check if it's equipped
      let isOrigEquipped = false;
      for (const origItem of allSubmenuItems) {
        const origImg = origItem.querySelector('img');
        const origText = origItem.textContent.trim().toLowerCase();
        if ((origImg && origImg.getAttribute('src') === valImgSrc) || origText === valName) {
          isOrigEquipped = origItem.classList.contains('equipped');
          break;
        }
      }
      
      if (isOrigEquipped) {
        valItem.classList.add('equipped');
      } else {
        valItem.classList.remove('equipped');
      }
    });
  }, 50);
};



/* WORLD PLANNER HOTKEY SETTINGS LOGIC */
let wpHotkeys = {
  tools: {
    pencil: null,
    eraser: null,
    move: null,
    wrench: null,
    copy: null,
    select: null,
    fill: null,
    undo: null,
    redo: null,
    reset: null,
    clear: null,
    grid: null,
    count: null,
    reposition: null,
    save: null,
    blocks: null,
    background: null,
    invert: null
  },
  inventory: {
    "slot-0": null,
    "slot-1": null,
    "slot-2": null,
    "slot-3": null,
    "slot-4": null,
    "slot-5": null,
    "slot-6": null,
    "slot-7": null,
    "slot-8": null,
    "slot-9": null
  }
};

let wpKeyCaptureTarget = null;

function loadWPHotkeys() {
  const saved = localStorage.getItem("wp_custom_hotkeys");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.tools && parsed.inventory) {
        // Migrate: if saved data has old keys (picker, bucket, selection, etc.), reset tools
        const validTools = Object.keys(wpHotkeys.tools);
        const savedToolKeys = Object.keys(parsed.tools);
        const hasOldKeys = savedToolKeys.some(k => !validTools.includes(k));
        if (hasOldKeys) {
          // Keep inventory, reset tools to new schema preserving matching keys
          const newTools = {};
          validTools.forEach(k => { newTools[k] = parsed.tools[k] || null; });
          parsed.tools = newTools;
        }
        wpHotkeys = parsed;
        // Ensure all valid tools exist
        validTools.forEach(k => { if (wpHotkeys.tools[k] === undefined) wpHotkeys.tools[k] = null; });
      }
    } catch (e) {
      console.error("Failed to parse hotkeys:", e);
    }
  }
}

window.openWPSettings = function() {
  const modal = document.getElementById("wp-settings-popup");
  if (!modal) return;
  modal.classList.remove("hidden");
  renderHotkeySettings();
};

const wpToolLabels = {
  pencil: "Place", eraser: "Erase", move: "Move", wrench: "Wrench",
  copy: "Copy", select: "Select", fill: "Fill",
  undo: "Undo", redo: "Redo", reset: "Reset", clear: "Clear",
  grid: "Grid", count: "Count", reposition: "Reposition", save: "Save",
  blocks: "Blocks", background: "Themes"
};
const wpToolIcons = {
  pencil: "pencil", eraser: "eraser", move: "move", wrench: "wrench",
  copy: "copy", select: "box-select", fill: "paint-bucket", invert: "arrow-left-right",
  undo: "undo", redo: "redo", reset: "rotate-ccw", clear: "trash-2",
  grid: "grid", count: "layers", reposition: "maximize", save: "save",
  blocks: "box", background: "cloud"
};

function renderHotkeySettings() {
  const toolsList = document.getElementById("wp-hotkeys-list");
  const invList = document.getElementById("wp-inventory-hotkeys-list");
  if (!toolsList || !invList) return;
  toolsList.innerHTML = "";
  invList.innerHTML = "";

  Object.keys(wpHotkeys.tools).forEach(tool => {
    const key = wpHotkeys.tools[tool];
    const item = document.createElement("div");
    item.className = "wp-hotkey-item";
    
    // Tap to execute row logic
    item.onclick = (e) => {
      if (e.target.closest(".wp-key-cap") || e.target.closest(".wp-hotkey-remove")) return;
      const btn = document.querySelector(`.wp-tool-btn[data-tool="${tool}"]`);
      if (btn) btn.click();
    };

    item.innerHTML = `
      <div class="wp-hotkey-left">
        <div class="wp-hotkey-status"></div>
        <i data-lucide="${wpToolIcons[tool] || 'wrench'}"></i>
        <span class="wp-hotkey-label">${wpToolLabels[tool] || tool}</span>
      </div>
      <div class="wp-hotkey-right">
        <button class="wp-key-cap" data-type="tools" data-id="${tool}" onclick="startHotkeyCapture(this)">${key || ""}</button>
        <button class="wp-hotkey-remove" onclick="clearHotkey('tools', '${tool}')">&times;</button>
      </div>
    `;
    toolsList.appendChild(item);
  });

  for (let i = 0; i < 10; i++) {
    const slotId = `slot-${i}`;
    const key = wpHotkeys.inventory[slotId];
    const item = document.createElement("div");
    item.className = "wp-hotkey-item";
    item.innerHTML = `
      <div class="wp-hotkey-left">
        <div class="wp-hotkey-status"></div>
        <span class="wp-hotkey-label">Slot ${i + 1}</span>
      </div>
      <div class="wp-hotkey-right">
        <button class="wp-key-cap" data-type="inventory" data-id="${slotId}" onclick="startHotkeyCapture(this)">${key || ""}</button>
        <button class="wp-hotkey-remove" onclick="clearHotkey('inventory', '${slotId}')">&times;</button>
      </div>
    `;
    invList.appendChild(item);
  }
  if (window.lucide) lucide.createIcons();
}

window.clearHotkey = function(type, id) {
  wpHotkeys[type][id] = null;
  renderHotkeySettings();
};

function startHotkeyCapture(btn) {
  if (wpKeyCaptureTarget) {
    wpKeyCaptureTarget.classList.remove("capturing");
    wpKeyCaptureTarget.textContent = wpHotkeys[wpKeyCaptureTarget.dataset.type][wpKeyCaptureTarget.dataset.id] || "";
  }

  wpKeyCaptureTarget = btn;
  btn.classList.add("capturing");
  btn.textContent = "...";
}

window.addEventListener("keydown", (e) => {
  // Hotkey Capture mode
  if (wpKeyCaptureTarget) {
    e.preventDefault();
    const newKey = e.key.toLowerCase();
    
    if (newKey === "escape") {
      wpKeyCaptureTarget.classList.remove("capturing");
      wpKeyCaptureTarget.textContent = wpHotkeys[wpKeyCaptureTarget.dataset.type][wpKeyCaptureTarget.dataset.id] || "";
      wpKeyCaptureTarget = null;
      return;
    }

    const type = wpKeyCaptureTarget.dataset.type;
    const id = wpKeyCaptureTarget.dataset.id;
    
    // Check for duplicates
    let isDuplicate = false;
    Object.keys(wpHotkeys.tools).forEach(k => { if (wpHotkeys.tools[k] === newKey && (type !== "tools" || id !== k)) isDuplicate = true; });
    Object.keys(wpHotkeys.inventory).forEach(k => { if (wpHotkeys.inventory[k] === newKey && (type !== "inventory" || id !== k)) isDuplicate = true; });

    if (isDuplicate) {
      alert(`The key "${newKey}" is already assigned to another feature!`);
      wpKeyCaptureTarget.classList.remove("capturing");
      wpKeyCaptureTarget.textContent = wpHotkeys[type][id] || "";
      wpKeyCaptureTarget = null;
      return;
    }

    wpHotkeys[type][id] = newKey;
    wpKeyCaptureTarget.textContent = newKey;
    wpKeyCaptureTarget.classList.remove("capturing");
    wpKeyCaptureTarget = null;
    return;
  }

  // Normal Hotkey Execution
  // Only if World Planner is visible and no input is focused
  const wpContainer = document.getElementById("world-planner-container");
  if (!wpContainer || wpContainer.style.display === "none") return;
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;

  const key = e.key.toLowerCase();

  // Try Tools
  const toolEntry = Object.entries(wpHotkeys.tools).find(([tool, k]) => k === key);
  if (toolEntry) {
    const toolName = toolEntry[0];
    e.preventDefault();

    // Tools that use onclick instead of data-tool attribute
    switch (toolName) {
      case "undo": if (window.wpUndo) window.wpUndo(); return;
      case "redo": if (window.wpRedo) window.wpRedo(); return;
      case "reset": if (window.wpResetWorld) window.wpResetWorld(); return;
      case "clear": if (window.wpClearWorldOnly) window.wpClearWorldOnly(); return;
      case "grid": if (window.wpToggleGrid) window.wpToggleGrid(); return;
      case "count": if (window.toggleWPPopup) window.toggleWPPopup('wp-count-modal'); return;
      case "reposition": if (window.wpReposition) window.wpReposition(); return;
      case "save": if (window.toggleWPPopup) window.toggleWPPopup('wp-save-popup'); return;
    }

    // Tools with data-tool attribute (pencil, eraser, move, wrench, copy, select, fill, blocks, background)
    const btn = document.querySelector(`.wp-tool-btn[data-tool="${toolName}"]`);
    if (btn) btn.click();
    return;
  }

  // Try Inventory
  const invEntry = Object.entries(wpHotkeys.inventory).find(([slot, k]) => k === key);
  if (invEntry) {
    const slotId = invEntry[0];
    const index = parseInt(slotId.split("-")[1]);
    e.preventDefault();
    
    // Correctly click the slot in the inventory drawer
    const drawer = document.getElementById("wp-inventory-drawer");
    if (drawer) {
      const slots = drawer.querySelectorAll(".wp-slot");
      if (slots[index]) {
        slots[index].click();
        // Visual feedback
        slots[index].style.transform = "scale(1.1)";
        setTimeout(() => { slots[index].style.transform = ""; }, 100);
      }
    }
    return;
  }
});

window.saveWPHotkeys = function() {
  localStorage.setItem("wp_custom_hotkeys", JSON.stringify(wpHotkeys));
  toggleWPPopup("wp-settings-popup");
};

window.resetWPHotkeys = function() {
  if (confirm("Are you sure you want to reset all hotkeys to unassigned?")) {
    wpHotkeys = {
      tools: { pencil: null, eraser: null, move: null, wrench: null, copy: null, select: null, fill: null, invert: null, undo: null, redo: null, reset: null, clear: null, grid: null, count: null, reposition: null, save: null, blocks: null, background: null },
      inventory: { "slot-0": null, "slot-1": null, "slot-2": null, "slot-3": null, "slot-4": null, "slot-5": null, "slot-6": null, "slot-7": null, "slot-8": null, "slot-9": null }
    };
    localStorage.setItem("wp_custom_hotkeys", JSON.stringify(wpHotkeys));
    renderHotkeySettings();
  }
};

// Initialize Hotkeys on load
document.addEventListener("DOMContentLoaded", () => {
  loadWPHotkeys();
});

// ==========================================
// NEW FEATURE: WRENCH SLIDE-IN MENU
// ==========================================
window.toggleWrenchMenu = function(menuId) {
  const wpMenu = document.getElementById('wp-wrench-menu');
  const spMenu = document.getElementById('sp-wrench-menu');
  
  if (menuId === 'wp' && wpMenu) {
    if (wpMenu.classList.contains('open')) {
      wpMenu.classList.remove('open');
    } else {
      if (spMenu) spMenu.classList.remove('open');
      wpMenu.classList.add('open');
    }
  } else if (menuId === 'sp' && spMenu) {
    if (spMenu.classList.contains('open')) {
      spMenu.classList.remove('open');
    } else {
      if (wpMenu) wpMenu.classList.remove('open');
      spMenu.classList.add('open');
    }
  }
};

// Close wrench menus if clicked outside
document.addEventListener('click', function(event) {
  const wpMenu = document.getElementById('wp-wrench-menu');
  const spMenu = document.getElementById('sp-wrench-menu');
  
  if (wpMenu && wpMenu.classList.contains('open') && !wpMenu.contains(event.target)) {
    wpMenu.classList.remove('open');
  }
  if (spMenu && spMenu.classList.contains('open') && !spMenu.contains(event.target)) {
    spMenu.classList.remove('open');
  }
});

