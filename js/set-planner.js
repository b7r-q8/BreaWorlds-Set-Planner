window.onload = function () {
  if (window.lucide) {
    lucide.createIcons();
  }
};

let inventory = [];
var wpStaticBGCanvas = null;
var wpStaticBGCtx = null;
const MAX_SLOTS = 10;
let inventoryClickDebounce = false;
let wpTouchActive = false;
let wpLastSmoothingReset = 0;

// Feature toggles
let enableRockerBodySwap = true;
let showRockerMakeupItem = true;
let currentGender = 'male'; // 'male' or 'female'

// ==================== EYE BLINK SYSTEM ====================
let blinkIntervalId = null;
let blinkTimeoutId = null;
const blinkCache = {}; // cache for eye2.png and pupil.png Image objects

function getBlinkImage(src) {
  if (!blinkCache[src]) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = src;
    blinkCache[src] = { img, loaded: false };
    img.onload = () => { blinkCache[src].loaded = true; };
  }
  return blinkCache[src];
}

function startBlinkAnimation() {
  stopBlinkAnimation();
  
  // Pre-cache both sprites
  getBlinkImage('specials/eye2.png');
  getBlinkImage('specials/pupil.png');
  getBlinkImage('specials/female/eye2.png');
  getBlinkImage('specials/female/pupil.png');
  
  blinkIntervalId = setInterval(() => {
    if (window.activePlannerType && window.activePlannerType !== 'set') return;

    const isInvis = isInvisSkinActive();
    const pupilLayer = document.getElementById('pupil');
    const headLayer = document.getElementById('head');
    
    // If invis skin is active, the eyes are on the head layer. Otherwise, they're on the pupil layer.
    const targetLayer = isInvis ? headLayer : pupilLayer;
    if (!targetLayer || targetLayer.style.display === 'none') return;
    

    
    // Normal/tinted skin: swap target layer to eye2.png (tinted if needed)
    const genderPath = currentGender === 'female' ? 'female/' : '';
    const isRobot = isRobotSkinActive();
    const eye2Src = isRobot ? 'specials/robotskin/eye2.png' : ('specials/' + genderPath + 'eye2.png');
    const pupilSrc = isRobot ? 'specials/pupil.png' : ('specials/' + genderPath + 'pupil.png');
    
    const eye2Cache = getBlinkImage(eye2Src);
    const pupilCache = getBlinkImage(pupilSrc);
    if (!eye2Cache.loaded || !pupilCache.loaded) return;
    
    // Save current src to restore later
    const savedSrc = targetLayer.src;
    
    if (activeSkinColor && activeSkinColor !== 'rainbow') {
      // Solid skin color: tint eye2.png with the skin color
      targetLayer.src = tintSpriteCanvas(eye2Cache.img, activeSkinColor);
      blinkTimeoutId = setTimeout(() => {
        targetLayer.src = savedSrc;
      }, 150);
    } else if (activeSkinColor === 'rainbow') {
      // Rainbow skin: tint eye2.png with current rainbow hue
      const color = `hsl(${globalRainbowHue}, 100%, 60%)`;
      targetLayer.src = tintSpriteCanvas(eye2Cache.img, color);
      blinkTimeoutId = setTimeout(() => {
        targetLayer.src = savedSrc;
      }, 150);
    } else {
      // No skin color (default): show untinted eye2.png
      targetLayer.src = eye2Src;
      blinkTimeoutId = setTimeout(() => {
        targetLayer.src = savedSrc;
      }, 150);
    }
  }, 5000);
}

function stopBlinkAnimation() {
  if (blinkIntervalId) { clearInterval(blinkIntervalId); blinkIntervalId = null; }
  if (blinkTimeoutId) { clearTimeout(blinkTimeoutId); blinkTimeoutId = null; }
}

// Start blinking once the page loads
document.addEventListener('DOMContentLoaded', () => {
  startBlinkAnimation();

  // === One-time migration: clear old save slots so users re-save with corrected pivots ===
  if (!localStorage.getItem('saveSlots_v2')) {
    const oldSlots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');
    oldSlots.forEach(num => localStorage.removeItem('saveSlot' + num));
    localStorage.removeItem('saveSlotsList');
    localStorage.setItem('saveSlots_v2', '1');
  }

  // Set the initial active state of hand duplication button from localStorage
  const btn = document.getElementById('btnDuplicateHand');
  if (btn) {
    if (isDuplicateHandEnabled) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  // Orientation warning overlay logic
  const orientationOverlay = document.getElementById('orientation-warning-overlay');
  const proceedBtn = document.getElementById('proceed-vertical-btn');
  if (orientationOverlay && proceedBtn) {
    // Only show overlay if not confirmed
    if (localStorage.getItem('vertical_proceed_confirmed')) {
      orientationOverlay.style.display = 'none';
    } else {
      orientationOverlay.style.display = '';
    }
    proceedBtn.onclick = function() {
      orientationOverlay.style.display = 'none';
      localStorage.setItem('vertical_proceed_confirmed', '1');
    };
  }
});
// ==========================================================

// ==================== SKIN COLOR SYSTEM ====================
// Current active skin color (null = default white/specials, 'rainbow' = animated)
let activeSkinColor = null;
let skinRainbowAnimFrame = null;

// Global Rainbow Clock for syncing items (like Myth Cape) with the Rainbow Skin
let globalRainbowHue = 0;
const mythCapeCache = {};

let _rainbowLoopRunning = false;

function globalRainbowLoop() {
  if (window.activePlannerType && window.activePlannerType !== 'set') {
    if (_rainbowLoopRunning) requestAnimationFrame(globalRainbowLoop);
    return;
  }
  // Use performance.now() to make the rainbow cycle speed framerate-independent.
  // 30 degrees per second is roughly equivalent to the old 0.5 deg/frame at 60fps.
  globalRainbowHue = (performance.now() * 0.015) % 360;
  document.documentElement.style.setProperty('--global-rainbow-hue', globalRainbowHue + 'deg');
  
  // Custom canvas-based tinting for Myth Cape to exactly match Rainbow Skin
  const capesLayer = document.getElementById('capes');
  if (capesLayer && capesLayer.classList.contains('rainbow-overlay-active')) {
    // The Myth Cape is a static item, so we directly tint its base image
    const srcPath = 'capes/cape24/1.png';
    
    if (!mythCapeCache[srcPath]) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = srcPath;
      mythCapeCache[srcPath] = { img: img, loaded: false };
      img.onload = () => { mythCapeCache[srcPath].loaded = true; };
    } else if (mythCapeCache[srcPath].loaded) {
      const color = `hsl(${globalRainbowHue}, 100%, 60%)`;
      capesLayer.src = tintSpriteCanvas(mythCapeCache[srcPath].img, color);
    }
  }

  // PERF: Only continue loop if rainbow features are still active
  const capeNeedsRainbow = capesLayer && capesLayer.classList.contains('rainbow-overlay-active');
  if (activeSkinColor === 'rainbow' || capeNeedsRainbow) {
    requestAnimationFrame(globalRainbowLoop);
  } else {
    _rainbowLoopRunning = false;
  }
}

// PERF: Start rainbow loop on-demand instead of always running at 60fps
function ensureGlobalRainbowRunning() {
  if (!_rainbowLoopRunning) {
    _rainbowLoopRunning = true;
    requestAnimationFrame(globalRainbowLoop);
  }
}
// Don't start on load — will be started when rainbow skin or cape is equipped

// Cache for original (untinted) body part images
const skinOriginalImages = {};

// All skin color options
const SKIN_COLORS = [
  '#fee3c6', '#fde7ad', '#f8d998', '#f9d4a0', '#ecc091', '#f2c280',
  '#d49e7a', '#bb6536', '#cf965f', '#ad8a60', '#935f37', '#733f17',
  '#b26644', '#7f4422', '#5f3310', '#291709', '#538bdb', '#5cc43c',
  '#d64a29', '#ffdd37', '#ff882b', '#6a26a5', '#808080', '#c93ecd'
];

// Body part IDs that get skin tinting
const SKIN_TINT_PARTS = ['base', 'body', 'arm', 'leg', 'feet', 'head'];

// Load and cache an original sprite image
function loadSkinOriginal(partId) {
  return new Promise((resolve) => {
    const cacheKey = partId + '_' + currentGender;
    if (skinOriginalImages[cacheKey]) {
      resolve(skinOriginalImages[cacheKey]);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      skinOriginalImages[cacheKey] = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    // Use the specials path for the originals
    let specialsPath = 'specials/';
    if (currentGender === 'female' && (partId === 'body' || partId === 'pupil' || partId === 'eye2')) {
        specialsPath = 'specials/female/';
    }
    img.src = specialsPath + partId + '.png';
  });
}

// Tint a sprite image with a given color using canvas multiply blend
function tintSpriteCanvas(originalImg, hexColor) {
  const canvas = document.createElement('canvas');
  canvas.width = originalImg.width;
  canvas.height = originalImg.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Draw original sprite
  ctx.drawImage(originalImg, 0, 0);

  // Apply color tint using multiply blend mode
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Restore alpha from original (multiply affects transparency)
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(originalImg, 0, 0);

  return canvas.toDataURL('image/png');
}

// Apply skin color tint to all body parts
async function applySkinTint(hexColor) {
  for (const partId of SKIN_TINT_PARTS) {
    const original = await loadSkinOriginal(partId);
    if (!original) continue;

    // Prevent race conditions: abort if skin color was changed or cleared while loading image
    const isRainbow = activeSkinColor === 'rainbow' && hexColor.startsWith('hsl');
    if (activeSkinColor !== hexColor && !isRainbow) return;

    const tintedDataUrl = tintSpriteCanvas(original, hexColor);
    const el = document.getElementById(partId);
    if (el) {
      // Only tint if element is using specials/ src (not invis/rocker)
      const currentSrc = el.getAttribute('src') || el.src || '';
      if (currentSrc.includes('specials/') || currentSrc.startsWith('data:')) {
        el.src = tintedDataUrl;
      }
    }
  }

  // Ensure diaper overlays are visible after tinting completes.
  // This runs at the END of the async work so it always fires after body/leg are tinted.
  const isInvis = isInvisSkinActive();
  const isRocker = isRockerMakeupActive();
  const isGhost = isGhostOutfitActive();
  const dBody = document.getElementById('diaperbody');
  const dLeg = document.getElementById('diaperleg');
  if (dBody) {
    const bodyHidden = document.getElementById('body')?.style.display === 'none';
    dBody.style.display = (bodyHidden || !activeSkinColor || isGhost || isInvis || isRocker) ? 'none' : 'block';
    dBody.style.opacity = '1';
  }
  if (dLeg) {
    const legHidden = document.getElementById('leg')?.style.display === 'none';
    dLeg.style.display = (legHidden || !activeSkinColor || isGhost || isInvis || isRocker) ? 'none' : 'block';
    dLeg.style.opacity = '1';
  }
}

// Clear skin tint - restore original specials sprites
function clearSkinTint() {
  stopSkinRainbow();
  activeSkinColor = null;
  SKIN_TINT_PARTS.forEach(partId => {
    const el = document.getElementById(partId);
    if (el) {
      const currentSrc = el.getAttribute('src') || el.src || '';
      if (currentSrc.startsWith('data:') || currentSrc.includes('specials/')) {
        el.src = 'specials/' + partId + '.png';
      }
    }
  });
  // Hide diaper overlays when tint is cleared
  const dBody = document.getElementById('diaperbody');
  const dLeg = document.getElementById('diaperleg');
  if (dBody) dBody.style.display = 'none';
  if (dLeg) dLeg.style.display = 'none';
}

// Gender System
window.setGender = function(element, gender) {
    currentGender = gender;
    
    // Update UI - mark as equipped in the gender menu
    document.querySelectorAll('#genderMenu li').forEach(li => li.classList.remove('equipped'));
    if (element) {
        element.classList.add('equipped');
    } else {
        // If called without element (e.g. from loadState), find the right one
        const targetId = gender === 'male' ? 'maleOption' : 'femaleOption';
        const targetLi = document.getElementById(targetId);
        if (targetLi) targetLi.classList.add('equipped');
    }
    
    syncBodyParts();
    updateMenuIconsForGender();
    saveState();
}

function updateMenuIconsForGender() {
    const genderPath = currentGender === 'female' ? 'female/' : '';
    const pupilSrc = 'specials/' + genderPath + 'pupil.png';
    
    // Update all gender-pupil images in the menu
    document.querySelectorAll('.gender-pupil').forEach(img => {
        img.src = pupilSrc;
    });
    
    // Update the Base Character icon if it exists
    const baseCharIcon = document.getElementById('baseCharacterIcon');
    if (baseCharIcon) {
        const pupilEl = baseCharIcon.querySelector('.gender-icon-pupil');
        if (pupilEl) pupilEl.src = pupilSrc;
    }
}

// Generate tinted head icons for all skin color menu items
function generateSkinMenuIcons() {
    const headImg = new Image();
    headImg.crossOrigin = 'anonymous';
    headImg.onload = function() {
        document.querySelectorAll('img.skin-icon-head[data-tint-color]').forEach(function(imgEl) {
            const color = imgEl.dataset.tintColor;
            if (color === 'rainbow') {
                // For rainbow, just show the untinted head
                imgEl.src = 'specials/head.png';
                return;
            }
            // Use the existing tintSpriteCanvas function to tint the head
            const tintedDataUrl = tintSpriteCanvas(headImg, color);
            imgEl.src = tintedDataUrl;
        });
    };
    headImg.src = 'specials/head.png';
}

// Rainbow skin animation
function startSkinRainbow() {
  stopSkinRainbow();
  activeSkinColor = 'rainbow';
  ensureGlobalRainbowRunning(); // PERF: Start rainbow loop on demand

  function animateRainbow() {
    if (window.activePlannerType && window.activePlannerType !== 'set') {
      skinRainbowAnimFrame = requestAnimationFrame(animateRainbow);
      return;
    }
    if (activeSkinColor !== 'rainbow') return;
    globalRainbowHue = (performance.now() * 0.015) % 360; // Ensure hue is fresh
    const color = `hsl(${globalRainbowHue}, 100%, 60%)`;
    applySkinTint(color);
    skinRainbowAnimFrame = requestAnimationFrame(animateRainbow);
  }
  skinRainbowAnimFrame = requestAnimationFrame(animateRainbow);
}

function stopSkinRainbow() {
  if (skinRainbowAnimFrame) {
    cancelAnimationFrame(skinRainbowAnimFrame);
    skinRainbowAnimFrame = null;
  }
}

// Equip a skin color from the specials menu
window.equipSkinColor = function(element, color) {
  // Stop any active rainbow
  stopSkinRainbow();

  // Ensure we're on Normal character (not invis or DJC or NJC or GSC) - do this WITHOUT calling
  // equipNormalCharacter since that clears skin tint
  if (isInvisSkinActive() || isDarkJesterActive() || isNormalJesterActive() || isGoldenSkeletonActive() || isSkeletonActive()) {
    // Clean up DJC/NJC specific layers
    if (isDarkJesterActive()) hideDjcLayers();
    if (isNormalJesterActive()) hideNjcLayers();
    
    // Restore arm to normal positioning (may have been overridden by DJC)
    const armRestore = document.getElementById('arm');
    if (armRestore) armRestore.style.transform = '';

    // Restore body parts to normal (non-invis) state
    const baseElement = document.getElementById('base');
    const headElement = document.getElementById('head');
    const genderPath = currentGender === 'female' ? 'female/' : '';
    
    if (baseElement) {
      baseElement.style.display = 'block';
      baseElement.src = 'specials/base.png';
      baseElement.style.opacity = '1';
      baseElement.style.clipPath = '';
    }
    if (headElement) {
      headElement.style.display = 'block';
      headElement.src = 'specials/head.png';
      headElement.style.opacity = '1';
    }
    
    const pupilLayer = document.getElementById('pupil');
    if (pupilLayer) {
        pupilLayer.src = 'specials/' + genderPath + 'pupil.png';
    }
    const bodyParts = ['body', 'leg', 'feet', 'pupil', 'arm'];
    bodyParts.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'block';
        el.style.opacity = '1';
      }
    });
  }

  if (color === 'rainbow') {
    startSkinRainbow();
  } else {
    activeSkinColor = color;
    applySkinTint(color);
  }

  // Mark as equipped in the specials menu
  document.querySelectorAll('#specialsMenu li').forEach(li => li.classList.remove('equipped'));
  element.classList.add('equipped');

  syncBodyParts();
  saveState();
}

// Central mapping for Rocker Makeup variants
const rockerVariants = {
  // Shirts
  'shirts/shirt42/bluebody.png': 'shirts/shirt42/rockerbluebikini.png',
  'shirts/shirt64/redbody.png': 'shirts/shirt64/rockerredbikini.png',
  'shirts/shirt67/santabody.png': 'shirts/shirt67/rockersantared.png',
  'shirts/shirt54/goldbody.png': 'shirts/shirt54/rockersantagold.png',
  'shirts/shirt62/pinkbody.png': 'shirts/shirt62/rockersantapink.png',
  'shirts/shirt3/shirt3body.png': 'shirts/shirt3/rockershark.png',
  'shirts/shirt12/shirt12body.png': 'shirts/shirt12/rockerelf.png',
  'shirts/shirt7/shirt7body.png': 'shirts/shirt7/rockerblueshirt.png',
  'shirts/shirt5/shirt5body.png': 'shirts/shirt5/rockerblackshirt.png',
  'shirts/shirt20/greenshirtbody.png': 'shirts/shirt20/rockergreenshirt.png',
  'shirts/shirt30/redshirtbody.png': 'shirts/shirt30/rockerredshirt.png',
  'shirts/shirt38/whitshirtbody.png': 'shirts/shirt30/rockerwhiteshirt.png',
  'shirts/shirt41/shirtyellowbody.png': 'shirts/shirt41/rockeryellowshirt.png',
  'shirts/shirt71/spbody.png': 'shirts/shirt71/rockermistressshirt.png',
  'shirts/shirt59/msbody.png': 'shirts/shirt59/rockermsclausshirt.png',
  // Pants
  'pants/pants33/summershort.png': 'pants/pants33/rockersummershorts.png',
  'pants/pants35/bluebody.png': 'pants/pants35/rockerblueskirt.png',
  'pants/pants36/redbody.png': 'pants/pants36/rockerredskirt.png',
  'pants/pants37/tikibody.png': 'pants/pants37/rockertikiskirt.png',
  'pants/pants34/clownshorts.png': 'pants/pants34/rockerclownshorts.png',
  // Shoes
  'shoes/shoes18/greenslip.png': 'shoes/shoes18/rockergreenslip.png',
  'shoes/shoes11/duckbody.png': 'shoes/shoes11/rockerduckshoes.png',
  'shoes/shoes40/spbody.png': 'shoes/shoes40/rockermistresshoes.png',
  'shoes/shoes5/blueslip.png': 'shoes/shoes5/rockerblueslip.png',
  'shoes/shoes20/greenslip.png': 'shoes/shoes20/rockergreenslipper.png',
  'shoes/shoes32/redslip.png': 'shoes/shoes32/rockerredslip.png',
  'shoes/shoes44/yellowslip.png': 'shoes/shoes44/rockeryellowslipper.png'
};

// Helper function to check if rocker makeup is equipped
function isRockerMakeupActive() {
  if (!enableRockerBodySwap) return false;
  const eyesLayer = document.getElementById('eyes');
  // Check if eyes layer is showing rocker makeup
  // We check for 'rocker.png' in the src
  return eyesLayer && eyesLayer.style.display === 'block' && eyesLayer.src && eyesLayer.src.includes('rocker.png');
}

// In-page scene scale (character only, platforms stay full quality)
let sceneScale = 0.5;
let manualZoom = false;
let activeAnimations = {};

function applySceneScale() {
  const scene = document.querySelector('.character-scene');
  if (!scene) return;

  // Ensure sceneScale is a valid number and within reasonable bounds
  if (isNaN(sceneScale) || typeof sceneScale !== 'number') {
    sceneScale = 1.0;
  }

  // Update scale based on current width (only if user hasn't zoomed manually)
  if (!manualZoom) {
    if (window.innerWidth <= 768) {
      sceneScale = 0.3;
    } else {
      sceneScale = 0.5;
    }
  }

  // Force clamp again just to be absolutely sure
  const minScale = 0.3;
  const maxScale = 1.4;
  sceneScale = Math.min(maxScale, Math.max(minScale, sceneScale));

  // iOS Safari handles 'zoom' by smoothing/restoring pixels, which ruins pixel art.
  // We force CSS transforms for iOS to maintain high-quality nearest-neighbor scaling.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS || isSafari) {
    scene.style.zoom = ''; // Clear zoom
    scene.style.transform = `scale(${sceneScale})`;
  } else {
    // Use zoom for better pixel art clarity and stable layout (matches Windows Chrome behavior)
    scene.style.zoom = sceneScale;

    // Fallback for browsers that truly don't support zoom (like Firefox)
    if (window.getComputedStyle(scene).zoom === undefined) {
      scene.style.transform = `scale(${sceneScale})`;
    } else {
      scene.style.transform = ''; // Clear transform if zoom is used
    }
  }
}

// Update scale on resize/rotation
window.addEventListener('resize', applySceneScale);
window.addEventListener('orientationchange', applySceneScale);

// Debug tool for layout issues
window.debugLayout = function () {
  const elements = ['.character', '.character-scene', '.base-wrapper', '#body', '#head', '#arm'];
  console.log('--- LAYOUT DEBUG ---');
  console.log('Viewport Width:', window.innerWidth);
  console.log('Scene Scale:', sceneScale);
  elements.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    console.log(`${sel}:`, {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
      zoom: style.zoom,
      transform: style.transform
    });
  });
  console.log('--------------------');
}

window.changeSceneScale = function (delta) {
  manualZoom = true;
  const minScale = 0.3;
  const maxScale = 1.4;
  sceneScale = Math.min(maxScale, Math.max(minScale, (parseFloat(sceneScale) || 1.0) + delta));
  applySceneScale();
  saveState();
}

window.resetZoom = function () {
  manualZoom = false; // Allow auto-scaling again
  if (window.innerWidth <= 768) {
    sceneScale = 0.3;
  } else {
    sceneScale = 0.5;
  }
  applySceneScale();
  saveState();
}

// Save state to localStorage
function saveState() {
  const state = {
    manualZoom: manualZoom,
    sceneScale: sceneScale,
    skinColor: activeSkinColor,
    currentGender: currentGender,
    darkJesterActive: isDarkJesterActive(),
    normalJesterActive: isNormalJesterActive(),
    robotActive: isRobotSkinActive(),
    draculaActive: isDraculaSkinActive(),
    invisActive: isInvisSkinActive(),
    equippedItems: {},
    background: document.body.style.backgroundImage || '',
    platformSrc: document.getElementById("platforms")?.dataset.originalSrc || document.getElementById("platforms")?.src || '',
    inventory: inventory.map(item => ({
      type: item.type,
      src: item.src,
      icon: item.icon
    }))
  };

  // Save equipped items for each layer
  // Save equipped items for each layer
  const layers = ['base', 'body', 'leg', 'feet', 'arm', 'shirtsbehind', 'head', 'pupil', 'hat', 'hair', 'headgears', 'shirtstop', 'eyes', 'faces', 'shirts', 'pants', 'shoes', 'rightshoe', 'hands', 'shirtsabove', 'capes', 'capesabove', 'wings', 'backpacks', 'pets-back', 'cars', 'floaties', 'scarfs', 'necklaces', 'pets'];
  layers.forEach(layerName => {
    const layer = document.getElementById(layerName);
    // Check if layer is visible and has content (either src or active animation)
    const isVisible = layer && layer.style && layer.style.display !== 'none';
    const hasContent = layer && (layer.src || (activeAnimations && activeAnimations[layerName]));

    if (isVisible && hasContent) {
      // Special handling for base character parts (no menu element)
      if (['base', 'body', 'leg', 'feet', 'pupil'].includes(layerName)) {
        // If skin color is active, body parts use data: URLs - save the original path instead
        let savedSrc = layer.src;
        if (activeSkinColor && savedSrc.startsWith('data:') && SKIN_TINT_PARTS.includes(layerName)) {
          savedSrc = 'specials/' + layerName + '.png';
        }
        state.equippedItems[layerName] = {
          src: savedSrc,
          opacity: layer.style.opacity || '',
          transform: layer.style.transform || ''
        };
      } else if (layerName === 'head') {
        // Special handling for head layer (may be changed by invis skin)
        let savedHeadSrc = layer.src;
        if (activeSkinColor && savedHeadSrc.startsWith('data:')) {
          savedHeadSrc = 'specials/head.png';
        }
        state.equippedItems[layerName] = {
          src: savedHeadSrc,
          transform: layer.style.transform || ''
        };

      } else if (layerName === 'arm') {
        let savedArmSrc = layer.src;
        if (activeSkinColor && savedArmSrc.startsWith('data:')) {
          savedArmSrc = 'specials/arm.png';
        }
        state.equippedItems[layerName] = {
          src: savedArmSrc,
          opacity: layer.style.opacity || '',
          transform: layer.style.transform || ''
        };
      } else {
        // Find the menu element to get the original src
        const menuElement = findEquippedMenuElement(layerName);

        if (menuElement) {
          const transform = layer.style.transform || '';
          const scaleMatch = transform.match(/scale\(([^)]+)\)/);
          const translateMatch = transform.match(/translate\(([^)]+)\)/);

          const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
          const translate = translateMatch ? translateMatch[1].split(',').map(v => parseFloat(v.trim())) : [0, 0];

          // Get original src from menu element (not current frame for animated items)
          let originalSrc;
          if (layerName === 'hat') {
            originalSrc = menuElement.dataset.hat;
          } else if (menuElement.dataset.animated === 'true') {
            // For animated items, use the frames path as the src
            originalSrc = menuElement.dataset.frames;
          } else {
            originalSrc = menuElement.dataset.src;
          }

          state.equippedItems[layerName] = {
            src: originalSrc,
            scale: scale,
            x: translate[0] || 0,
            y: translate[1] || 0,
            animated: activeAnimations[layerName] ? true : false
          };

          // If animated, store animation data
          if (activeAnimations[layerName] && menuElement.dataset.animated === 'true') {
            state.equippedItems[layerName].framesPath = menuElement.dataset.frames;
            state.equippedItems[layerName].frameCount = Number(menuElement.dataset.frameCount);
            state.equippedItems[layerName].fps = Number(menuElement.dataset.fps) || 8;
          }
        } else {
          console.warn(`No menu element found for layer ${layerName}, but layer has src:`, layer.src);
        }
      }
    }
  });

  try {
    localStorage.setItem('overlayState', JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save overlayState:', error);
  }
  // Apply scale immediately after saving to ensure consistency
  applySceneScale();
}

// Load state from localStorage
function loadState() {
  const saved = localStorage.getItem('overlayState');
  if (!saved) {
    // === FIRST TIME LOAD DEFAULT ===
    // Equip Platform 1 by default
    const platform1Btn = document.querySelector('[data-layer="platforms"][data-src*="platform1"]');
    if (platform1Btn) {
      setPlatform(platform1Btn.dataset.src, true);
    }
    // Set default background (already handled by setBackground default if not in state, but explicit here is good)
    setBackground('backgrounds/bg3.png', true);

    // Set default skin color to Tan
    const tanSkinBtn = document.querySelector('#specialsMenu li[data-skin-color="#d49e7a"]');
    if (tanSkinBtn) {
      equipSkinColor(tanSkinBtn, '#d49e7a');
    }

    // Ensure correct z-indices are initialized
    overrideLayerOrder();
    return;
  }

  try {
    const state = JSON.parse(saved);

    // Restore scaling preference
    if (state.manualZoom !== undefined) manualZoom = state.manualZoom;
    if (state.sceneScale !== undefined) {
      sceneScale = parseFloat(state.sceneScale) || 0.5;
      // Clamp loaded value just in case
      sceneScale = Math.min(1.4, Math.max(0.3, sceneScale));
    }

    // Apply scale immediately after restoring it
    applySceneScale();
    
    // Restore gender
    if (state.currentGender) {
        currentGender = state.currentGender;
        // Mark as equipped in UI
        const targetId = currentGender === 'male' ? 'maleOption' : 'femaleOption';
        const targetLi = document.getElementById(targetId);
        if (targetLi) {
            document.querySelectorAll('#genderMenu li').forEach(li => li.classList.remove('equipped'));
            targetLi.classList.add('equipped');
        }
    }
    
    // Update menu icons to match loaded gender
    updateMenuIconsForGender();

    // Clear inventory before restoring (will be rebuilt by equipItem/equipHat calls)
    inventory = [];

    // Restore background
    if (state.background) {
      const bgSrc = state.background.replace('url("', '').replace('")', '').replace('url(', '').replace(')', '');
      setBackground(bgSrc, true);
    } else {
      // Set default background and theme if no background saved
      setBackground('backgrounds/bg3.png', true);
    }

    // RESTORE PLATFORMS
    if (state.platformSrc) {
      setPlatform(state.platformSrc, true);
    } else {
      // Default if no state
      const platform1Btn = document.querySelector('[data-layer="platforms"][data-src*="platform1"]');
      if (platform1Btn) setPlatform(platform1Btn.dataset.src, true);
    }

    // Restore equipped items
    Object.keys(state.equippedItems || {}).forEach(layerName => {
      const itemData = state.equippedItems[layerName];

      // Special handling for base character parts
      if (['base', 'body', 'leg', 'feet', 'pupil'].includes(layerName)) {
        const element = document.getElementById(layerName);
        if (element) {
          element.style.display = 'block';
          element.src = itemData.src;
          // Ensure we don't restore 'none' which would override CSS translations
          const t = itemData.transform || '';
          element.style.transform = (t === 'none') ? '' : t;
          if (itemData.opacity !== undefined && itemData.opacity !== '') {
            element.style.opacity = itemData.opacity;
          }
        }
        return;
      }

      // Special handling for head layer
      if (layerName === 'head') {
        const headElement = document.getElementById('head');
        if (headElement) {
          headElement.style.display = 'block';
          syncHeadSprite();
          // Ensure we don't restore 'none' which would override CSS translations
          const t = itemData.transform || '';
          headElement.style.transform = (t === 'none') ? '' : t;

          // If head is invisibleskin, mark the invis character as equipped in UI
          if (itemData.src.includes('invisibleskin') || itemData.src.includes('pupil.png')) {
            document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
            const invisMenuItem = document.querySelector("#specialsMenu li[onclick*='equipInvisCharacter']");
            if (invisMenuItem) invisMenuItem.classList.add("equipped");
          } else if (itemData.src.includes('gsc/head.png')) {
            // Golden Skeleton Character
            document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
            const gscMenuItem = document.querySelector("#specialsMenu li[onclick*='equipGoldenSkeleton']");
            if (gscMenuItem) gscMenuItem.classList.add("equipped");
            headElement.style.opacity = "1";
            
            const legElement = document.getElementById('leg');
            const pupilElement = document.getElementById('pupil');
            if (legElement) { legElement.style.display = 'none'; legElement.style.opacity = '0'; }
            if (pupilElement) { pupilElement.style.display = 'none'; pupilElement.style.opacity = '0'; }
          } else if (itemData.src.includes('sc/head.png')) {
            // Skeleton Character
            document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
            const scMenuItem = document.querySelector("#specialsMenu li[onclick*='equipSkeleton']");
            if (scMenuItem) scMenuItem.classList.add("equipped");
            headElement.style.opacity = "1";
            
            const legElement = document.getElementById('leg');
            const pupilElement = document.getElementById('pupil');
            if (legElement) { legElement.style.display = 'none'; legElement.style.opacity = '0'; }
            if (pupilElement) { pupilElement.style.display = 'none'; pupilElement.style.opacity = '0'; }
          } else if (itemData.src.includes('robotskin/head.png')) {
            // Robot Character
            document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
            const robotBtn = document.getElementById('robotSkinBtn');
            if (robotBtn) robotBtn.classList.add("equipped");
          } else if (itemData.src.includes('specials/head.png')) {
            // Normal character or Dracula
            document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
            if (state.draculaActive) {
                const draculaBtn = document.getElementById('draculaSkinBtn');
                if (draculaBtn) draculaBtn.classList.add("equipped");
            } else {
                const normalMenuItem = document.querySelector("#specialsMenu li[onclick*='equipNormalCharacter']");
                if (normalMenuItem) normalMenuItem.classList.add("equipped");
            }
            headElement.style.opacity = "";
          }

          // Force body parts to be invisible if invis skin is equipped
          if (itemData.src.includes('invisibleskin')) {
            const bodyParts = ['body', 'leg', 'feet', 'pupil', 'arm'];
            bodyParts.forEach(id => {
              const element = document.getElementById(id);
              if (element) {
                if (id === 'pupil') {
                  // Check if an eye exception is equipped
                  const eyeData = state.equippedItems['eyes'];
                  if (eyeData && isEyeException(eyeData.src)) {
                    element.style.opacity = "1";
                  } else {
                    element.style.opacity = "0";
                  }
                } else {
                  element.style.opacity = "0";
                }
              }
            });

            // Handle Invis Skin head visibility
            const headLayer = document.getElementById('head');
            const eyeData = state.equippedItems['eyes'];
            if (headLayer) {
              if (eyeData && !isEyeException(eyeData.src)) {
                headLayer.style.opacity = "0";
              } else {
                headLayer.style.opacity = "1";
              }
            }
          }
        }
        return;
      }

      // Special handling for arm layer
      if (layerName === 'arm') {
        const armElement = document.getElementById('arm');
        if (armElement) {
          armElement.style.display = 'block';
          armElement.src = itemData.src;
          // Ensure we don't restore 'none' which would override CSS translations
          const t = itemData.transform || '';
          armElement.style.transform = (t === 'none') ? '' : t;
          if (itemData.opacity !== undefined && itemData.opacity !== '') {
            armElement.style.opacity = itemData.opacity;
          } else {
            armElement.style.opacity = '1';
          }
        }
        return;
      }

      const menuElement = findMenuElementBySrc(layerName, itemData.src);

      if (menuElement) {
        if (layerName === 'hat') {
          equipHat(itemData.src, menuElement);
        } else {
          equipItem(menuElement);
        }
      } else {
        console.log('Menu element not found for:', layerName, itemData.src);
        // If menu element not found, manually restore the layer
        const layer = document.getElementById(layerName);
        if (layer) {
          layer.style.display = 'block';

          // For animated items, start animation
          if (itemData.animated && itemData.framesPath) {
            console.log('Manually starting animation for', layerName, itemData.framesPath);
            startAnimation(layer, {
              framesPath: itemData.framesPath,
              frameCount: itemData.frameCount,
              fps: itemData.fps
            });
          } else {
            layer.src = itemData.src;
          }

          // Myth Cape Rainbow Logic Overlay
          if (layerName === 'capes') {
            if (itemData.src && itemData.src.includes('cape24')) {
              layer.classList.add('rainbow-overlay-active');
              ensureGlobalRainbowRunning();
            } else {
              layer.classList.remove('rainbow-overlay-active');
            }
          }

          layer.style.transform = `
            translateX(-50%)
            translate(${itemData.x}px, ${itemData.y}px)
            scale(${itemData.scale})
          `;
        }
      }
    });

    // Restore inventory directly from saved state (important when no items are equipped)
    if (state.inventory && Array.isArray(state.inventory)) {
      inventory = state.inventory.map(item => {
        // Restore the menuElement reference by finding it in the menu
        const menuElement = findMenuElementBySrc(item.type, item.src);
        return {
          ...item,
          menuElement: menuElement
        };
      });
      renderInventory();
    }

    // Sync state classes (like ghost-active) based on what's equipped
    isGhostOutfitActive();

    // Sync all body parts based on restored items
    syncBodyParts();

    // Restore skin color
    if (state.skinColor) {
      activeSkinColor = state.skinColor;
      if (activeSkinColor === 'rainbow') {
        startSkinRainbow();
      }
      // Mark the correct skin color menu item as equipped
      const skinBtn = document.querySelector(`#specialsMenu li[data-skin-color="${activeSkinColor}"]`);
      if (skinBtn) {
        document.querySelectorAll('#specialsMenu li').forEach(li => li.classList.remove('equipped'));
        skinBtn.classList.add('equipped');
      }
      // Re-sync body parts now that activeSkinColor is set.
      syncBodyParts();
    } else {
      // Default to Tan if they had no skin color saved (old default) and no special character equipped
      let isSpecialCharacter = false;
      const headData = state.equippedItems && state.equippedItems['head'];
      if (headData && headData.src) {
        if (headData.src.includes('invisibleskin') || headData.src.includes('gsc/head.png') || headData.src.includes('sc/head.png') || headData.src.includes('jester_head2.png') || headData.src.includes('robotskin/head.png') || state.draculaActive) {
          isSpecialCharacter = true;
        }
      }
      
      if (!isSpecialCharacter) {
        activeSkinColor = '#d49e7a';
        const skinBtn = document.querySelector(`#specialsMenu li[data-skin-color="#d49e7a"]`);
        if (skinBtn) {
          document.querySelectorAll('#specialsMenu li').forEach(li => li.classList.remove('equipped'));
          skinBtn.classList.add('equipped');
        }
        syncBodyParts();
      }
    }

    // Restore Invis Skin Character if it was active
    if (state.invisActive || (state.equippedItems && state.equippedItems['head'] && (state.equippedItems['head'].src.includes('invisibleskin') || state.equippedItems['head'].src.includes('pupil.png')))) {
      const invisBtn = document.querySelector('#specialsMenu li[onclick*="equipInvisCharacter"]');
      if (invisBtn) {
        document.querySelectorAll('#specialsMenu li').forEach(el => el.classList.remove('equipped'));
        equipInvisCharacter(invisBtn);
      }
    }

    // Restore Dark Jester Character if it was active
    if (state.darkJesterActive) {
      const djcBtn = document.querySelector('#specialsMenu li[onclick*="equipDarkJester"]');
      if (djcBtn) {
        equipDarkJester(djcBtn);
      }
    }

    // Restore Normal Jester Character if it was active
    if (state.normalJesterActive) {
      const njcBtn = document.querySelector('#specialsMenu li[onclick*="equipNormalJester"]');
      if (njcBtn) {
        equipNormalJester(njcBtn);
      }
    }

    // Save state once at the end to ensure everything is saved together
    saveState();
    
    // Ensure correct JS layer sorting on reload
    overrideLayerOrder();
  } catch (e) {
    console.error('Error loading state:', e);
  }
}

// Helper function to find menu element by layer and src
function findMenuElementBySrc(layerName, src) {
  // Broad search for both LI (side menu) and IMG (top drawer/platforms)
  const allMenuItems = document.querySelectorAll('.submenu li, .platform-menu-drawer img, .bg-menu-drawer img');

  for (const item of allMenuItems) {
    if (layerName === 'hat') {
      if (item.dataset.hat === src) return item;
    } else if (layerName === 'background') {
      // For background images, check src directly or onclick handlers
      if (item.src === src || (item.onclick && item.onclick.toString().includes(src))) return item;
    } else {
      // Improve logic to handle relative vs absolute path matches
      const targetSrc = item.dataset.src || item.dataset.frames || item.dataset.hat;
      const srcParts = src.split('/').filter(Boolean);
      const targetParts = targetSrc ? targetSrc.split('/').filter(Boolean) : [];

      // Strict matching: exact match, or target is suffix of src, or src is suffix of target
      // This prevents false positives like cape9/1.png matching cape10/1.png
      let isSrcMatch = false;
      if (targetSrc) {
        if (src === targetSrc || src.includes(targetSrc) || targetSrc.includes(src)) {
          isSrcMatch = true;
        } else if (srcParts.length >= 2 && targetParts.length >= 2) {
          // For paths like "capes/cape9/1.png", compare the last 2 parts (folder + filename)
          const srcLast2 = srcParts.slice(-2).join('/');
          const targetLast2 = targetParts.slice(-2).join('/');
          isSrcMatch = srcLast2 === targetLast2;
        }
      }

      if ((item.dataset.layer === layerName || (layerName === 'shirts' && item.dataset.layer === 'outfits')) && isSrcMatch) return item;

      // Also check for animated items by frames path
      if ((item.dataset.layer === layerName || (layerName === 'shirts' && item.dataset.layer === 'outfits')) && item.dataset.animated === 'true' && item.dataset.frames) {
        const framesPath = item.dataset.frames;
        if (src === framesPath || src.includes(framesPath)) {
          return item;
        }
      }
    }
  }

  return null;
}

// Helper function to find equipped menu element by checking equipped class
function findEquippedMenuElement(layerName) {
  // Search BOTH li (side menu) and img (top drawer)
  const allMenuItems = document.querySelectorAll('.submenu li, .platform-menu-drawer img, .bg-menu-drawer img');

  for (const item of allMenuItems) {
    if (item.classList.contains('equipped')) {
      if (layerName === 'hat' && item.dataset.hat) {
        return item;
      } else if (item.dataset.layer === layerName) {
        return item;
      } else if (layerName === 'shirts' && item.dataset.layer === 'outfits') {
        // Outfits use the shirts layer, so check for outfits when looking for shirts
        return item;
      }
    }
  }

  // Fallback: try to find by matching inventory item
  const inventoryItem = inventory.find(item => item.type === layerName);
  if (inventoryItem && inventoryItem.menuElement) {
    return inventoryItem.menuElement;
  }

  return null;
}

// Helper to apply arm rotation based on equipped hand
function applyArmRotation() {
  const armLayer = document.getElementById('arm');
  const sleeveLayers = [
    { el: document.getElementById('shirtsabove'), type: 'above' },
    { el: document.getElementById('shirtstop'), type: 'top' }
  ];

  // Find equipped items
  const equippedHand = document.querySelector('.submenu[id$="handsMenu"] .equipped') ||
    document.querySelector('[data-layer="hands"].equipped');
  const equippedShirt = document.querySelector('.submenu[id$="shirtsMenu"] .equipped') ||
    document.querySelector('[data-layer="shirts"].equipped') ||
    document.querySelector('[data-layer="outfits"].equipped');

  // Determine Rotation/Arm Overrides
  let armRot = 0;
  let useArmOverrides = false;
  let armXStr = 'var(--arm-x)';
  let armYStr = 'var(--arm-y)';
  let overrideSleeveScale = null;
  let overrideSleeveX = null;
  let overrideSleeveY = null;

  if (equippedHand && (equippedHand.dataset.armRotation || equippedHand.dataset.armX || equippedHand.dataset.armY)) {
    armRot = parseFloat(equippedHand.dataset.armRotation || 0);
    useArmOverrides = true;
    armXStr = equippedHand.dataset.armX ? `${equippedHand.dataset.armX}px` : 'var(--arm-x)';
    armYStr = equippedHand.dataset.armY ? `${equippedHand.dataset.armY}px` : 'var(--arm-y)';

    overrideSleeveScale = equippedHand.dataset.sleeveScale || null;
    overrideSleeveX = equippedHand.dataset.sleeveX || null;
    overrideSleeveY = equippedHand.dataset.sleeveY || null;
  }

  // Apply to Arm
  if (armLayer) {
    if (isDarkJesterActive() || isNormalJesterActive()) {
      const prefix = isDarkJesterActive() ? 'djc' : 'njc';
      
      if (armRot !== 0) {
        // Apply rotation and use the manually defined rotated X/Y coordinates
        armLayer.style.setProperty(`--${prefix}-active-x`, `var(--${prefix}-left-arm-rotated-x)`);
        armLayer.style.setProperty(`--${prefix}-active-y`, `var(--${prefix}-left-arm-rotated-y)`);
        armLayer.style.setProperty(`--${prefix}-arm-rot`, `${armRot}deg`);
      } else {
        // No rotation: reset to default unrotated coordinates
        armLayer.style.setProperty(`--${prefix}-active-x`, `var(--${prefix}-left-arm-x)`);
        armLayer.style.setProperty(`--${prefix}-active-y`, `var(--${prefix}-left-arm-y)`);
        armLayer.style.setProperty(`--${prefix}-arm-rot`, `0deg`);
      }
      return; // Skip normal base character arm positioning and sleeve logic
    }

    // Check if any hand item is currently equipped (visible)
    const handsLayer = document.getElementById('hands');
    const isHandEquipped = handsLayer && handsLayer.style.display === 'block' && handsLayer.src;

    if (useArmOverrides) {
      armLayer.style.transform = `translateX(-50%) translate(${armXStr}, ${armYStr}) scale(var(--arm-scale)) rotate(${armRot}deg)`;
    } else {
      // When hand is equipped but has no custom positioning, add 1px down to prevent gap
      const yOffset = isHandEquipped ? 'calc(var(--arm-y) + 1px)' : 'var(--arm-y)';
      armLayer.style.transform = `translateX(-50%) translate(var(--arm-x), ${yOffset}) scale(var(--arm-scale))`;
    }
  }

  // Apply to Sleeves
  sleeveLayers.forEach(sleeveInfo => {
    const sleeve = sleeveInfo.el;
    if (sleeve && sleeve.style.display !== 'none' && sleeve.src) {
      // Exception: Top layer details (like hoodie ears) should NOT rotate with the arm
      const isTopLayer = (sleeve.id === 'shirtstop');

      if (sleeve.style.display === 'none') {
        return; // Skip if hidden
      }

      // Reconstruct base transform from equipped shirt
      let scale = 1;
      let x = 0;
      let y = 0;
      let hasShirtData = false;

      if (equippedShirt) {
        if (sleeveInfo.type === 'above' && equippedShirt.dataset.aboveSrc) {
          scale = equippedShirt.dataset.aboveScale ?? 1;
          x = equippedShirt.dataset.aboveX ?? 0;
          y = equippedShirt.dataset.aboveY ?? 0;
          hasShirtData = true;
        } else if (sleeveInfo.type === 'top' && equippedShirt.dataset.topSrc) {
          scale = equippedShirt.dataset.topScale ?? 1;
          x = equippedShirt.dataset.topX ?? 0;
          y = equippedShirt.dataset.topY ?? 0;
          hasShirtData = true;
        }
      }

      let finalScale = scale;
      let finalX = x;
      let finalY = y;
      let useVars = !hasShirtData; // Use CSS vars if we didn't find specific shirt data

      // Apply Overrides from Hand or Shirt-specific Rotation Overrides
      // Exception: Top layer detail stays static relative to the body
      if (useArmOverrides && !isTopLayer) {
        // Priority 1: Check for rotation-specific overrides on the shirt itself
        const rotScale = equippedShirt?.dataset.rotatedSleeveScale;
        const rotX = equippedShirt?.dataset.rotatedSleeveX;
        const rotY = equippedShirt?.dataset.rotatedSleeveY;

        if (rotScale || rotX || rotY) {
          if (rotScale) finalScale = parseFloat(rotScale);
          if (rotX) finalX = parseFloat(rotX);
          if (rotY) finalY = parseFloat(rotY);
        } else {
          // Priority 2: Standard Additive Displacement Logic
          if (overrideSleeveScale) {
            const defaultBaseScale = 0.273;
            const scaleRatio = parseFloat(overrideSleeveScale) / defaultBaseScale;
            finalScale = parseFloat(scale) * scaleRatio;
          }

          // Calculate displacement from standard sleeve baseline (-74.5, 138)
          const defaultBaseX = -74.5;
          const defaultBaseY = 138;

          if (overrideSleeveX) {
            const dx = parseFloat(overrideSleeveX) - defaultBaseX;
            finalX = parseFloat(x) + dx;
          }
          if (overrideSleeveY) {
            const dy = parseFloat(overrideSleeveY) - defaultBaseY;
            finalY = parseFloat(y) + dy;
          }
        }
      }

      // Construct Transform String
      let transform = '';

      if (useVars && !useArmOverrides) {
        // If no shirt data AND no arm rotation, clear transform to let CSS handle it
        transform = '';
      } else {
        // Determine final components (with CSS var fallback if no shirt data)
        const sScale = !hasShirtData ? (sleeve.id === 'shirtsabove' ? 'var(--shirtsabove-scale)' : 'var(--arm-scale)') : finalScale;
        const sX = !hasShirtData ? (sleeve.id === 'shirtsabove' ? 'var(--shirtsabove-x)' : (useArmOverrides ? armXStr : 0)) : `${finalX}px`;
        const sY = !hasShirtData ? (sleeve.id === 'shirtsabove' ? 'var(--shirtsabove-y)' : (useArmOverrides ? armYStr : 0)) : `${finalY}px`;

        transform = `translateX(-50%) translate(${sX}, ${sY}) scale(${sScale})`;

        // Apply rotation to all sleeves EXCEPT the static Top layer detail
        if (useArmOverrides && !isTopLayer) {
          transform += ` rotate(${armRot}deg)`;
        }
      }

      sleeve.style.transform = transform;
    }
  });

  // Sync back sleeves and hand duplications
  syncBackShirtsabove();
  duplicateHandItemToBack();
}

function addToInventory(item) {
  // Platforms behave like background themes and should not appear in inventory slots
  if (item.type === 'platforms') return;
  // Exclude hidden Space Boots from inventory
  if (item.menuElement && item.menuElement.id === 'space-boots-data') return;

  const existingIndex = inventory.findIndex(i =>
    i.type === item.type && i.src === item.src
  );

  if (existingIndex !== -1) {
    inventory.splice(existingIndex, 1);
  }

  inventory.unshift(item);

  if (inventory.length > MAX_SLOTS) {
    inventory.length = MAX_SLOTS;
  }

  renderInventory();
}




function startAnimation(layer, options) {
  stopAnimation(layer);

  let frame = 1;
  const { framesPath, frameCount, fps } = options;

  const updateFrame = () => {
    if (window.activePlannerType && window.activePlannerType !== 'set') return;

    layer.dataset.currentFrame = frame;
    layer.dataset.framesPath = framesPath;
    
    // Only update src if it's not handled by the rainbow overlay canvas logic
    if (!layer.classList.contains('rainbow-overlay-active')) {
      layer.src = `${framesPath}${frame}.png`;
    }
    
    frame = frame % frameCount + 1;
  };

  updateFrame(); // Initial frame draw
  activeAnimations[layer.id] = setInterval(updateFrame, 1000 / fps);
}

function stopAnimation(layer) {
  if (activeAnimations[layer.id]) {
    clearInterval(activeAnimations[layer.id]);
    delete activeAnimations[layer.id];
  }
}

function renderInventory() {
  const slots = document.querySelectorAll(".inventory .inventory-slot.slot");

  slots.forEach((slot, index) => {
    slot.innerHTML = "";
    slot.style.cursor = 'pointer';
    slot.dataset.inventoryIndex = index;

    const item = inventory[index];
    if (!item) {
      slot.style.cursor = 'default';
      return;
    }

    const img = document.createElement("img");
    img.src = item.icon;

    slot.onclick = (e) => {
      e.stopPropagation();
      if (inventoryClickDebounce) return;
      if (!item || !item.menuElement) return;

      inventoryClickDebounce = true;
      setTimeout(() => { inventoryClickDebounce = false; }, 200);

      if (item.type === "hat") {
        equipHat(item.src, item.menuElement);
      } else {
        equipItem(item.menuElement);
      }
    };

    // Mark inventory slot as highlighted when the underlying menu element is equipped
    if (item && item.menuElement && item.menuElement.classList.contains('equipped')) {
      slot.classList.add('inventory-equipped');
    } else {
      slot.classList.remove('inventory-equipped');
    }

    slot.appendChild(img);
  });
}

window.toggleMenu = function () {
  const menu = document.getElementById("sideMenu");
  const credit = document.getElementById("creatorCredit");
  const hamburger = document.querySelector(".hamburger");

  const isOpen = menu.classList.toggle("open");
  hamburger.classList.toggle("open", isOpen);
  /* Toggle body class for blur effects */
  document.body.classList.toggle("menu-open", isOpen);

  if (credit) {
    credit.classList.toggle("show", isOpen);
  }
}


window.toggleSubmenu = function (id) {
  const menu = document.getElementById(id);
  const trigger = menu.previousElementSibling; // The <li> that was clicked

  if (menu.style.display === "block") {
    menu.style.display = "none";
    if (trigger) trigger.classList.remove('menu-active');
  } else {
    // Optional: Close other menus if accordion behavior is desired (keeping independent for now as per usual web norms unless requested)
    menu.style.display = "block";
    if (trigger) trigger.classList.add('menu-active');
  }
}
window.resetMenus = function () {
  // Collapse all submenus
  document.querySelectorAll('.submenu').forEach(menu => {
    menu.style.display = 'none';
  });
  // Clear active underlines/highlights
  document.querySelectorAll('.menu-item-with-icon').forEach(item => {
    item.classList.remove('menu-active');
  });

  // Clear filter if active
  isFilterEquippedActive = false;
  const filterBtn = document.querySelector('.menu-filter-btn');
  if (filterBtn) {
    filterBtn.classList.remove('active');
    filterBtn.title = "Show Equipped Only";
  }
  if (typeof applyEquippedFilter === 'function') {
    applyEquippedFilter();
  }
}

function updateCreatorText(options = {}) {
  const creatorElement = document.querySelector('.creator-text-large');
  if (creatorElement) {
    // Apply individual styles directly
    if (options.fontSize !== undefined) {
      creatorElement.style.fontSize = options.fontSize;
    }
    if (options.marginBottom !== undefined) {
      creatorElement.style.marginBottom = options.marginBottom;
    }
    if (options.text !== undefined) {
      creatorElement.textContent = options.text;
    }
  }
}

function removeAllScrollbars() {
  // Remove scrollbars from entire document
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  // Also hide scrollbars on any element that might have them
  const scrollableElements = document.querySelectorAll('*');
  scrollableElements.forEach(element => {
    element.style.overflow = element.style.overflow || 'hidden';
  });
}

function removeScrollbars() {
  const menuScroll = document.querySelector('.menu-scroll');
  if (menuScroll) {
    // Force hide scrollbars with multiple methods
    menuScroll.style.overflow = 'hidden';
    menuScroll.style.overflowX = 'hidden';
    menuScroll.style.overflowY = 'hidden';
    menuScroll.style.scrollbarWidth = 'none';
    menuScroll.style.msOverflowStyle = 'none';

    // Add inline styles to override any CSS
    menuScroll.style.cssText += `
      overflow: hidden !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    `;
  }
}

function updateSearchBar() {
  const searchInput = document.getElementById('menuSearch');
  if (searchInput) {
    // Force apply styles directly - fix clipping issue
    searchInput.style.width = 'calc(100% - 20px)';
    searchInput.style.padding = '14px 20px';
    searchInput.style.margin = '15px 0px 15px 20px';
    searchInput.style.borderRadius = '10px';
    searchInput.style.background = 'rgba(255, 255, 255, 0.15)';
    searchInput.style.color = 'white';
    searchInput.style.fontSize = '12px';
    searchInput.style.border = 'none';
    searchInput.style.outline = 'none';
    searchInput.style.boxSizing = 'border-box';
    searchInput.style.transition = 'all 0.3s ease';
    searchInput.style.overflow = 'hidden';
    searchInput.style.textOverflow = 'ellipsis';
    searchInput.style.whiteSpace = 'nowrap';
  }
}

// ==================== RANDOM SET & FILTER ====================

// Toggles visibility of all items except those currently equipped
let isFilterEquippedActive = false;
window.toggleEquippedFilter = function () {
  isFilterEquippedActive = !isFilterEquippedActive;
  const filterBtn = document.querySelector('.menu-filter-btn');
  if (filterBtn) {
    filterBtn.classList.toggle('active', isFilterEquippedActive);
    filterBtn.title = isFilterEquippedActive ? "Show All Items" : "Show Equipped Only";
  }

  // Clear search if filter is activated to avoid conflicts
  if (isFilterEquippedActive) {
    const searchInput = document.getElementById("menuSearch");
    if (searchInput) {
      searchInput.value = "";
      // Only run search clear logic if it's already implemented there
      if (typeof searchItems === 'function') searchItems();
    }
  }

  applyEquippedFilter();
};

window.applyEquippedFilter = function () {
  const submenus = document.querySelectorAll('.submenu');
  const categoryHeaders = document.querySelectorAll('.menu-item-with-icon');

  if (isFilterEquippedActive) {
    // Hide all category headers to create a flat unified list
    categoryHeaders.forEach(header => {
      header.style.setProperty('display', 'none', 'important');
    });
  } else {
    // Restore default category header visibility
    categoryHeaders.forEach(header => {
      header.style.display = '';
    });
  }

  submenus.forEach(submenu => {
    const items = submenu.querySelectorAll('li');
    let hasVisibleItems = false;

    items.forEach(li => {
      const isEquipped = li.classList.contains('equipped');
      if (isFilterEquippedActive) {
        if (isEquipped) {
          li.style.display = 'flex';
          hasVisibleItems = true;
        } else {
          li.style.setProperty('display', 'none', 'important');
        }
      } else {
        li.style.display = ''; // Restore default
        hasVisibleItems = true;
      }
    });

    // Handle submenu visibility
    if (isFilterEquippedActive) {
      submenu.style.display = hasVisibleItems ? 'block' : 'none';
      // Search mode-like behavior: submenus are always block if they have results
    } else {
      // If not active, let default CSS (hidden) or open class handle it
      if (!submenu.classList.contains('open')) {
        submenu.style.display = 'none';
      }
    }
  });

  // Re-run search if active to maintain consistent state
  if (!isFilterEquippedActive && typeof searchItems === 'function') {
    const searchInput = document.getElementById('menuSearch');
    if (searchInput && searchInput.value.trim() !== "") {
      searchItems();
    }
  }
};

// Equips a random item from each relevant category
window.randomizeSet = function () {
  // 1. Clear current set
  unequipAll(true);

  const categories = [
    'specialsMenu', 'hatsMenu', 'hairMenu', 'facesMenu',
    'eyesMenu', 'wingsMenu', 'capesMenu', 'shirtsMenu', 'pantsMenu',
    'handsMenu', 'shoesMenu', 'petsMenu', 'carsMenu', 'floatiesMenu', 'scarfsMenu'
  ];

  let chosenOutfit = false;
  let chosenWings = false;
  let chosenCape = false;

  categories.forEach(catId => {
    const submenu = document.getElementById(catId);
    if (!submenu) return;

    const items = Array.from(submenu.querySelectorAll('li')).filter(item => {
      // Exclude Rocker Makeup from randomizer
      if (item.dataset.src && item.dataset.src.includes('rocker.png')) return false;
      return true;
    });
    if (items.length === 0) return;

    // Weighting: 40% chance to skip a category for more "varied" random looks
    // and to avoid over-cluttering (except for essentials like Skin/Shirt/Pants)
    const essentialCategories = ['specialsMenu', 'shirtsMenu', 'pantsMenu'];
    if (!essentialCategories.includes(catId) && Math.random() > 0.6) return;

    // Logic for mutual exclusivity and "look" quality
    if (catId === 'outfitsMenu') {
      if (Math.random() > 0.3) { // 70% chance to try for an outfit if we hit this block
        const randomItem = items[Math.floor(Math.random() * items.length)];
        randomItem.click();
        chosenOutfit = true;
        return;
      } else {
        return; // Skip outfit
      }
    }

    // Skip individual pieces if outfit is chosen (though equipItem handles some of this)
    if (chosenOutfit && ['shirtsMenu', 'pantsMenu', 'shoesMenu'].includes(catId)) return;

    // Wings vs Capes rule: 50/50 if both might be picked
    if (catId === 'wingsMenu') chosenWings = true;
    if (catId === 'capesMenu') {
      if (chosenWings && Math.random() > 0.5) return;
      chosenCape = true;
    }

    const randomItem = items[Math.floor(Math.random() * items.length)];
    if (randomItem) {
      randomItem.click();
    }
  });

  // Visual success feedback
  const diceBtn = document.querySelector('.menu-random-btn');
  if (diceBtn) {
    diceBtn.style.transform = 'scale(1.2) rotate(360deg)';
    setTimeout(() => {
      diceBtn.style.transform = '';
    }, 400);
  }
};

function searchItems() {
  // Update search bar styling
  updateSearchBar();

  // Move creator text down and make it bigger on page load
  updateCreatorText({
    fontSize: '22px',
    marginBottom: '25px'  // Reverted back to 25px
  });

  const searchTerm = document.getElementById("menuSearch").value.trim().toLowerCase();
  const allCategoryHeaders = document.querySelectorAll(".menu-item-with-icon");
  const allSubmenuItems = document.querySelectorAll(".submenu li");

  if (searchTerm.length === 0) {
    // Clear search - Restore default structure
    allCategoryHeaders.forEach(header => header.style.display = "");
    document.querySelectorAll('.submenu').forEach(menu => menu.style.display = "none");
    allSubmenuItems.forEach(item => {
      item.style.display = "";
      item.classList.remove("highlight");
    });
    document.querySelectorAll('.menu-active').forEach(el => el.classList.remove('menu-active'));
    return;
  }

  // Search Mode: Hide all categories to create a unified results list
  allCategoryHeaders.forEach(header => {
    header.style.setProperty('display', 'none', 'important');
  });

  // Open all submenus to reveal matches
  document.querySelectorAll('.submenu').forEach(menu => menu.style.display = "block");

  // Filter submenu items
  allSubmenuItems.forEach(item => {
    // Exclude Valentine updates items from search results to avoid duplicates
    const isUpdateItem = item.closest('#updatesMenu') !== null;
    
    // Only search the item if it's not a duplicate category
    if (!isUpdateItem) {
      const text = item.textContent.trim().toLowerCase();
      const isMatch = text.includes(searchTerm);

      if (isMatch) {
        item.style.display = ""; // Clears inline style, allowing CSS to take over
        item.classList.add("highlight");
      } else {
        // Force hide using cssText to override any !important in CSS
        item.style.setProperty('display', 'none', 'important');
        item.classList.remove("highlight");
      }
    } else {
      // Force hide duplicated items
      item.style.setProperty('display', 'none', 'important');
      item.classList.remove("highlight");
    }
  });

  // Auto-scroll disabled per user request for steady typing view
}

// Robot Skin
window.equipRobotSkin = function (element) {
  // Clear any active skin color tint
  clearSkinTint();

  // Clean up DJC layers if switching from Dark Jester
  hideDjcLayers();
  hideNjcLayers();

  // Restore arm to normal positioning
  const armRestore = document.getElementById('arm');
  if (armRestore) {
    armRestore.style.transform = '';
  }

  const baseElement = document.getElementById('base');
  const headElement = document.getElementById('head');

  if (!baseElement || !headElement) return;

  // Unequip shirt 52 if it's equipped
  const shirtsLayer = document.getElementById('shirts');
  if (shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src && shirtsLayer.src.includes('shirt52')) {
    unequipAll(true);
  }

  // Reset any custom transform/opacity from invis mode
  baseElement.style.transform = "";
  baseElement.style.opacity = "";
  baseElement.style.clipPath = ""; 
  headElement.style.transform = "";
  headElement.style.opacity = "";

  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.style.display = 'block';
    armElement.src = "specials/robotskin/arm.png";
    armElement.style.opacity = "";
  }

  // Restore body parts visibility and opacity initially
  const bodyParts = ['body', 'leg', 'feet', 'pupil'];
  bodyParts.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = "block";
      el.style.opacity = "";
    }
  });

  // Sync state classes
  isGhostOutfitActive();

  // Show base + head using the Robot assets
  baseElement.style.display = "block";
  baseElement.src = "specials/robotskin/base.png";
  headElement.src = "specials/robotskin/head.png";

  const pupilElement = document.getElementById('pupil');
  if (pupilElement) {
      pupilElement.src = "specials/pupil.png"; // User specified using the one in specials folder
  }

  // Set body, leg, feet
  const bodyLayer = document.getElementById('body');
  if (bodyLayer) bodyLayer.src = "specials/robotskin/body.png";
  const legLayer = document.getElementById('leg');
  if (legLayer) legLayer.src = "specials/robotskin/leg.png";
  const feetLayer = document.getElementById('feet');
  if (feetLayer) feetLayer.src = "specials/robotskin/feet.png";

  // Mark equipped in menu
  document.querySelectorAll('#specialsMenu li').forEach(el => el.classList.remove('equipped'));
  if (element) element.classList.add('equipped');

  syncBodyParts();
  saveState();
}

// Dracula Skin (Same as Normal but tracked separately for persistence)
window.equipDraculaSkin = function (element) {
  equipNormalCharacter(element);
}

// Swap to the normal/base character (full character swap, not an inventory item)
window.equipNormalCharacter = function (element) {
  // Clear any active skin color tint
  clearSkinTint();

  // Clean up DJC layers if switching from Dark Jester
  hideDjcLayers();
  hideNjcLayers();

  // Restore arm to normal positioning/src (may have been overridden by DJC)
  const armRestore = document.getElementById('arm');
  if (armRestore) {
    armRestore.style.transform = '';
  }

  const baseElement = document.getElementById('base');
  const headElement = document.getElementById('head');

  if (!baseElement || !headElement) return;

  // Unequip shirt 52 if it's equipped
  const shirtsLayer = document.getElementById('shirts');
  const isShirt52Equipped = shirtsLayer && shirtsLayer.style.display === 'block' &&
    shirtsLayer.src && shirtsLayer.src.includes('shirt52');

  if (isShirt52Equipped) {
    shirtsLayer.style.display = 'none';
    stopAnimation(shirtsLayer);
    shirtsLayer.src = '';

    // Clear shirt-related layers
    const shirtsaboveLayer = document.getElementById('shirtsabove');
    const shirtstopLayer = document.getElementById('shirtstop');
    const shirtsbehindLayer = document.getElementById('shirtsbehind');
    if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
    if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
    if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

    // Restore all body parts that shirt52 hides
    const feetLayer = document.getElementById('feet');
    const legLayer = document.getElementById('leg');
    const pupilLayer = document.getElementById('pupil');
    const bodyLayer = document.getElementById('body');
    if (feetLayer) feetLayer.style.display = 'block';
    if (legLayer) legLayer.style.display = 'block';
    if (pupilLayer) pupilLayer.style.display = 'block';
    if (bodyLayer) bodyLayer.style.display = 'block';

    // Remove equipped class from outfit/shirt menu items
    document.querySelectorAll('[data-layer="outfits"], [data-layer="shirts"]').forEach(item => {
      item.classList.remove('equipped');
    });
  }

  // Reset any custom transform/opacity from invis mode so it lines up like the default base/head
  baseElement.style.transform = "";
  baseElement.style.opacity = "";
  baseElement.style.clipPath = ""; // Restore default clip-path from CSS
  headElement.style.transform = "";
  headElement.style.opacity = "";

  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.style.display = 'block';
    armElement.src = isInvisSkinActive() ? "arm.png" : "specials/arm.png";
    armElement.style.opacity = "";
    // Note: transform will be applied by syncBodyParts -> applyArmRotation
  }

  // Restore body parts visibility and opacity
  const bodyParts = ['body', 'leg', 'feet', 'pupil'];
  bodyParts.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = "block";
      element.style.opacity = "";
    }
  });

  // Sync state classes (like ghost-active)
  isGhostOutfitActive();

  // Show base + head using the specials assets
  baseElement.style.display = "block";
  baseElement.src = "specials/base.png";
  
  const pupilElement = document.getElementById('pupil');
  if (pupilElement) {
      pupilElement.src = (currentGender === 'female') ? "specials/female/pupil.png" : "specials/pupil.png";
  }

  const legElement = document.getElementById('leg');
  if (legElement) legElement.src = "leg.png";

  // Re-equip shirts with no-skin variant (invisSrc) if they have one
  if (shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src) {
    const equippedShirt = document.querySelector('#shirtsMenu li.equipped');
    if (equippedShirt && equippedShirt.dataset.invisSrc) {
      shirtsLayer.src = equippedShirt.dataset.invisSrc;
      const normalScale = equippedShirt.dataset.invisScale ?? equippedShirt.dataset.scale ?? 1;
      const normalX = equippedShirt.dataset.invisX ?? equippedShirt.dataset.x ?? 0;
      const normalY = equippedShirt.dataset.invisY ?? equippedShirt.dataset.y ?? 0;
      shirtsLayer.style.transform = `translateX(-50%) translate(${normalX}px, ${normalY}px) scale(${normalScale})`;
    }
  }

  // Restore shoes with no-skin variant
  const shoesLayer = document.getElementById('shoes');
  if (shoesLayer && shoesLayer.style.display === 'block') {
    const equippedShoe = document.querySelector('#shoesMenu li.equipped');
    if (equippedShoe && equippedShoe.dataset.invisSrc) {
      shoesLayer.src = equippedShoe.dataset.invisSrc;
      const normalScaleS = equippedShoe.dataset.invisScale ?? equippedShoe.dataset.scale ?? 1;
      const normalXS = equippedShoe.dataset.invisX ?? equippedShoe.dataset.x ?? 0;
      const normalYS = equippedShoe.dataset.invisY ?? equippedShoe.dataset.y ?? 0;
      shoesLayer.style.transform = `translateX(-50%) translate(${normalXS}px, ${normalYS}px) scale(${normalScaleS})`;
      const rightShoeLayer = document.getElementById('rightshoe');
      if (rightShoeLayer) {
        rightShoeLayer.style.display = 'block';
        rightShoeLayer.src = equippedShoe.dataset.invisRightSrc ?? equippedShoe.dataset.invisSrc ?? equippedShoe.dataset.rightSrc ?? equippedShoe.dataset.src ?? '';
        const rightScale = equippedShoe.dataset.invisRightScale ?? equippedShoe.dataset.invisScale ?? equippedShoe.dataset.rightScale ?? equippedShoe.dataset.scale ?? 1;
        const rightX = equippedShoe.dataset.invisRightX ?? equippedShoe.dataset.invisX ?? equippedShoe.dataset.rightX ?? equippedShoe.dataset.x ?? 0;
        const rightY = equippedShoe.dataset.invisRightY ?? equippedShoe.dataset.invisY ?? equippedShoe.dataset.rightY ?? equippedShoe.dataset.y ?? 0;
        rightShoeLayer.style.transform = `translateX(-50%) translate(${rightX}px, ${rightY}px) scale(${rightScale})`;
      }
    }
  }

  // Restore pants with no-skin variant
  const pantsLayer = document.getElementById('pants');
  if (pantsLayer && pantsLayer.style.display === 'block') {
    const equippedPants = document.querySelector('#pantsMenu li.equipped');
    if (equippedPants && equippedPants.dataset.invisSrc) {
      pantsLayer.src = equippedPants.dataset.invisSrc;
      const normalScaleP = equippedPants.dataset.invisScale ?? equippedPants.dataset.scale ?? 1;
      const normalXP = equippedPants.dataset.invisX ?? equippedPants.dataset.x ?? 0;
      const normalYP = equippedPants.dataset.invisY ?? equippedPants.dataset.y ?? 0;
      pantsLayer.style.transform = `translateX(-50%) translate(${normalXP}px, ${normalYP}px) scale(${normalScaleP})`;
    }
  }

  document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
  element.classList.add("equipped");
  enforceLayerOrder();
  overrideLayerOrder();

  // Sync all body parts using central helper (handles normal/invis/rocker/skate)
  syncBodyParts();

  saveState();
}

// Helper function to check if Golden Skeleton Character is active
function isGoldenSkeletonActive() {
  const gscMenuItem = document.querySelector("#specialsMenu li[onclick*='equipGoldenSkeleton']");
  if (gscMenuItem && gscMenuItem.classList.contains("equipped")) return true;
  
  const headElement = document.getElementById('head');
  return headElement && headElement.src && headElement.src.includes('/gsc/head.png');
}

// Swap to the Golden Skeleton Character
window.equipGoldenSkeleton = function (element) {
  // Clear any active skin color tint
  clearSkinTint();

  // Clean up DJC layers if switching from Dark Jester
  hideDjcLayers();
  hideNjcLayers();



  // Restore arm to normal positioning
  const armRestore = document.getElementById('arm');
  if (armRestore) {
    armRestore.style.transform = '';
  }

  const baseElement = document.getElementById('base');
  const headElement = document.getElementById('head');

  if (!baseElement || !headElement) return;

  // Unequip shirt 52 if it's equipped
  const shirtsLayer = document.getElementById('shirts');
  const isShirt52Equipped = shirtsLayer && shirtsLayer.style.display === 'block' &&
    shirtsLayer.src && shirtsLayer.src.includes('shirt52');

  if (isShirt52Equipped) {
    shirtsLayer.style.display = 'none';
    stopAnimation(shirtsLayer);
    shirtsLayer.src = '';

    // Clear shirt-related layers
    const shirtsaboveLayer = document.getElementById('shirtsabove');
    const shirtstopLayer = document.getElementById('shirtstop');
    const shirtsbehindLayer = document.getElementById('shirtsbehind');
    if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
    if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
    if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

    // Restore all body parts that shirt52 hides
    const feetLayer = document.getElementById('feet');
    const legLayer = document.getElementById('leg');
    const pupilLayer = document.getElementById('pupil');
    const bodyLayer = document.getElementById('body');
    if (feetLayer) feetLayer.style.display = 'block';
    if (legLayer) legLayer.style.display = 'block';
    if (pupilLayer) pupilLayer.style.display = 'block';
    if (bodyLayer) bodyLayer.style.display = 'block';

    // Remove equipped class from outfit/shirt menu items
    document.querySelectorAll('[data-layer="outfits"], [data-layer="shirts"]').forEach(item => {
      item.classList.remove('equipped');
    });
  }

  // Reset any custom transform/opacity from invis mode so it lines up like the default base/head
  baseElement.style.transform = "";
  baseElement.style.opacity = "";
  baseElement.style.clipPath = ""; 
  headElement.style.transform = "";
  headElement.style.opacity = "";

  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.style.display = 'block';
    armElement.src = "specials/gsc/hand.png";
    armElement.style.opacity = "";
  }

  // Restore body parts visibility and opacity initially
  const bodyParts = ['body', 'leg', 'feet', 'pupil'];
  bodyParts.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = "block";
      el.style.opacity = "";
    }
  });

  // Sync state classes (like ghost-active)
  isGhostOutfitActive();

  // Show base + head using the GSC assets
  baseElement.style.display = "block";
  baseElement.src = "specials/gsc/base.png";
  headElement.src = "specials/gsc/head.png";

  // Hide leg and pupil for Golden Skeleton
  const legElement = document.getElementById('leg');
  if (legElement) { legElement.style.display = "none"; legElement.style.opacity = "0"; }
  
  const pupilElement = document.getElementById('pupil');
  if (pupilElement) { pupilElement.style.display = "none"; pupilElement.style.opacity = "0"; }

  // Re-equip shirts with no-skin variant (invisSrc) if they have one
  if (shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src) {
    const equippedShirt = document.querySelector('#shirtsMenu li.equipped');
    if (equippedShirt && equippedShirt.dataset.invisSrc) {
      shirtsLayer.src = equippedShirt.dataset.invisSrc;
      const normalScale = equippedShirt.dataset.invisScale ?? equippedShirt.dataset.scale ?? 1;
      const normalX = equippedShirt.dataset.invisX ?? equippedShirt.dataset.x ?? 0;
      const normalY = equippedShirt.dataset.invisY ?? equippedShirt.dataset.y ?? 0;
      shirtsLayer.style.transform = `translateX(-50%) translate(${normalX}px, ${normalY}px) scale(${normalScale})`;
    }
  }

  // Restore shoes with no-skin variant
  const shoesLayer = document.getElementById('shoes');
  if (shoesLayer && shoesLayer.style.display === 'block') {
    const equippedShoe = document.querySelector('#shoesMenu li.equipped');
    if (equippedShoe && equippedShoe.dataset.invisSrc) {
      shoesLayer.src = equippedShoe.dataset.invisSrc;
      const normalScaleS = equippedShoe.dataset.invisScale ?? equippedShoe.dataset.scale ?? 1;
      const normalXS = equippedShoe.dataset.invisX ?? equippedShoe.dataset.x ?? 0;
      const normalYS = equippedShoe.dataset.invisY ?? equippedShoe.dataset.y ?? 0;
      shoesLayer.style.transform = `translateX(-50%) translate(${normalXS}px, ${normalYS}px) scale(${normalScaleS})`;
      const rightShoeLayer = document.getElementById('rightshoe');
      if (rightShoeLayer) {
        rightShoeLayer.style.display = 'block';
        rightShoeLayer.src = equippedShoe.dataset.invisRightSrc ?? equippedShoe.dataset.invisSrc ?? equippedShoe.dataset.rightSrc ?? equippedShoe.dataset.src ?? '';
        const rightScale = equippedShoe.dataset.invisRightScale ?? equippedShoe.dataset.invisScale ?? equippedShoe.dataset.rightScale ?? equippedShoe.dataset.scale ?? 1;
        const rightX = equippedShoe.dataset.invisRightX ?? equippedShoe.dataset.invisX ?? equippedShoe.dataset.rightX ?? equippedShoe.dataset.x ?? 0;
        const rightY = equippedShoe.dataset.invisRightY ?? equippedShoe.dataset.invisY ?? equippedShoe.dataset.rightY ?? equippedShoe.dataset.y ?? 0;
        rightShoeLayer.style.transform = `translateX(-50%) translate(${rightX}px, ${rightY}px) scale(${rightScale})`;
      }
    }
  }

  // Restore pants with no-skin variant
  const pantsLayer = document.getElementById('pants');
  if (pantsLayer && pantsLayer.style.display === 'block') {
    const equippedPants = document.querySelector('#pantsMenu li.equipped');
    if (equippedPants && equippedPants.dataset.invisSrc) {
      pantsLayer.src = equippedPants.dataset.invisSrc;
      const normalScaleP = equippedPants.dataset.invisScale ?? equippedPants.dataset.scale ?? 1;
      const normalXP = equippedPants.dataset.invisX ?? equippedPants.dataset.x ?? 0;
      const normalYP = equippedPants.dataset.invisY ?? equippedPants.dataset.y ?? 0;
      pantsLayer.style.transform = `translateX(-50%) translate(${normalXP}px, ${normalYP}px) scale(${normalScaleP})`;
    }
  }

  document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
  element.classList.add("equipped");
  enforceLayerOrder();
  overrideLayerOrder();

  // Sync all body parts using central helper (handles normal/invis/rocker/skate/gsc)
  syncBodyParts();

  saveState();
}

// Helper function to check if Skeleton Character is active
function isSkeletonActive() {
  const scMenuItem = document.querySelector("#specialsMenu li[onclick*='equipSkeleton']");
  if (scMenuItem && scMenuItem.classList.contains("equipped")) return true;
  
  const headElement = document.getElementById('head');
  return headElement && headElement.src && headElement.src.includes('/sc/head.png');
}

// Swap to the Skeleton Character
window.equipSkeleton = function (element) {
  // Clear any active skin color tint
  clearSkinTint();

  // Clean up DJC layers if switching from Dark Jester
  hideDjcLayers();
  hideNjcLayers();



  // Restore arm to normal positioning
  const armRestore = document.getElementById('arm');
  if (armRestore) {
    armRestore.style.transform = '';
  }

  const baseElement = document.getElementById('base');
  const headElement = document.getElementById('head');

  if (!baseElement || !headElement) return;

  // Unequip shirt 52 if it's equipped
  const shirtsLayer = document.getElementById('shirts');
  const isShirt52Equipped = shirtsLayer && shirtsLayer.style.display === 'block' &&
    shirtsLayer.src && shirtsLayer.src.includes('shirt52');

  if (isShirt52Equipped) {
    shirtsLayer.style.display = 'none';
    stopAnimation(shirtsLayer);
    shirtsLayer.src = '';

    // Clear shirt-related layers
    const shirtsaboveLayer = document.getElementById('shirtsabove');
    const shirtstopLayer = document.getElementById('shirtstop');
    const shirtsbehindLayer = document.getElementById('shirtsbehind');
    if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
    if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
    if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

    // Restore all body parts that shirt52 hides
    const feetLayer = document.getElementById('feet');
    const legLayer = document.getElementById('leg');
    const pupilLayer = document.getElementById('pupil');
    const bodyLayer = document.getElementById('body');
    if (feetLayer) feetLayer.style.display = 'block';
    if (legLayer) legLayer.style.display = 'block';
    if (pupilLayer) pupilLayer.style.display = 'block';
    if (bodyLayer) bodyLayer.style.display = 'block';

    // Remove equipped class from outfit/shirt menu items
    document.querySelectorAll('[data-layer="outfits"], [data-layer="shirts"]').forEach(item => {
      item.classList.remove('equipped');
    });
  }

  // Reset any custom transform/opacity from invis mode so it lines up like the default base/head
  baseElement.style.transform = "";
  baseElement.style.opacity = "";
  baseElement.style.clipPath = ""; 
  headElement.style.transform = "";
  headElement.style.opacity = "";

  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.style.display = 'block';
    armElement.src = "specials/sc/hand.png";
    armElement.style.opacity = "";
  }

  // Restore body parts visibility and opacity initially
  const bodyParts = ['body', 'leg', 'feet', 'pupil'];
  bodyParts.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = "block";
      el.style.opacity = "";
    }
  });

  // Sync state classes (like ghost-active)
  isGhostOutfitActive();

  // Show base + head using the SC assets
  baseElement.style.display = "block";
  baseElement.src = "specials/sc/base.png";
  headElement.src = "specials/sc/head.png";

  // Hide leg and pupil for Skeleton
  const legElement = document.getElementById('leg');
  if (legElement) { legElement.style.display = "none"; legElement.style.opacity = "0"; }
  
  const pupilElement = document.getElementById('pupil');
  if (pupilElement) { pupilElement.style.display = "none"; pupilElement.style.opacity = "0"; }

  // Re-equip shirts with no-skin variant (invisSrc) if they have one
  if (shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src) {
    const equippedShirt = document.querySelector('#shirtsMenu li.equipped');
    if (equippedShirt && equippedShirt.dataset.invisSrc) {
      shirtsLayer.src = equippedShirt.dataset.invisSrc;
      const normalScale = equippedShirt.dataset.invisScale ?? equippedShirt.dataset.scale ?? 1;
      const normalX = equippedShirt.dataset.invisX ?? equippedShirt.dataset.x ?? 0;
      const normalY = equippedShirt.dataset.invisY ?? equippedShirt.dataset.y ?? 0;
      shirtsLayer.style.transform = `translateX(-50%) translate(${normalX}px, ${normalY}px) scale(${normalScale})`;
    }
  }

  // Restore shoes with no-skin variant
  const shoesLayer = document.getElementById('shoes');
  if (shoesLayer && shoesLayer.style.display === 'block') {
    const equippedShoe = document.querySelector('#shoesMenu li.equipped');
    if (equippedShoe && equippedShoe.dataset.invisSrc) {
      shoesLayer.src = equippedShoe.dataset.invisSrc;
      const normalScaleS = equippedShoe.dataset.invisScale ?? equippedShoe.dataset.scale ?? 1;
      const normalXS = equippedShoe.dataset.invisX ?? equippedShoe.dataset.x ?? 0;
      const normalYS = equippedShoe.dataset.invisY ?? equippedShoe.dataset.y ?? 0;
      shoesLayer.style.transform = `translateX(-50%) translate(${normalXS}px, ${normalYS}px) scale(${normalScaleS})`;
      const rightShoeLayer = document.getElementById('rightshoe');
      if (rightShoeLayer) {
        rightShoeLayer.style.display = 'block';
        rightShoeLayer.src = equippedShoe.dataset.invisRightSrc ?? equippedShoe.dataset.invisSrc ?? equippedShoe.dataset.rightSrc ?? equippedShoe.dataset.src ?? '';
        const rightScale = equippedShoe.dataset.invisRightScale ?? equippedShoe.dataset.invisScale ?? equippedShoe.dataset.rightScale ?? equippedShoe.dataset.scale ?? 1;
        const rightX = equippedShoe.dataset.invisRightX ?? equippedShoe.dataset.invisX ?? equippedShoe.dataset.rightX ?? equippedShoe.dataset.x ?? 0;
        const rightY = equippedShoe.dataset.invisRightY ?? equippedShoe.dataset.invisY ?? equippedShoe.dataset.rightY ?? equippedShoe.dataset.y ?? 0;
        rightShoeLayer.style.transform = `translateX(-50%) translate(${rightX}px, ${rightY}px) scale(${rightScale})`;
      }
    }
  }

  // Restore pants with no-skin variant
  const pantsLayer = document.getElementById('pants');
  if (pantsLayer && pantsLayer.style.display === 'block') {
    const equippedPants = document.querySelector('#pantsMenu li.equipped');
    if (equippedPants && equippedPants.dataset.invisSrc) {
      pantsLayer.src = equippedPants.dataset.invisSrc;
      const normalScaleP = equippedPants.dataset.invisScale ?? equippedPants.dataset.scale ?? 1;
      const normalXP = equippedPants.dataset.invisX ?? equippedPants.dataset.x ?? 0;
      const normalYP = equippedPants.dataset.invisY ?? equippedPants.dataset.y ?? 0;
      pantsLayer.style.transform = `translateX(-50%) translate(${normalXP}px, ${normalYP}px) scale(${normalScaleP})`;
    }
  }

  document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
  element.classList.add("equipped");
  enforceLayerOrder();
  overrideLayerOrder();

  // Sync all body parts using central helper
  syncBodyParts();

  saveState();
}


// Helper function to check if robot skin is equipped
function isRobotSkinActive() {
  const robotBtn = document.getElementById('robotSkinBtn');
  if (robotBtn) return robotBtn.classList.contains("equipped");

  const headElement = document.getElementById('head');
  return headElement && headElement.src && headElement.src.includes('robotskin');
}

// Helper function to check if dracula skin is equipped
function isDraculaSkinActive() {
  const draculaBtn = document.getElementById('draculaSkinBtn');
  if (draculaBtn) return draculaBtn.classList.contains("equipped");
  return false;
}

// Helper function to check if invis skin is equipped
function isInvisSkinActive() {
  const invisMenuItem = document.querySelector("#specialsMenu li[onclick*='equipInvisCharacter']");
  if (invisMenuItem) return invisMenuItem.classList.contains("equipped");

  const headElement = document.getElementById('head');
  return headElement && headElement.src && (headElement.src.includes('invisibleskin') || headElement.src.includes('pupil.png'));
}

// Helper function to check if ghost outfit (shirt52) is active
function isGhostOutfitActive() {
  const shirtsLayer = document.getElementById('shirts');
  const isVisible = shirtsLayer && shirtsLayer.style.display === 'block';

  // Check frames or src
  const isGhostSrc = shirtsLayer && shirtsLayer.src && shirtsLayer.src.includes('shirt52');

  // Also check menu classes for extra reliability
  const ghostMenuItem = document.querySelector('[data-layer="outfits"][data-frames*="shirt52"].equipped') ||
    document.querySelector('[data-layer="shirts"][data-frames*="shirt52"].equipped');

  const isActive = (isVisible && isGhostSrc) || !!ghostMenuItem;

  // Sync with body class for robust CSS hiding
  if (isActive) {
    document.body.classList.add('ghost-active');
  } else {
    document.body.classList.remove('ghost-active');

    // Safety check: ensure character parts are visible if ghost is NOT active
    const baseLayer = document.getElementById('base');
    if (baseLayer && baseLayer.style.visibility === 'hidden') {
      baseLayer.style.visibility = 'visible';
      baseLayer.style.opacity = '1';
    }
  }

  return isActive;
}

// Central helper to synchronize all base body parts based on state
function syncBodyParts() {
  // If Dark Jester or Normal Jester is active, skip normal body part syncing
  if (isDarkJesterActive() || isNormalJesterActive()) return;

  const isRocker = isRockerMakeupActive();
  const isInvis = isInvisSkinActive();
  const isGhost = isGhostOutfitActive();
  const isGsc = isGoldenSkeletonActive();
  const isSc = isSkeletonActive();

  // Reset eyes layer opacity by default (overridden by syncHeadSprite if needed)
  const eyesLayer = document.getElementById('eyes');
  if (eyesLayer) eyesLayer.style.opacity = '1';

  // Check if skate car is equipped
  const carsLayer = document.getElementById('cars');
  const isSkate = carsLayer && carsLayer.style.display === 'block' && carsLayer.src && (carsLayer.src.includes('skate.png') || carsLayer.src.includes('dcirc.png') || carsLayer.src.includes('circ.png'));

  const isRobot = isRobotSkinActive();

  const parts = {
    'base': isRobot ? 'specials/robotskin/base.png' : (isGsc ? 'specials/gsc/base.png' : (isSc ? 'specials/sc/base.png' : (isRocker ? 'rockerbody/base.png' : (isInvis ? 'base.png' : 'specials/base.png')))),
    'head': isRobot ? 'specials/robotskin/head.png' : (isGsc ? 'specials/gsc/head.png' : (isSc ? 'specials/sc/head.png' : (isRocker ? 'rockerbody/head.png' : 'specials/head.png'))),
    'body': isRobot ? 'specials/robotskin/body.png' : (isGsc ? 'specials/gsc/body.png' : (isSc ? 'specials/sc/body.png' : (isRocker ? 'rockerbody/body.png' : (isInvis ? (currentGender === 'female' ? 'specials/female/body.png' : 'body.png') : (currentGender === 'female' ? 'specials/female/body.png' : 'specials/body.png'))))),
    'arm': isRobot ? 'specials/robotskin/arm.png' : (isGsc ? 'specials/gsc/hand.png' : (isSc ? 'specials/sc/hand.png' : (isRocker ? 'rockerbody/arm.png' : (isInvis ? 'arm.png' : 'specials/arm.png')))),
    'leg': isRobot ? 'specials/robotskin/leg.png' : ((isGsc || isSc) ? '' : (isRocker ? 'rockerbody/leg.png' : (isInvis ? 'leg.png' : 'specials/leg.png'))),
    'feet': isRobot ? 'specials/robotskin/feet.png' : (isGsc ? 'specials/gsc/feet.png' : (isSc ? 'specials/sc/feet.png' : (isRocker ? 'rockerbody/feet.png' : (isInvis ? 'feet.png' : 'specials/feet.png')))),
    'pupil': isRobot ? 'specials/pupil.png' : (isGsc ? 'specials/gsc/pupil.png' : (isSc ? 'specials/sc/pupil.png' : (isRocker ? 'rockerbody/pupil.png' : (isInvis ? (currentGender === 'female' ? 'specials/female/pupil.png' : 'specials/pupil.png') : (currentGender === 'female' ? 'specials/female/pupil.png' : 'specials/pupil.png')))))
  };

  Object.entries(parts).forEach(([id, src]) => {
    const el = document.getElementById(id);
    if (el) {
      if (src === '') {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        return;
      }
      el.src = src;
      let shouldHide = false;
      // If ghost is NOT active, ensure the part is visible
      if (!isGhost) {
        // Body parts are never hidden by clothing — same behaviour as color skin variants.
        // Cars (non-skate) hide feet. Skate items hide base.
        if (id === 'feet') {
          const carsLayer = document.getElementById('cars');
          const isSkateItem = carsLayer && carsLayer.style.display === 'block' && carsLayer.src && (carsLayer.src.includes('skate.png') || carsLayer.src.includes('dcirc.png') || carsLayer.src.includes('circ.png'));
          const carIsEquipped = carsLayer && carsLayer.style.display === 'block' && !isSkateItem;
          if (carIsEquipped) shouldHide = true;
        }
        if (id === 'base' && isSkate) {
          shouldHide = true;
        }
        if (id === 'arm') {
          const shirtsLayer = document.getElementById('shirts');
          const isArmHidingShirt = shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src && (
            shirtsLayer.src.includes('shirt48') ||
            shirtsLayer.src.includes('shirt49') ||
            shirtsLayer.src.includes('shirt58') ||
            shirtsLayer.src.includes('shirt69') ||
            shirtsLayer.src.includes('shirt72')
          );
          if (isArmHidingShirt) shouldHide = true;
        }

        if (shouldHide) {
          if (id === 'base' || id === 'arm') {
            // Base must remain in layout to anchor character position
            // Arm must remain in layout with display=block so thumbnail maker can calculate correct pivot
            el.style.display = 'block';
            el.style.visibility = 'visible';
            el.style.opacity = '0';
          } else {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
          }
        } else {
          el.style.display = 'block';
          el.style.visibility = 'visible';
        }

        // Manage diaper overlays
        if (id === 'body') {
          const dBody = document.getElementById('diaperbody');
          if (dBody) {
            dBody.style.display = (el.style.display === 'none' || !activeSkinColor || isGhost || isInvis || isRocker) ? 'none' : 'block';
            dBody.style.opacity = '1';
          }
        }
        if (id === 'leg') {
          const dLeg = document.getElementById('diaperleg');
          if (dLeg) {
            dLeg.style.display = (el.style.display === 'none' || !activeSkinColor || isGhost || isInvis || isRocker) ? 'none' : 'block';
            dLeg.style.opacity = '1';
          }
        }
      }

      // Set opacity based on invis state, but preserve skate-hidden base and hidden arm
      if (id === 'base' && isSkate) {
        el.style.opacity = '0';
      } else if (id === 'arm' && shouldHide) {
        el.style.opacity = '0';
      } else {
        el.style.opacity = isInvis ? '0' : '1';
      }
    }
  });

  // === VARIANT SYNC (always use no-skin clothing) ===
  // Always use the no-skin version (invisSrc) if available, since the base character
  // uses white-skinned specials/ sprites and the default clothing src has brown skin baked in.
  ['shirts', 'pants', 'shoes'].forEach(layerId => {
    const layer = document.getElementById(layerId);
    if (layer && layer.style.display === 'block' && layer.src) {
      // Find the menu item that provided this src
      const equippedItem = document.querySelector(`li.equipped[data-layer="${layerId}"]`) ||
        document.querySelector(`img.equipped[data-layer="${layerId}"]`);

      if (equippedItem) {
        const baseSrc = equippedItem.dataset.src;
        let targetSrc = baseSrc;

        // Always prefer the no-skin version (invisSrc) when available
        if (equippedItem.dataset.invisSrc) {
          targetSrc = equippedItem.dataset.invisSrc;
        }

        if (layer.src && !layer.src.includes(targetSrc)) {
          console.log(`Syncing variant for ${layerId}: ${layer.src} -> ${targetSrc}`);
          layer.src = targetSrc;

          // If shoes, also update rightshoe counterpart
          if (layerId === 'shoes') {
            const rightShoeLayer = document.getElementById('rightshoe');
            if (rightShoeLayer && rightShoeLayer.style.display === 'block') {
              const baseRightSrc = equippedItem.dataset.rightSrc || baseSrc;
              const targetRightSrc = equippedItem.dataset.invisRightSrc || equippedItem.dataset.invisSrc || baseRightSrc;
              rightShoeLayer.src = targetRightSrc;
            }
          }
        }
      }
    }
  });

  // Handle Pupil Opacity centrally
  const pupilLayer = document.getElementById('pupil');
  if (pupilLayer) {
    const equippedEye = document.querySelector('#eyesMenu li.equipped');
    const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';

    if (!isGhost && !isGoldenSkeletonActive() && !isSkeletonActive()) {
      pupilLayer.style.display = 'block';
    }

    if (isRocker) {
      pupilLayer.style.opacity = '1';
    } else if (isInvis || isGoldenSkeletonActive() || isSkeletonActive()) {
      // Invis skin or GSC/SC: hide the pupil layer
      pupilLayer.style.display = 'none';
      pupilLayer.style.opacity = '0';
    } else {
      // Normal character: check if eye item hides pupil
      pupilLayer.style.opacity = (equippedEye && !isEyeException(eyeSrc)) ? '0' : '1';
    }
  }

  syncHeadSprite();

  // Re-apply skin color tint if active (must happen after sprites are set back to specials/)
  if (activeSkinColor && !isInvisSkinActive() && !isRockerMakeupActive()) {
    if (activeSkinColor === 'rainbow') {
      // Rainbow is driven by requestAnimationFrame, just make sure it's running
      if (!skinRainbowAnimFrame) startSkinRainbow();
    } else {
      applySkinTint(activeSkinColor);
    }
  }

  // Apply arm rotation after syncing all body parts
  // This ensures that any item-specific arm rotation (e.g., water gun, clown hammer)
  // is correctly reapplied after character swaps (Normal/Invis/Rocker/Skate)
  applyArmRotation();
}

// Central helper to manage head sprite based on state and equipment
function syncHeadSprite() {
  const headLayer = document.getElementById('head');
  const facesLayer = document.getElementById('faces');
  if (!headLayer) return;

  const isRocker = isRockerMakeupActive();
  const isGhost = isGhostOutfitActive();

  const faces29Btn = document.getElementById('faces29item');
  const faces29Equipped = faces29Btn && faces29Btn.classList.contains('equipped');

  // If ghost is on, it handles the head visibility itself or via its own layer
  // But for restoration, if ghost is NOT active, ensure head is shown
  if (!isGhost) {
    headLayer.style.display = "block";
    headLayer.style.visibility = "visible";
  }

  // Priority 1: Invis Skin (Takes precedence over mask)
  if (isInvisSkinActive() && !isRocker) {
    headLayer.src = (currentGender === 'female') ? "specials/female/pupil.png" : "specials/pupil.png";
    const equippedEye = document.querySelector('#eyesMenu li.equipped');
    const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';
    headLayer.style.display = "block";
    headLayer.style.opacity = (equippedEye && !isEyeException(eyeSrc)) ? '0' : '1';
    return;
  }

  // Priority 1.5: Golden Skeleton / Skeleton Character / Robot Skin
  if (isGoldenSkeletonActive()) {
    headLayer.src = "specials/gsc/head.png";
    headLayer.style.display = "block";
    headLayer.style.opacity = '1';
    return;
  }
  if (isSkeletonActive()) {
    headLayer.src = "specials/sc/head.png";
    headLayer.style.display = "block";
    headLayer.style.opacity = '1';
    return;
  }
  if (isRobotSkinActive()) {
    headLayer.src = "specials/robotskin/head.png";
    headLayer.style.display = "block";
    headLayer.style.opacity = '1';
    return;
  }

  // Priority 2: Mechanical Bunny Helmet (facemech.png)
  if (faces29Equipped) {
    if (isInvisSkinActive()) {
      headLayer.src = (currentGender === 'female') ? "specials/female/pupil.png" : "specials/pupil.png";
      // Ensure opacity logic matches standard invis skin (show if eye exception like Rocker is active)
      const equippedEye = document.querySelector('#eyesMenu li.equipped');
      const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';
      headLayer.style.opacity = (equippedEye && !isEyeException(eyeSrc)) ? '0' : '1';

      // Explicitly hide Rocker Makeup layer (eyes) to avoid white pixels, but keep pupil visible (handled above)
      const eyesLayer = document.getElementById('eyes');
      if (eyesLayer) eyesLayer.style.opacity = '0';
    } else {
      // Normal Character + Mech Helmet Logic:
      if (isRocker) {
        headLayer.src = "rockerbody/rockermech.png";
        // Also hide Rocker Makeup pixels (white pixels) for this combination
        const eyesLayer = document.getElementById('eyes');
        if (eyesLayer) eyesLayer.style.opacity = '0';
        headLayer.style.opacity = "1";
        headLayer.style.display = "block";
      } else {
        // Hide head.png entirely — the faces layer shows the helmet visual
        headLayer.style.display = "none";
      }
    }
    return;
  }

  // Priority 3: Rocker or Normal
  if (isRocker) {
    headLayer.src = isInvisSkinActive() ? "rockerbody/invisrocker.png" : "rockerbody/head.png";
    headLayer.style.display = "block";
    headLayer.style.opacity = "1";
  } else {
    if (isInvisSkinActive()) {
        headLayer.src = (currentGender === 'female') ? "specials/female/pupil.png" : "specials/pupil.png";
    } else {
        headLayer.src = "specials/head.png";
    }
    headLayer.style.display = "block"; // Always show the head
    headLayer.style.opacity = "1";
  }
}

// Swap to the invis character variant (also a full character swap, no inventory)
window.equipInvisCharacter = function (element) {
  // Clear any active skin color tint
  clearSkinTint();

  // Clean up DJC layers if switching from Dark Jester
  hideDjcLayers();
  hideNjcLayers();

  // Restore arm to normal positioning (may have been overridden by DJC)
  const armRestore = document.getElementById('arm');
  if (armRestore) {
    armRestore.style.transform = '';
  }

  const baseElement = document.getElementById('base');
  const headElement = document.getElementById('head');

  if (!baseElement || !headElement) return;

  // For invis skin, we keep the normal body and only swap the head sprite.
  // This ensures all items that are aligned to the head keep the same positioning.
  baseElement.style.display = "block";
  baseElement.src = "base.png"; // use the normal base/body for positioning
  baseElement.style.transform = "";
  baseElement.style.opacity = "0"; // hide the nude base safely without affecting layout
  baseElement.style.clipPath = "none"; // Remove clip-path to fix positioning with cars/floaties

  // Custom Skate Check: Hide base if skate/circus item is equipped
  const carsLayer = document.getElementById('cars');
  if (carsLayer && carsLayer.style.display === 'block' && carsLayer.src && (carsLayer.src.includes('skate.png') || carsLayer.src.includes('dcirc.png') || carsLayer.src.includes('circ.png'))) {
    baseElement.style.opacity = '0';
    carsLayer.style.zIndex = 1;
  }

  // Swap the head image to your carved invisibleskin sprite via central logic
  headElement.style.transform = ""; // use CSS .head transform for correct alignment

  const armElement = document.getElementById('arm');
  if (armElement) {
    // Hide arm for invis skin
    armElement.style.opacity = "0";
  }

  // Hide body parts for invis skin
  const bodyParts = ['body', 'leg', 'feet', 'pupil'];
  bodyParts.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      if (id === 'pupil') {
        const equippedEye = document.querySelector('#eyesMenu li.equipped');
        const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';
        if (equippedEye && isEyeException(eyeSrc)) {
          element.style.opacity = "1";
        } else {
          element.style.opacity = "0";
        }
      } else {
        element.style.opacity = "0";
      }
    }
  });

  // Toggle head visibility for Invis Skin based on eye exception
  const equippedEye = document.querySelector('#eyesMenu li.equipped');
  const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';
  if (headElement) {
    if (equippedEye && !isEyeException(eyeSrc)) {
      headElement.style.opacity = "0";
    } else {
      headElement.style.opacity = "1";
    }
  }

  // Ensure shirtsabove is handled if it exists
  const shirtsAboveElement = document.getElementById('shirtsabove');
  if (shirtsAboveElement) {
    // For invis skin we can keep the hand if the shirt is still equipped? 
    // Usually we just leave clothing as is, so no action needed here strictly, 
    // but if we wanted to enforce state we could. 
    // However, invis skin usually hides base body parts, not clothing.
    // So we leave it alone.
  }

  // Re-equip shirts with invis variant if they have one
  const shirtsLayer = document.getElementById('shirts');
  if (shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src) {
    // Find the currently equipped shirt menu item
    const equippedShirt = document.querySelector('#shirtsMenu li.equipped');
    if (equippedShirt && equippedShirt.dataset.invisSrc) {
      // Switch to invis variant manually
      shirtsLayer.src = equippedShirt.dataset.invisSrc;

      const invisScale = equippedShirt.dataset.invisScale ?? equippedShirt.dataset.scale ?? 1;
      const invisX = equippedShirt.dataset.invisX ?? equippedShirt.dataset.x ?? 0;
      const invisY = equippedShirt.dataset.invisY ?? equippedShirt.dataset.y ?? 0;

      shirtsLayer.style.transform = `
        translateX(-50%)
        translate(${invisX}px, ${invisY}px)
        scale(${invisScale})
      `;
    }
  }

  // Re-equip shoes with invis variant if they have one (so switching to invis updates equipped slippers)
  const shoesLayer = document.getElementById('shoes');
  if (shoesLayer && shoesLayer.style.display === 'block') {
    const equippedShoe = document.querySelector('#shoesMenu li.equipped');
    if (equippedShoe && equippedShoe.dataset.invisSrc) {
      shoesLayer.src = equippedShoe.dataset.invisSrc;

      const invisScaleS = equippedShoe.dataset.invisScale ?? equippedShoe.dataset.scale ?? 1;
      const invisXS = equippedShoe.dataset.invisX ?? equippedShoe.dataset.x ?? 0;
      const invisYS = equippedShoe.dataset.invisY ?? equippedShoe.dataset.y ?? 0;

      shoesLayer.style.transform = `
        translateX(-50%)
        translate(${invisXS}px, ${invisYS}px)
        scale(${invisScaleS})
      `;

      const rightShoeLayer = document.getElementById('rightshoe');
      if (rightShoeLayer) {
        rightShoeLayer.style.display = 'block';
        const rightSrc = equippedShoe.dataset.invisRightSrc ?? equippedShoe.dataset.rightSrc ?? equippedShoe.dataset.invisSrc ?? equippedShoe.dataset.src ?? '';
        rightShoeLayer.src = rightSrc;

        const rightScale = equippedShoe.dataset.invisRightScale ?? equippedShoe.dataset.invisScale ?? equippedShoe.dataset.rightScale ?? equippedShoe.dataset.scale ?? 1;
        const rightX = equippedShoe.dataset.invisRightX ?? equippedShoe.dataset.invisX ?? equippedShoe.dataset.rightX ?? equippedShoe.dataset.x ?? 0;
        const rightY = equippedShoe.dataset.invisRightY ?? equippedShoe.dataset.invisY ?? equippedShoe.dataset.rightY ?? equippedShoe.dataset.y ?? 0;

        rightShoeLayer.style.transform = `
          translateX(-50%)
          translate(${rightX}px, ${rightY}px)
          scale(${rightScale})
        `;
      }
    }
  }

  // Re-equip pants with invis variant if they have one
  const pantsLayer = document.getElementById('pants');
  if (pantsLayer && pantsLayer.style.display === 'block') {
    const equippedPants = document.querySelector('#pantsMenu li.equipped');
    if (equippedPants && equippedPants.dataset.invisSrc) {
      pantsLayer.src = equippedPants.dataset.invisSrc;

      const invisScaleP = equippedPants.dataset.invisScale ?? equippedPants.dataset.scale ?? 1;
      const invisXP = equippedPants.dataset.invisX ?? equippedPants.dataset.x ?? 0;
      const invisYP = equippedPants.dataset.invisY ?? equippedPants.dataset.y ?? 0;

      pantsLayer.style.transform = `
        translateX(-50%)
        translate(${invisXP}px, ${invisYP}px)
        scale(${invisScaleP})
      `;
    }
  }

  // Mark this specials entry as selected (visual only, no inventory)
  document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
  element.classList.add("equipped");

  enforceLayerOrder();
  overrideLayerOrder();
  isGhostOutfitActive(); // Ensure CSS classes are synced

  // Sync all body parts using central helper (handles normal/invis/rocker/skate)
  syncBodyParts();

  saveState();
}

// ==================== DARK JESTER CHARACTER ====================

// Helper function to check if Dark Jester Character is equipped
function isDarkJesterActive() {
  const djcMenuItem = document.querySelector("#specialsMenu li[onclick*='equipDarkJester']");
  return djcMenuItem && djcMenuItem.classList.contains("equipped");
}

// Helper to hide all DJC-specific layers
function hideDjcLayers() {
  const djcIds = ['djc-body', 'djc-head', 'djc-left-leg', 'djc-right-leg', 'djc-right-arm'];
  djcIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.src = ''; }
  });
  
  // Clean up left arm class
  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.classList.remove('djc-left-arm');
  }
  
  document.body.classList.remove('djc-active');
}

// Equip the Dark Jester Character
window.equipDarkJester = function (element) {
  // Clear any active skin color tint
  clearSkinTint();
  
  // Hide Normal Jester layers to prevent overlaying
  hideNjcLayers();

  // === Unequip all non-compatible items ===
  // Only hands, pets, pets-back, wings, capes are allowed
  const layersToUnequip = ['hat', 'hair', 'headgears', 'headgearsabove', 'eyes', 'faces',
    'shirts', 'shirtsabove', 'shirtsbehind', 'shirtstop',
    'pants', 'shoes', 'rightshoe', 'outfitshoes', 'outfitrightshoe',
    'cars', 'floaties', 'scarfs', 'backpacks', 'necklaces', 'skin'];

  layersToUnequip.forEach(layerId => {
    const layer = document.getElementById(layerId);
    if (layer && layer.style.display !== 'none') {
      layer.style.display = 'none';
      if (typeof stopAnimation === 'function') stopAnimation(layer);
      layer.src = '';
    }
  });

  // Remove equipped class from non-compatible menu items
  document.querySelectorAll('.equipped').forEach(el => {
    const layer = el.dataset.layer;
    const hat = el.dataset.hat;
    // Keep: hands, pets, pets-back, wings, capes, platforms
    if (layer === 'hands' || layer === 'pets' || layer === 'pets-back' ||
        layer === 'wings' || layer === 'capes' || layer === 'platforms') return;
    // Keep specials menu items (handled separately)
    if (el.closest('#specialsMenu')) return;
    // Unequip hats and everything else
    if (hat || layer) {
      el.classList.remove('equipped');
    }
  });

  // Clear ghost state
  document.body.classList.remove('ghost-active');

  // === Hide normal body parts ===
  const baseElement = document.getElementById('base');
  if (baseElement) {
    baseElement.style.display = 'block'; // Keep for layout anchoring
    baseElement.style.opacity = '0';
    baseElement.style.clipPath = 'none';
  }

  const normalParts = ['body', 'leg', 'feet', 'pupil'];
  normalParts.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; }
  });

  const headElement = document.getElementById('head');
  if (headElement) { headElement.style.display = 'none'; }

  // === Set the existing arm layer to DJC left hand ===
  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.style.display = 'block';
    armElement.src = 'specials/djc/spr_character_jester_hand_1/spr_character_jester_hand1_0.png';
    armElement.style.opacity = '1';
    // Apply DJC arm positioning via CSS class
    armElement.classList.add('djc-left-arm');
  }

  // === Show DJC-specific layers ===
  const djcBody = document.getElementById('djc-body');
  if (djcBody) {
    djcBody.src = 'specials/djc/spr_character_jester_body/spr_character_jester_body_1.png';
    djcBody.style.display = 'block';
  }

  const djcHead = document.getElementById('djc-head');
  if (djcHead) {
    djcHead.src = 'specials/djc/spr_character_jester_head2.png';
    djcHead.style.display = 'block';
  }

  const djcLeftLeg = document.getElementById('djc-left-leg');
  if (djcLeftLeg) {
    djcLeftLeg.src = 'specials/djc/spr_character_jester_leg2.png';
    djcLeftLeg.style.display = 'block';
  }

  const djcRightLeg = document.getElementById('djc-right-leg');
  if (djcRightLeg) {
    djcRightLeg.src = 'specials/djc/spr_character_jester_leg2.png';
    djcRightLeg.style.display = 'block';
  }

  const djcRightArm = document.getElementById('djc-right-arm');
  if (djcRightArm) {
    djcRightArm.src = 'specials/djc/spr_character_jester_hand_1/spr_character_jester_hand1_1.png';
    djcRightArm.style.display = 'block';
  }

  // Add DJC active class to body for CSS rules
  document.body.classList.add('djc-active');

  // Mark this specials entry as selected
  document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
  element.classList.add("equipped");

  enforceLayerOrder();
  overrideLayerOrder();
  applyArmRotation();

  saveState();
}
// =============================================================

// ==================== NORMAL JESTER CHARACTER ====================

// Helper function to check if Normal Jester Character is equipped
function isNormalJesterActive() {
  const njcMenuItem = document.querySelector("#specialsMenu li[onclick*='equipNormalJester']");
  return njcMenuItem && njcMenuItem.classList.contains("equipped");
}

// Helper to hide all NJC-specific layers
function hideNjcLayers() {
  const njcIds = ['njc-body', 'njc-head', 'njc-left-leg', 'njc-right-leg', 'njc-right-arm'];
  njcIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.src = ''; }
  });
  
  // Clean up left arm class
  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.classList.remove('njc-left-arm');
  }
  
  document.body.classList.remove('njc-active');
}

// Equip the Normal Jester Character
window.equipNormalJester = function (element) {
  // Clear any active skin color tint
  clearSkinTint();
  
  // Hide Dark Jester layers to prevent overlaying
  hideDjcLayers();

  // === Unequip all non-compatible items ===
  // Only hands, pets, pets-back, wings, capes are allowed
  const layersToUnequip = ['hat', 'hair', 'headgears', 'headgearsabove', 'eyes', 'faces',
    'shirts', 'shirtsabove', 'shirtsbehind', 'shirtstop',
    'pants', 'shoes', 'rightshoe', 'outfitshoes', 'outfitrightshoe',
    'cars', 'floaties', 'scarfs', 'backpacks', 'necklaces', 'skin'];

  layersToUnequip.forEach(layerId => {
    const layer = document.getElementById(layerId);
    if (layer && layer.style.display !== 'none') {
      layer.style.display = 'none';
      if (typeof stopAnimation === 'function') stopAnimation(layer);
      layer.src = '';
    }
  });

  // Remove equipped class from non-compatible menu items
  document.querySelectorAll('.equipped').forEach(el => {
    const layer = el.dataset.layer;
    const hat = el.dataset.hat;
    // Keep: hands, pets, pets-back, wings, capes, platforms
    if (layer === 'hands' || layer === 'pets' || layer === 'pets-back' ||
        layer === 'wings' || layer === 'capes' || layer === 'platforms') return;
    // Keep specials menu items (handled separately)
    if (el.closest('#specialsMenu')) return;
    // Unequip hats and everything else
    if (hat || layer) {
      el.classList.remove('equipped');
    }
  });

  // Clear ghost state
  document.body.classList.remove('ghost-active');

  // === Hide normal body parts ===
  const baseElement = document.getElementById('base');
  if (baseElement) {
    baseElement.style.display = 'block'; // Keep for layout anchoring
    baseElement.style.opacity = '0';
    baseElement.style.clipPath = 'none';
  }

  const normalParts = ['body', 'leg', 'feet', 'pupil'];
  normalParts.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; }
  });

  const headElement = document.getElementById('head');
  if (headElement) { headElement.style.display = 'none'; }

  // === Set the existing arm layer to NJC left hand ===
  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.style.display = 'block';
    armElement.src = 'specials/normaljester/spr_character_n_jester_hand1/spr_character_n_jester_hand1_0.png';
    armElement.style.opacity = '1';
    // Apply NJC arm positioning via CSS class
    armElement.classList.add('njc-left-arm');
  }

  // === Show NJC-specific layers ===
  const njcBody = document.getElementById('njc-body');
  if (njcBody) {
    njcBody.src = 'specials/normaljester/spr_character_n_jester_body/spr_character_n_jester_body_1.png';
    njcBody.style.display = 'block';
  }

  const njcHead = document.getElementById('njc-head');
  if (njcHead) {
    njcHead.src = 'specials/normaljester/spr_character_n_jester_head2.png';
    njcHead.style.display = 'block';
  }

  const njcLeftLeg = document.getElementById('njc-left-leg');
  if (njcLeftLeg) {
    njcLeftLeg.src = 'specials/normaljester/spr_character_n_jester_leg2.png';
    njcLeftLeg.style.display = 'block';
  }

  const njcRightLeg = document.getElementById('njc-right-leg');
  if (njcRightLeg) {
    njcRightLeg.src = 'specials/normaljester/spr_character_n_jester_leg2.png';
    njcRightLeg.style.display = 'block';
  }

  const njcRightArm = document.getElementById('njc-right-arm');
  if (njcRightArm) {
    njcRightArm.src = 'specials/normaljester/spr_character_n_jester_hand1/spr_character_n_jester_hand1_1.png';
    njcRightArm.style.display = 'block';
  }

  // Add NJC active class to body for CSS rules
  document.body.classList.add('njc-active');

  // Mark this specials entry as selected
  document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
  element.classList.add("equipped");

  enforceLayerOrder();
  overrideLayerOrder();
  applyArmRotation();

  saveState();
}
// =============================================================

// Helper function to check if an eye item should NOT hide base eyes (pupil)
function isEyeException(src) {
  if (!src) return false;

  // Rocker Makeup exception: always show pupils (only if feature is enabled)
  if (enableRockerBodySwap && src.includes('rocker.png')) return true;

  // Ranges: faces 10-12, 14-15, 20-21, 24-59
  const match = src.match(/faces(\d+)/);
  if (match) {
    const num = parseInt(match[1]);
    return (num >= 10 && num <= 12) || (num === 14 || num === 15) || (num >= 20 && num <= 21) || (num >= 24 && num <= 59);
  }
  return false;
}
// =============================================================
// HAND DUPLICATION & BACK SLEEVE SYNC SYSTEM
// =============================================================
let isDuplicateHandEnabled = localStorage.getItem('duplicate_hand_enabled') === 'true';

window.toggleDuplicateHand = function() {
  isDuplicateHandEnabled = !isDuplicateHandEnabled;
  localStorage.setItem('duplicate_hand_enabled', isDuplicateHandEnabled);
  
  const btn = document.getElementById('btnDuplicateHand');
  if (btn) {
    if (isDuplicateHandEnabled) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  // Sync hand to back immediately when toggled
  duplicateHandItemToBack();
  saveState();
};

function syncBackShirtsabove() {
  const shirtsabove = document.getElementById('shirtsabove');
  const backShirtsabove = document.getElementById('back-shirtsabove');
  if (!shirtsabove || !backShirtsabove) return;

  backShirtsabove.style.display = shirtsabove.style.display;
  backShirtsabove.src = shirtsabove.src;

  if (shirtsabove.style.display === 'block') {
    // Look up current active shirt or outfit item in the submenus to grab dataset attributes
    const equippedShirt = document.querySelector('#shirtsMenu li.equipped, #outfitsMenu li.equipped');
    if (equippedShirt) {
      const aboveScale = parseFloat(equippedShirt.dataset.aboveScale ?? 1);
      const aboveX = parseFloat(equippedShirt.dataset.aboveX ?? 0);
      const aboveY = parseFloat(equippedShirt.dataset.aboveY ?? 0);

      // Shift back-shirtsabove by 130px X relative to shirtsabove to place it on the base arm
      backShirtsabove.style.transform = `
        translateX(-50%)
        translate(${aboveX + 130}px, ${aboveY}px)
        scale(${aboveScale})
      `;
    } else {
      // Fallback
      backShirtsabove.style.transform = `
        translateX(-50%)
        translate(130px, 0px)
        scale(1)
      `;
    }
  } else {
    backShirtsabove.style.transform = '';
  }
}

function duplicateHandItemToBack() {
  const hands = document.getElementById('hands');
  const backHands = document.getElementById('back-hands');
  if (!hands || !backHands) return;

  const equippedHand = document.querySelector('#handsMenu li.equipped');
  let isDualDefault = false;
  if (equippedHand) {
    const itemName = equippedHand.textContent.toLowerCase();
    if (itemName.includes('spiked mace') || itemName.includes('dual pickaxe') || itemName.includes('double red lightsaber')) {
      isDualDefault = true;
    }
  }

  if ((isDuplicateHandEnabled || isDualDefault) && hands.style.display === 'block' && hands.src) {
    if (equippedHand) {
      // Exclude specific oversized/two-handed items from being duplicated
      const itemName = equippedHand.textContent.toLowerCase();
      if (itemName.includes('ray blaster') || itemName.includes('water blaster') || itemName.includes('clown hammer')) {
        backHands.style.display = 'none';
        stopAnimation(backHands);
        backHands.src = '';
        backHands.style.transform = '';
        return;
      }

      backHands.style.display = 'block';
      backHands.src = hands.src;

      const scale = parseFloat(equippedHand.dataset.scale ?? 1);
      const x = parseFloat(equippedHand.dataset.x ?? 0);
      const y = parseFloat(equippedHand.dataset.y ?? 0);
      const rotation = equippedHand.dataset.rotation ?? 0;

      // Duplicate onto the base arm: shift by 130px X and keep original scale
      backHands.style.transform = `
        translateX(-50%)
        translate(${x + 130}px, ${y}px)
        scale(${scale})
        rotate(${rotation}deg)
      `;

      if (equippedHand.dataset.animated === 'true') {
        stopAnimation(backHands);
        startAnimation(backHands, {
          framesPath: equippedHand.dataset.frames,
          frameCount: Number(equippedHand.dataset.frameCount),
          fps: Number(equippedHand.dataset.fps) || 8
        });
      } else {
        stopAnimation(backHands);
      }
    }
  } else {
    backHands.style.display = 'none';
    stopAnimation(backHands);
    backHands.src = '';
    backHands.style.transform = '';
  }
}

function equipItem(element) {
  console.log('=== equipItem CALLED ===', element.dataset.layer, element.dataset.frames || element.dataset.src);
  const layerName = element.dataset.layer;
  const src = element.dataset.src || element.dataset.frames; // Support animated items without data-src
  // Outfits use the shirts layer
  const actualLayerName = layerName === 'outfits' ? 'shirts' : layerName;
  const layer = document.getElementById(actualLayerName);

  // === DARK / NORMAL JESTER AUTO-UNEQUIP ===
  // If DJC/NJC is active and equipping a non-allowed category, switch back to normal character
  if (isDarkJesterActive() || isNormalJesterActive()) {
    const djcAllowed = ['hands', 'pets', 'pets-back', 'wings', 'capes', 'platforms'];
    if (!djcAllowed.includes(layerName)) {
      const tanSkinBtn = document.querySelector('#specialsMenu li[data-skin-color="#d49e7a"]');
      if (tanSkinBtn) equipSkinColor(tanSkinBtn, '#d49e7a');
    }
  }



  // === PLATFORM TOGGLE LOGIC ===
  // Platforms can be toggled off by clicking the active one.
  // Switching platforms is handled automatically by the general logic (replacing source).
  if (layerName === 'platforms') {
    // Check if this specific platform is already equipped
    const currentSrc = layer.getAttribute('src'); // Use getAttribute to avoid full URL resolution issues
    // For non-UL elements (like the new top drawer images), we check if they have an 'active' class or similar, 
    // OR we check if the actual layer source matches.

    // Check if the clicked element is currently marked as equipped/active
    const isEquipped = element.classList.contains('equipped');

    if (isEquipped) {
      // Toggle toggling off DISABLED per user request.
      // Do nothing (ignore) if tapping the same platform.
      return;
    } else {
      // We are equipping a new one. 
      // First, remove 'equipped' class from ALL other platform buttons
      document.querySelectorAll('[data-layer="platforms"]').forEach(el => el.classList.remove('equipped'));
      // Then proceed with standard equip logic which sets the new src and adds 'equipped' class
    }
  }

  // === SPACE SUIT LOGIC ===
  // 1. If equipping Space Suit Pants, auto-equip Space Boots
  if (layerName === 'pants' && src.includes('pants28')) {
    const spaceBoots = document.getElementById('space-boots-data');
    if (spaceBoots && !spaceBoots.classList.contains('equipped')) {
      console.log('Auto-equipping Space Boots...');
      equipItem(spaceBoots);
    }
  }

  // 2. If equipping OTHER pants, unequip Space Boots if they are equipped
  if (layerName === 'pants' && !src.includes('pants28')) {
    const spaceBoots = document.getElementById('space-boots-data');
    if (spaceBoots && spaceBoots.classList.contains('equipped')) {
      console.log('Unequipping Space Boots because other pants were equipped...');
      equipItem(spaceBoots); // Toggle off
    }
  }

  // 3. If equipping OTHER shoes, unequip Space Suit Pants if they are equipped
  if (layerName === 'shoes' && !src.includes('space/spr_wa_space_suit_boots')) {
    const spacePants = document.querySelector('li[data-layer="pants"][data-src*="pants28"]');
    if (spacePants && spacePants.classList.contains('equipped')) {
      console.log('Unequipping Space Suit Pants because other shoes were equipped...');
      equipItem(spacePants); // Toggle off
    }
  }
  // ========================

  // === REAPER DEPENDENCY LOGIC ===
  const isPetDarkReaper = (layerName === 'pets-back' && element.dataset.frames && element.dataset.frames.includes('pets/pet2/'));
  const isReapersOath = (layerName === 'hands' && element.dataset.frames && element.dataset.frames.includes('hands/sword6/'));

  // Standard Layer Handling
  if (element.classList.contains('equipped')) {
    // Unequipping Item
    element.classList.remove('equipped');

    // === UNIFIED UNEQUIP CLEANUP ===
    // 1. Clear the main layer
    if (layer) {
      layer.style.display = 'none';
      stopAnimation(layer);
      layer.src = '';

      // If shoes, also update rightshoe counterpart
      if (actualLayerName === 'shoes') {
        const rightShoeLayer = document.getElementById('rightshoe');
        if (rightShoeLayer) {
          rightShoeLayer.style.display = 'none';
          rightShoeLayer.src = '';
        }
      }

      // If hands, also update back-hands counterpart
      if (actualLayerName === 'hands') {
        const backHandsLayer = document.getElementById('back-hands');
        if (backHandsLayer) {
          backHandsLayer.style.display = 'none';
          stopAnimation(backHandsLayer);
          backHandsLayer.src = '';
        }
      }
    }

    // 2. Selective Accessory Cleanup (Multi-Layer / Glitch Fix)
    // Only clear layers that this specific item actually provided
    if (element.dataset.headgearSrc) {
      const habove = document.getElementById('headgearsabove');
      if (habove) { habove.style.display = 'none'; habove.src = ''; }
    }
    if (element.dataset.legSrc) {
      const oshoes = document.getElementById('outfitshoes');
      const orshoes = document.getElementById('outfitrightshoe');
      if (oshoes) { oshoes.style.display = 'none'; oshoes.src = ''; }
      if (orshoes) { orshoes.style.display = 'none'; orshoes.src = ''; }
    }
    if (actualLayerName === 'shirts' || actualLayerName === 'outfits') {
      const sabove = document.getElementById('shirtsabove');
      const stop = document.getElementById('shirtstop');
      const sbehind = document.getElementById('shirtsbehind');
      if (sabove) { sabove.style.display = 'none'; sabove.src = ''; }
      if (stop) { stop.style.display = 'none'; stop.src = ''; }
      if (sbehind) { sbehind.style.display = 'none'; sbehind.src = ''; }
    }
    if (actualLayerName === 'capes') {
      const cabove = document.getElementById('capesabove');
      if (cabove) { cabove.style.display = 'none'; cabove.src = ''; }
      if (layer) layer.classList.remove('rainbow-overlay-active');
    }
    // ===============================

    // === SPACE SUIT UNEQUIP (Unified Path) ===
    if (layerName === 'pants' && element.dataset.src && element.dataset.src.includes('pants28')) {
      const spaceBoots = document.getElementById('space-boots-data');
      if (spaceBoots) spaceBoots.classList.remove('equipped');
      const shoesLayer = document.getElementById('shoes');
      const rightShoeLayer = document.getElementById('rightshoe');
      if (shoesLayer) { shoesLayer.style.display = 'none'; stopAnimation(shoesLayer); shoesLayer.src = ''; }
      if (rightShoeLayer) { rightShoeLayer.style.display = 'none'; rightShoeLayer.src = ''; }
      document.querySelectorAll('#shoesMenu li.equipped').forEach(item => item.classList.remove('equipped'));
    }
    // =========================================

    // sync state based on what's still equipped
    syncBodyParts();
    syncHeadSprite();
    renderInventory();
    isGhostOutfitActive();
    applyArmRotation();

    saveState();
    return;
  }

  // Equipping Item...
  if (isPetDarkReaper && !element.classList.contains('equipped')) {
    // Equipping the pet -> Only auto-equip sword if another hand item is currently equipped
    const handsLayer = document.getElementById('hands');
    const isHandEquipped = handsLayer && handsLayer.style.display === 'block';

    // Check if the currently equipped hand item is NOT Reapers Oath
    if (isHandEquipped) {
      const currentOathElement = document.querySelector('li[data-layer="hands"][data-frames*="hands/sword6/"]');
      if (currentOathElement && !currentOathElement.classList.contains('equipped')) {
        console.log('Auto-equipping Reapers Oath to replace current hand item...');
        equipItem(currentOathElement);
      }
    }
  }

  if (layerName === 'hands' && !isReapersOath) {
    // Equipping a DIFFERENT hand item -> Auto-unequip the pet
    const petElement = document.querySelector('li[data-layer="pets-back"][data-frames*="pets/pet2/"]');
    if (petElement && petElement.classList.contains('equipped')) {
      console.log('Unequipping Pet Dark Reaper because a different hand item is being equipped...');
      equipItem(petElement);
    }
  }
  // ===============================

  // If equipping a car, unequip any shoes first so the car visuals take precedence
  // (unless it's a skate or ball, which can be worn with shoes)
  if (layerName === 'cars') {
    const isSkate = src.includes('skate.png') || src.includes('dcirc.png') || src.includes('circ.png');
    if (!isSkate) {
      const shoesLayer = document.getElementById('shoes');
      const rightShoeLayer = document.getElementById('rightshoe');
      const outfitShoesLayer = document.getElementById('outfitshoes');
      const outfitRightShoeLayer = document.getElementById('outfitrightshoe');

      if (shoesLayer && shoesLayer.style.display === 'block') {
        shoesLayer.style.display = 'none';
        stopAnimation(shoesLayer);
        shoesLayer.src = '';
        if (rightShoeLayer) {
          rightShoeLayer.style.display = 'none';
          rightShoeLayer.src = '';
        }
        // Remove equipped class from shoe menu items
        document.querySelectorAll('[data-layer="shoes"]').forEach(item => item.classList.remove('equipped'));
      }

      // Hide outfit-specific shoes (like Nutcracker) but don't clear src
      if (outfitShoesLayer) {
        outfitShoesLayer.style.display = 'none';
      }
      if (outfitRightShoeLayer) {
        outfitRightShoeLayer.style.display = 'none';
      }
    }
    
    // Unequip Circus Lion if equipping another Car
    const circusLionMenuItem = document.querySelector('[data-layer="pets-back"][data-frames*="pets/pet01/"].equipped');
    if (circusLionMenuItem) {
      equipItem(circusLionMenuItem); 
    }
  }

  // If Nutcracker outfit (shirt24) is currently equipped and we're equipping
  // a different shirts/outfits item, clear any outfit-specific shoe/leg layers
  if (layerName === 'shirts' || layerName === 'outfits') {
    const shirtsLayer = document.getElementById('shirts');
    const nutcrackerMenuItem = document.querySelector('[data-layer="outfits"][data-src*="shirt24"]');
    const isNutcrackerEquipped = shirtsLayer && shirtsLayer.style.display === 'block' && nutcrackerMenuItem && nutcrackerMenuItem.classList.contains('equipped');
    const isClickingNutcracker = (element.dataset && ((element.dataset.src && element.dataset.src.includes('shirt24')) || (element.dataset.frames && element.dataset.frames.includes('shirt24'))));

    if (isNutcrackerEquipped && !isClickingNutcracker) {
      const outfitShoesLayer = document.getElementById('outfitshoes');
      const outfitRightShoeLayer = document.getElementById('outfitrightshoe');
      if (outfitShoesLayer && outfitShoesLayer.style.display === 'block') {
        outfitShoesLayer.style.display = 'none';
        stopAnimation(outfitShoesLayer);
        outfitShoesLayer.src = '';
      }
      if (outfitRightShoeLayer && outfitRightShoeLayer.style.display === 'block') {
        outfitRightShoeLayer.style.display = 'none';
        stopAnimation(outfitRightShoeLayer);
        outfitRightShoeLayer.src = '';
      }
      // Remove equipped flag from the Nutcracker menu item
      if (nutcrackerMenuItem) nutcrackerMenuItem.classList.remove('equipped');
    }
  }

  // Prevent normal shoes from overwriting outfit-provided legs (e.g., Nutcracker)


  // If a Nutcracker outfit is currently equipped and the user is equipping a normal `shirts` item,
  // fully unequip the Nutcracker outfit first so the new shirt can replace it.
  if (layerName === 'shirts') {
    const shirtsLayer = document.getElementById('shirts');
    const nutcrackerMenuItem = document.querySelector('[data-layer="outfits"][data-src*="shirt24"]');
    const isNutcrackerEquipped = shirtsLayer && shirtsLayer.style.display === 'block' &&
      nutcrackerMenuItem && nutcrackerMenuItem.classList.contains('equipped');

    if (isNutcrackerEquipped) {
      // Unequip the outfit's visual layers (body/outfit head/shoes) and remove its equipped flag
      try {
        // Remove equipped class from the nutcracker menu item
        nutcrackerMenuItem.classList.remove('equipped');

        // Clear shirts layer (the outfit occupies the shirts layer)
        shirtsLayer.style.display = 'none';
        stopAnimation(shirtsLayer);
        shirtsLayer.src = '';

        // Clear outfit-specific head and above/head layers
        const headgearsAboveLayer = document.getElementById('headgearsabove');
        if (headgearsAboveLayer) { headgearsAboveLayer.style.display = 'none'; headgearsAboveLayer.src = ''; }

        // Clear outfit-provided shoes (move to outfit-specific layers)
        const outfitShoesLayer = document.getElementById('outfitshoes');
        const outfitRightShoeLayer = document.getElementById('outfitrightshoe');
        if (outfitShoesLayer) { outfitShoesLayer.style.display = 'none'; outfitShoesLayer.src = ''; }
        if (outfitRightShoeLayer) { outfitRightShoeLayer.style.display = 'none'; outfitRightShoeLayer.src = ''; }
        // Clear any temporary pants z-index override
        const pantsLayerReset = document.getElementById('pants');
        if (pantsLayerReset) pantsLayerReset.style.zIndex = '';
      } catch (e) {
        console.warn('Error while unequipping Nutcracker outfit:', e);
      }
    }
  }

  // Check if reaper outfit (shirt63) is currently equipped and auto-unequip if needed
  if (layerName !== 'wings' && layerName !== 'capes' && layerName !== 'hands' && layerName !== 'shirts' && layerName !== 'outfits' && layerName !== 'pets' && layerName !== 'pets-back') {
    const shirtsLayer = document.getElementById('shirts');
    // Find which reaper-style outfit is actually equipped
    const reaperMenuItem = document.querySelector('[data-layer="outfits"][data-src*="shirt63"].equipped') ||
      document.querySelector('[data-layer="outfits"][data-src*="shirt76"].equipped');
    const isReaperEquipped = shirtsLayer && shirtsLayer.style.display === 'block' && reaperMenuItem;

    if (isReaperEquipped) {
      shirtsLayer.style.display = 'none';
      stopAnimation(shirtsLayer);
      shirtsLayer.src = '';

      // Clear all shirt-related layers including both headgears layers
      const shirtsaboveLayer = document.getElementById('shirtsabove');
      const shirtstopLayer = document.getElementById('shirtstop');
      const shirtsbehindLayer = document.getElementById('shirtsbehind');
      const headgearsLayer = document.getElementById('headgears');
      const headgearsAboveLayer = document.getElementById('headgearsabove');
      if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
      if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
      if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }
      if (headgearsLayer) { headgearsLayer.style.display = 'none'; headgearsLayer.src = ''; }
      if (headgearsAboveLayer) { headgearsAboveLayer.style.display = 'none'; headgearsAboveLayer.src = ''; }

      // Restore body parts
      syncBodyParts();

      // Remove equipped class from reaper outfit

      // Remove equipped class from reaper outfit
      if (reaperMenuItem) {
        reaperMenuItem.classList.remove('equipped');
      }
    }
  }

  // Check if shirt 52 is currently equipped (check both outfits and shirts menu items)
  const shirtsLayer = document.getElementById('shirts');
  const shirt52MenuItem = document.querySelector('[data-layer="outfits"][data-frames*="shirt52"]') || document.querySelector('[data-layer="shirts"][data-frames*="shirt52"]');
  const isShirt52Equipped = shirtsLayer && shirtsLayer.style.display === 'block' &&
    shirt52MenuItem && shirt52MenuItem.classList.contains('equipped');

  const isClickingShirt52 = (layerName === 'outfits' || layerName === 'shirts') && ((src && src.includes('shirt52')) || (element.dataset.frames && element.dataset.frames.includes('shirt52')));

  // Allow pets to be equipped/unequipped with shirt52 without affecting shirt52
  const isPets = layerName === 'pets';

  // When equipping ANY shirt or outfit (except ghost/pets), unequip ghost outfit
  const isEquippingShirtOrOutfit = (layerName === 'shirts' || layerName === 'outfits');

  // When equipping ANY shirt or outfit, clear Reaper/Black Robe special layers if equipping something else
  if (isEquippingShirtOrOutfit) {
    const isClickingReaperStyle = (src && (src.includes('shirt63') || src.includes('shirt76')));
    if (!isClickingReaperStyle) {
      const headgearsAboveLayer = document.getElementById('headgearsabove');
      const reaperMenuItem = document.querySelector('[data-layer="outfits"][data-src*="shirt63"].equipped') ||
        document.querySelector('[data-layer="outfits"][data-src*="shirt76"].equipped');
      if (reaperMenuItem) {
        reaperMenuItem.classList.remove('equipped');
        if (headgearsAboveLayer) {
          headgearsAboveLayer.style.display = 'none';
          headgearsAboveLayer.src = '';
        }
      }
    }
  }

  // When equipping ANY item (except specifically pets/pets-back), unequip ghost outfit
  // Note: we removed the `isEquippingShirtOrOutfit` restriction here.

  // Mutual Exclusivity for Ghost Outfit (shirt52)
  if (isShirt52Equipped && !isClickingShirt52 && layerName !== 'pets' && layerName !== 'pets-back') {
    // Unequip shirt 52 first - clear the layer and menu items
    if (shirtsLayer) {
      shirtsLayer.style.display = 'none';
      stopAnimation(shirtsLayer);
      shirtsLayer.src = '';

      // Clear shirt-related layers
      const shirtsaboveLayer = document.getElementById('shirtsabove');
      const shirtstopLayer = document.getElementById('shirtstop');
      const shirtsbehindLayer = document.getElementById('shirtsbehind');
      if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
      if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
      if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

      // Restore body parts
      syncBodyParts();

      // Remove equipped class from outfit/shirt menu items

      // Remove equipped class from outfit/shirt menu items
      document.querySelectorAll('[data-layer="outfits"], [data-layer="shirts"]').forEach(item => {
        item.classList.remove('equipped');
      });
    }
  }

  // MUTUAL EXCLUSIVITY: Wings and Capes can't be equipped together
  if (layerName === 'capes') {
    // Unequip wings when equipping cape
    const wingsLayer = document.getElementById('wings');
    if (wingsLayer.style.display === 'block') {
      wingsLayer.style.display = 'none';
      stopAnimation(wingsLayer);
      wingsLayer.src = '';
      // Remove equipped class from wings menu items
      document.querySelectorAll('[data-layer="wings"]').forEach(item => {
        item.classList.remove('equipped');
      });
    }
  } else if (layerName === 'wings') {
    // Unequip capes when equipping wings
    const capesLayer = document.getElementById('capes');
    const capesaboveLayer = document.getElementById('capesabove');
    if (capesLayer.style.display === 'block') {
      capesLayer.style.display = 'none';
      stopAnimation(capesLayer);
      capesLayer.src = '';
      capesaboveLayer.style.display = 'none';
      stopAnimation(capesaboveLayer);
      capesaboveLayer.src = '';
      if (capesLayer) capesLayer.classList.remove('rainbow-overlay-active');
      // Remove equipped class from cape menu items
      document.querySelectorAll('[data-layer="capes"]').forEach(item => {
        item.classList.remove('equipped');
      });
    }
  }

  // MUTUAL EXCLUSIVITY: Front and Back pets can't be equipped together
  if (layerName === 'pets') {
    const petsBackLayer = document.getElementById('pets-back');
    const isCircusLionEquipped = document.querySelector('[data-layer="pets-back"][data-frames*="pets/pet01/"].equipped');
    if (!isCircusLionEquipped && petsBackLayer && petsBackLayer.style.display === 'block') {
      petsBackLayer.style.display = 'none';
      stopAnimation(petsBackLayer);
      petsBackLayer.src = '';
      document.querySelectorAll('[data-layer="pets-back"]').forEach(item => {
        item.classList.remove('equipped');
      });
    }
  } else if (layerName === 'pets-back') {
    const isEquippingCircusLion = (element.dataset.frames && element.dataset.frames.includes('pets/pet01/'));
    const petsLayer = document.getElementById('pets');
    if (!isEquippingCircusLion && petsLayer && petsLayer.style.display === 'block') {
      petsLayer.style.display = 'none';
      stopAnimation(petsLayer);
      petsLayer.src = '';
      document.querySelectorAll('[data-layer="pets"]').forEach(item => {
        item.classList.remove('equipped');
      });
    }
    
    // Unequip Cars if Equipping Circus Lion
    if (isEquippingCircusLion) {
      const carsLayer = document.getElementById('cars');
      if (carsLayer && carsLayer.style.display === 'block') {
        carsLayer.style.display = 'none';
        stopAnimation(carsLayer);
        carsLayer.src = '';
        document.querySelectorAll('[data-layer="cars"]').forEach(item => {
          item.classList.remove('equipped');
        });
      }
    }
  }

  // DIRECT REPLACEMENT: If clicking same layer type with different item, replace immediately
  if (layer.style.display === "block") {
    // Check if this is a different item of the same type
    let currentSrc = false;

    console.log('Checking if same item:', {
      layerName,
      'layer.src': layer.src,
      'element.dataset.src': element.dataset.src,
      'element.dataset.frames': element.dataset.frames,
      'element.dataset.animated': element.dataset.animated
    });

    if (element.dataset.animated === 'true' && element.dataset.frames) {
      // Animated item - check if layer.src contains the frames folder
      // Also accept an invis-specific frames path if provided
      const framesPath = element.dataset.frames.replace(/\/$/, '');
      const invisFramesPath = element.dataset.invisFrames ? element.dataset.invisFrames.replace(/\/$/, '') : null;
      currentSrc = layer.src && (layer.src.includes(framesPath) || (invisFramesPath && layer.src.includes(invisFramesPath)));
      console.log('Animated item check:', { framesPath, invisFramesPath, 'layer.src': layer.src, currentSrc });
    } else {
      // Static item - consider normal, invis, rocker, and right variants as equivalent
      const candidates = [];
      if (element.dataset.src) {
        candidates.push(element.dataset.src);
        // Include rocker variant if exists
        if (rockerVariants[element.dataset.src]) {
          candidates.push(rockerVariants[element.dataset.src]);
        }
      }
      if (element.dataset.invisSrc) candidates.push(element.dataset.invisSrc);
      if (element.dataset.rightSrc) candidates.push(element.dataset.rightSrc);
      if (element.dataset.invisRightSrc) candidates.push(element.dataset.invisRightSrc);

      currentSrc = layer.src && candidates.some(c => c && layer.src.includes(c));
      console.log('Static item check (candidates):', { candidates, 'layer.src': layer.src, currentSrc });
    }

    if (currentSrc) {
      // PLATFORM OVERRIDE: Do not unequip platforms when clicking the same one
      if (layerName === 'platforms') {
        return;
      }

      // Same item - unequip it
      // Check if we're unequipping shirt 52 BEFORE clearing the src
      const isUnequippingShirt52 = (layerName === 'shirts' || layerName === 'outfits') && layer.src && layer.src.includes('shirt52');

      layer.style.display = "none";
      stopAnimation(layer);
      layer.src = "";

      element.classList.remove("equipped");

      // === SPACE SUIT UNEQUIP LOGIC ===
      if (layerName === 'pants' && element.dataset.src && element.dataset.src.includes('pants28')) {
        const spaceBoots = document.getElementById('space-boots-data');
        if (spaceBoots) {
          spaceBoots.classList.remove('equipped');
        }
        // Explicitly clear shoes and rightshoe layers
        const shoesLayer = document.getElementById('shoes');
        const rightShoeLayer = document.getElementById('rightshoe');
        if (shoesLayer) {
          shoesLayer.style.display = 'none';
          stopAnimation(shoesLayer);
          shoesLayer.src = '';
        }
        if (rightShoeLayer) {
          rightShoeLayer.style.display = 'none';
          rightShoeLayer.src = '';
        }
        // Also remove equipped from any shoes menu items
        document.querySelectorAll('#shoesMenu li.equipped').forEach(item => {
          item.classList.remove('equipped');
        });
        console.log('Space Suit Pants unequipped - cleared Space Boots & shoes layers');
      }

      // If hands, also update back-hands counterpart
      if (layerName === 'hands') {
        const backHandsLayer = document.getElementById('back-hands');
        if (backHandsLayer) {
          backHandsLayer.style.display = 'none';
          stopAnimation(backHandsLayer);
          backHandsLayer.src = '';
        }
      }
      // ================================

      // Show corresponding body parts when unequipping items (respecting character state)
      const isInvis = isInvisSkinActive();
      if (layerName === 'shoes' || layerName === 'pants' || layerName === 'shirts' || layerName === 'outfits' || layerName === 'eyes' || layerName === 'cars' || layerName === 'faces') {

        // Custom Skate Logic cleanup: Revert assets if unequipping cars
        if (layerName === 'cars') {
          const baseLayer = document.getElementById('base');
          const legLayer = document.getElementById('leg');
          if (baseLayer) baseLayer.src = 'base.png';
          if (legLayer) legLayer.src = 'leg.png';
        }

        // Restore body/leg filter if unequipping rocker makeup (faces4)
        if (layerName === 'faces') {
          const bodyLayer = document.getElementById('body');
          const legLayer = document.getElementById('leg');
          if (bodyLayer) bodyLayer.style.filter = '';
          if (legLayer) legLayer.style.filter = '';
        }

        syncBodyParts();

        if (isUnequippingShirt52) {
          // Force removal of the CSS locking class immediately
          document.body.classList.remove('ghost-active');
        }
      }

      if (layerName === 'capes') {
        const capesaboveLayer = document.getElementById('capesabove');
        if (capesaboveLayer) {
          capesaboveLayer.style.display = "none";
          stopAnimation(capesaboveLayer);
          capesaboveLayer.src = "";
        }
        layer.classList.remove('rainbow-overlay-active');
      }

      // Handle dual shirt system
      if (layerName === 'shirts' || layerName === 'outfits') {
        const shirtsaboveLayer = document.getElementById('shirtsabove');
        if (shirtsaboveLayer) {
          shirtsaboveLayer.style.display = "none";
          shirtsaboveLayer.src = "";
        }

        // Clear shirtstop layer if it was used by a shirt
        const shirtstopLayer = document.getElementById('shirtstop');
        if (shirtstopLayer) {
          shirtstopLayer.style.display = "none";
          shirtstopLayer.src = "";
        }

        // Clear shirtsbehind layer if it was used by a shirt
        const shirtsbehindLayer = document.getElementById('shirtsbehind');
        if (shirtsbehindLayer) {
          shirtsbehindLayer.style.display = "none";
          shirtsbehindLayer.src = "";
        }

        // Clear outfit-provided headgear (moved to headgearsabove) only if it matches
        const headgearsAboveLayer = document.getElementById('headgearsabove');
        if (headgearsAboveLayer && element && element.dataset.headgearSrc) {
          const currentHeadgearSrc = headgearsAboveLayer.src || '';
          if (currentHeadgearSrc.includes(element.dataset.headgearSrc)) {
            headgearsAboveLayer.style.display = "none";
            headgearsAboveLayer.src = "";
          }
        }

        // If this outfit provided leg/shoe assets, clear those outfit-specific layers (e.g., nutcracker)
        const outfitShoesLayer = document.getElementById('outfitshoes');
        const outfitRightShoeLayer = document.getElementById('outfitrightshoe');
        if ((element && (element.dataset.legSrc || element.dataset.rightLegSrc))) {
          if (outfitShoesLayer && outfitShoesLayer.style.display === 'block') {
            outfitShoesLayer.style.display = 'none';
            stopAnimation(outfitShoesLayer);
            outfitShoesLayer.src = '';
          }
          if (outfitRightShoeLayer && outfitRightShoeLayer.style.display === 'block') {
            outfitRightShoeLayer.style.display = 'none';
            stopAnimation(outfitRightShoeLayer);
            outfitRightShoeLayer.src = '';
          }
        }
      }

      // Handle dual shoes system
      if (layerName === 'shoes') {
        const rightShoeLayer = document.getElementById('rightshoe');
        if (rightShoeLayer) {
          rightShoeLayer.style.display = "none";
          rightShoeLayer.src = "";
        }
      }

      syncHeadSprite();
      // Sync state classes (like ghost-active) based on current equipment
      isGhostOutfitActive();
      // Update inventory UI so the slot highlight is cleared when an item is unequipped
      try { renderInventory(); } catch (e) { }
      applyArmRotation(); // Ensure arm/sleeves reset when hand is removed

      // Re-apply equipped filter if active to keep the list updated upon unequip
      if (isFilterEquippedActive && typeof applyEquippedFilter === 'function') {
        applyEquippedFilter();
      }

      syncBackShirtsabove();
      duplicateHandItemToBack();
      saveState();
      return;
    } else {
      // Different item of same type - ensure previous animation is stopped before switching
      stopAnimation(layer);
    }
  } else {
    // Layer is hidden, but stop existing animation just in case of stale state
    stopAnimation(layer);
  }

  layer.style.display = "block";

  // Apply floating class for pets-back if specified
  if (layerName === 'pets-back') {
    if (element.dataset.floating === 'true') {
      layer.classList.add('floating');
    } else {
      layer.classList.remove('floating');
    }
  }

  // Forcefully stop float animation for Pet Sun
  if (layerName === 'pets') {
    if (element.dataset.frames && element.dataset.frames.includes('spr_wa_pet_sun')) {
      layer.style.animation = 'none';
    } else {
      layer.style.animation = '';
    }
  }
  const isAnimated = element.dataset.animated === "true";

  // If equipping pants while Nutcracker outfit is active, render pants above the outfit
  if (layerName === 'pants') {
    const shirtsLayerCheck = document.getElementById('shirts');
    const nutcrackerMenuItemCheck = document.querySelector('[data-layer="outfits"][data-src*="shirt24"]');
    const isNutcrackerEquippedCheck = shirtsLayerCheck && shirtsLayerCheck.style.display === 'block' &&
      (nutcrackerMenuItemCheck && nutcrackerMenuItemCheck.classList.contains('equipped'));

    if (isNutcrackerEquippedCheck) {
      // Temporarily raise pants above shirts so pants overlay the Nutcracker shirt
      layer.style.zIndex = 20;
    } else {
      // Clear any previous override
      layer.style.zIndex = '';
    }
  }

  // Hide corresponding body parts when equipping items
  if (layerName === 'shoes') {
    // If a car is currently equipped, unequip it before equipping shoes
    // (unless it's a skate or ball, which can be worn with shoes)
    const carsLayer = document.getElementById('cars');
    if (carsLayer && carsLayer.style.display === 'block') {
      const carSrc = carsLayer.src || '';
      const isSkate = carSrc.includes('skate.png') || carSrc.includes('dcirc.png') || carSrc.includes('circ.png');
      if (!isSkate) {
        carsLayer.style.display = 'none';
        carsLayer.src = '';
        document.querySelectorAll('[data-layer="cars"]').forEach(item => item.classList.remove('equipped'));
      }
    }

    const feetLayer = document.getElementById('feet');
    if (feetLayer) feetLayer.style.display = 'none';
  } else if (layerName === 'pants') {
    const legLayer = document.getElementById('leg');
    if (legLayer) legLayer.style.display = 'none';
  } else if (layerName === 'shirts' || layerName === 'outfits') {
    const bodyLayer = document.getElementById('body');
    if (bodyLayer) bodyLayer.style.display = 'none';

    // Special handling for nutcracker outfit (shirt24)
    const isNutcrackerOutfit = (src && src.includes('shirt24'));
    if (isNutcrackerOutfit) {
      // Clear all shirt-related layers from previous shirt
      const shirtsaboveLayer = document.getElementById('shirtsabove');
      const shirtstopLayer = document.getElementById('shirtstop');
      const shirtsbehindLayer = document.getElementById('shirtsbehind');
      if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
      if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
      if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

      // Unequip conflicting items (but allow shirts to stay)
      // Allow `headgears` and `hair` to remain equipped with the nutcracker outfit.
      const layersToUnequip = ['hat', 'faces', 'eyes', 'pants'];
      layersToUnequip.forEach(layerType => {
        const layerToUnequip = document.getElementById(layerType);
        if (layerToUnequip && layerToUnequip.style.display === 'block') {
          layerToUnequip.style.display = 'none';
          stopAnimation(layerToUnequip);
          layerToUnequip.src = '';

          // Remove equipped class from menu items
          document.querySelectorAll(`[data-layer="${layerType}"]`).forEach(item => {
            item.classList.remove('equipped');
          });
        }
      });

      // Restore pupil since nutcracker outfit shows the face
      const pupilLayer = document.getElementById('pupil');
      if (pupilLayer) pupilLayer.style.display = 'block';
    }

    // Special handling for reaper outfit (shirt63) and black robe (shirt76)
    const isReaperOutfit = (src && (src.includes('shirt63') || src.includes('shirt76')));
    if (isReaperOutfit) {
      // Clear all shirt-related layers from previous shirt
      const shirtsaboveLayer = document.getElementById('shirtsabove');
      const shirtstopLayer = document.getElementById('shirtstop');
      const shirtsbehindLayer = document.getElementById('shirtsbehind');
      if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
      if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
      if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

      // Unequip conflicting items
      const layersToUnequip = ['hat', 'headgears', 'hair', 'faces', 'eyes', 'pants', 'shoes', 'cars', 'floaties', 'scarfs', 'backpacks', 'necklaces'];
      layersToUnequip.forEach(layerType => {
        const layerToUnequip = document.getElementById(layerType);
        if (layerToUnequip && layerToUnequip.style.display === 'block') {
          layerToUnequip.style.display = 'none';
          stopAnimation(layerToUnequip);
          layerToUnequip.src = '';

          // Remove equipped class from menu items
          document.querySelectorAll(`[data-layer="${layerType}"]`).forEach(item => {
            item.classList.remove('equipped');
          });

          // Handle special layers
          if (layerType === 'shoes') {
            const rightShoeLayer = document.getElementById('rightshoe');
            if (rightShoeLayer) { rightShoeLayer.style.display = 'none'; rightShoeLayer.src = ''; }
          }
        }
      });

      // Restore pupil since reaper outfit shows the face
      const pupilLayer = document.getElementById('pupil');
      if (pupilLayer) pupilLayer.style.display = 'block';
    }

    // Special handling for shirt 52 (ghost outfit)
    const isShirt52 = (src && src.includes('shirt52')) || (element.dataset.frames && element.dataset.frames.includes('shirt52'));
    if (isShirt52) {
      // Clear all shirt-related layers from previous shirt
      const shirtsaboveLayer = document.getElementById('shirtsabove');
      const shirtstopLayer = document.getElementById('shirtstop');
      const shirtsbehindLayer = document.getElementById('shirtsbehind');
      if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
      if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
      if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

      // Hide body parts (but keep base for positioning reference)
      const bodyLayer = document.getElementById('body');
      const armLayer = document.getElementById('arm');
      const headLayer = document.getElementById('head');
      const feetLayer = document.getElementById('feet');
      const legLayer = document.getElementById('leg');
      const pupilLayer = document.getElementById('pupil');
      if (bodyLayer) bodyLayer.style.display = 'none';
      if (armLayer) armLayer.style.display = 'none';
      if (headLayer) headLayer.style.display = 'none';
      if (feetLayer) feetLayer.style.display = 'none';
      if (legLayer) legLayer.style.display = 'none';
      if (pupilLayer) pupilLayer.style.display = 'none';

      // Unequip all other items (except pets - they can stay)
      const layersToUnequip = ['hat', 'hair', 'headgears', 'headgearsabove', 'eyes', 'faces', 'pants', 'shoes', 'hands', 'capes', 'wings', 'cars', 'floaties', 'scarfs', 'backpacks', 'necklaces'];
      layersToUnequip.forEach(layerType => {
        const layerToUnequip = document.getElementById(layerType);
        if (layerToUnequip && layerToUnequip.style.display === 'block') {
          layerToUnequip.style.display = 'none';
          stopAnimation(layerToUnequip);
          layerToUnequip.src = '';

          // Remove equipped class from menu items
          document.querySelectorAll(`[data-layer="${layerType}"]`).forEach(item => {
            item.classList.remove('equipped');
          });

          // Clear additional layers for specific types
          if (layerType === 'capes') {
            const capesaboveLayer = document.getElementById('capesabove');
            if (capesaboveLayer) { capesaboveLayer.style.display = 'none'; stopAnimation(capesaboveLayer); capesaboveLayer.src = ''; }
          } else if (layerType === 'shoes') {
            const rightShoeLayer = document.getElementById('rightshoe');
            if (rightShoeLayer) { rightShoeLayer.style.display = 'none'; rightShoeLayer.src = ''; }
            // Also clear outfit-specific shoe layers
            const outfitShoesLayer = document.getElementById('outfitshoes');
            const outfitRightShoeLayer = document.getElementById('outfitrightshoe');
            if (outfitShoesLayer) { outfitShoesLayer.style.display = 'none'; outfitShoesLayer.src = ''; }
            if (outfitRightShoeLayer) { outfitRightShoeLayer.style.display = 'none'; outfitRightShoeLayer.src = ''; }
          } else if (layerType === 'hands') {
            const backHandsLayer = document.getElementById('back-hands');
            if (backHandsLayer) {
              backHandsLayer.style.display = 'none';
              stopAnimation(backHandsLayer);
              backHandsLayer.src = '';
            }
          }
        }
      });
    }
  } else if (layerName === 'eyes') {
    // Body parts sync handled via centralized helper
    syncBodyParts();
  }

  // If equipping faces4 (rocker makeup), turn body/leg black using CSS filter
  if (layerName === 'faces' && src.includes('faces4.png')) {
    const bodyLayer = document.getElementById('body');
    const legLayer = document.getElementById('leg');

    if (bodyLayer) {
      bodyLayer.style.filter = 'brightness(0)';
      bodyLayer.style.display = 'block';
      bodyLayer.style.visibility = 'visible';
    }
    if (legLayer) {
      legLayer.style.filter = 'brightness(0)';
      legLayer.style.display = 'block';
      legLayer.style.visibility = 'visible';
    }

  }

  // If equipping faces29 (mech face), swap head sprite to facemech (root)
  // If equipping faces29 (mech face), sync head sprite (handled at end of function)
  if (layerName === 'faces' && src.includes('faces29.png')) {
  }

  // If equipping a car, hide feet to match expected visuals (except for skate)
  if (layerName === 'cars') {
    const feetLayer = document.getElementById('feet');
    const carsLayer = document.getElementById('cars');
    const isSkate = src.includes('skate.png') || src.includes('dcirc.png') || src.includes('circ.png');

    if (feetLayer) {
      if (isSkate) {
        feetLayer.style.display = 'block';
      } else {
        feetLayer.style.display = 'none';
      }
    }

    // Hide outfit specific shoes when equipping a car (unless skate)
    const outfitShoesLayer = document.getElementById('outfitshoes');
    const outfitRightShoeLayer = document.getElementById('outfitrightshoe');
    if (!isSkate) {
      if (outfitShoesLayer) outfitShoesLayer.style.display = 'none';
      if (outfitRightShoeLayer) outfitRightShoeLayer.style.display = 'none';
    } else {
      if (outfitShoesLayer && outfitShoesLayer.src && outfitShoesLayer.src.length > 50) outfitShoesLayer.style.display = 'block';
      if (outfitRightShoeLayer && outfitRightShoeLayer.src && outfitRightShoeLayer.src.length > 50) outfitRightShoeLayer.style.display = 'block';
    }

    if (carsLayer) {
      if (isSkate) {
        carsLayer.style.zIndex = -1;
      } else {
        carsLayer.style.zIndex = '';
      }
    }
  }

  if (isAnimated) {
    // Clear any static src before starting animation to prevent artifacts (especially on iPhone)
    layer.src = '';
    startAnimation(layer, {
      framesPath: element.dataset.frames,
      frameCount: Number(element.dataset.frameCount),
      fps: Number(element.dataset.fps) || 8
    });

    // Handle dual cape system for animated capes
    if (layerName === 'capes') {
      const capesaboveLayer = document.getElementById('capesabove');

      if (element.dataset.aboveSrc) {
        capesaboveLayer.style.display = "block";
        capesaboveLayer.src = element.dataset.aboveSrc;

        // Apply above-specific transform from HTML
        const aboveScale = element.dataset.aboveScale ?? element.dataset.scale ?? 1;
        const aboveX = element.dataset.aboveX ?? element.dataset.x ?? 0;
        const aboveY = element.dataset.aboveY ?? element.dataset.y ?? 0;

        capesaboveLayer.style.transform = `
          translateX(-50%)
          translate(${aboveX}px, ${aboveY}px)
          scale(${aboveScale})
        `;
      } else {
        capesaboveLayer.style.display = "none";
        capesaboveLayer.src = "";
      }
    }
  } else {
    stopAnimation(layer);

    // Check if invis skin is active and the item has an alternative invis version
    let actualSrc = src;
    let actualScale = element.dataset.scale ?? 1;
    let actualX = element.dataset.x ?? 0;
    let actualY = element.dataset.y ?? 0;

    // Always use no-skin variant (invisSrc) for clothing since base character uses white skin
    if ((layerName === 'shirts' || layerName === 'shoes' || layerName === 'pants') && element.dataset.invisSrc) {
      actualSrc = element.dataset.invisSrc;
      actualScale = element.dataset.invisScale ?? actualScale;
      actualX = element.dataset.invisX ?? actualX;
      actualY = element.dataset.invisY ?? actualY;

      // Special case for shoes: right shoe variant
      if (layerName === 'shoes') {
        const rightShoeLayer = document.getElementById('rightshoe');
        if (rightShoeLayer) {
          const baseRightSrc = element.dataset.rightSrc || actualSrc;
          const targetRightSrc = element.dataset.invisRightSrc || element.dataset.invisSrc || baseRightSrc;
          rightShoeLayer.src = targetRightSrc;
        }
      }
    }

    layer.src = actualSrc;


    // Handle dual cape system for static capes
    if (layerName === 'capes') {
      const capesaboveLayer = document.getElementById('capesabove');

      // Only show capesabove if an above part is explicitly provided
      if (element.dataset.aboveSrc) {
        capesaboveLayer.style.display = "block";
        capesaboveLayer.src = element.dataset.aboveSrc;

        // Apply above-specific transform from HTML
        const aboveScale = element.dataset.aboveScale ?? element.dataset.scale ?? 1;
        const aboveX = element.dataset.aboveX ?? element.dataset.x ?? 0;
        const aboveY = element.dataset.aboveY ?? element.dataset.y ?? 0;

        capesaboveLayer.style.transform = `
          translateX(-50%)
          translate(${aboveX}px, ${aboveY}px)
          scale(${aboveScale})
        `;
      } else {
        // If no above part, ensure the above layer is hidden
        capesaboveLayer.style.display = "none";
        capesaboveLayer.src = "";
      }
    }

    // Handle dual shirt system
    if (layerName === 'shirts' || layerName === 'outfits') {
      const shirtsaboveLayer = document.getElementById('shirtsabove');
      if (shirtsaboveLayer) {
        // Don't render hand layer for shirt52 (ghost costume)
        if (element.dataset.aboveSrc && !(src && src.includes('shirt52')) && !((element.dataset.frames && element.dataset.frames.includes('shirt52')))) {
          shirtsaboveLayer.style.display = "block";
          shirtsaboveLayer.src = element.dataset.aboveSrc;

          const aboveScale = element.dataset.aboveScale ?? 1;
          const aboveX = element.dataset.aboveX ?? 0;
          const aboveY = element.dataset.aboveY ?? 0;

          shirtsaboveLayer.style.transform = `
                  translateX(-50%)
                  translate(${aboveX}px, ${aboveY}px)
                  scale(${aboveScale})
              `;
        } else {
          // Clear shirtsabove if new shirt doesn't have hand
          shirtsaboveLayer.style.display = "none";
          shirtsaboveLayer.src = "";
        }
      }

      // Handle shirtstop layer (like shirt3's above3.png)
      const shirtstopLayer = document.getElementById('shirtstop');
      if (shirtstopLayer) {
        if (element.dataset.topSrc) {
          shirtstopLayer.style.display = "block";
          shirtstopLayer.src = element.dataset.topSrc;

          const topScale = element.dataset.topScale ?? 1;
          const topX = element.dataset.topX ?? 0;
          const topY = element.dataset.topY ?? 0;

          shirtstopLayer.style.transform = `
                  translateX(-50%)
                  translate(${topX}px, ${topY}px)
                  scale(${topScale})
              `;
        } else {
          // Clear shirtstop if new shirt doesn't have topSrc
          shirtstopLayer.style.display = "none";
          shirtstopLayer.src = "";
        }
      }

      // Handle shirtsbehind layer (for dufflejacket hoods behind head)
      const shirtsbehindLayer = document.getElementById('shirtsbehind');
      if (shirtsbehindLayer) {
        if (element.dataset.behindSrc) {
          shirtsbehindLayer.style.display = "block";
          shirtsbehindLayer.src = element.dataset.behindSrc;

          const behindScale = element.dataset.behindScale ?? 1;
          const behindX = element.dataset.behindX ?? 0;
          const behindY = element.dataset.behindY ?? 0;

          shirtsbehindLayer.style.transform = `
                  translateX(-50%)
                  translate(${behindX}px, ${behindY}px)
                  scale(${behindScale})
              `;
        } else {
          // Clear shirtsbehind if new shirt doesn't have behindSrc
          shirtsbehindLayer.style.display = "none";
          shirtsbehindLayer.src = "";
        }
      }

      // Handle headgear for outfits (like reaper hood) using dedicated above-layer
      const headgearsAboveLayer = document.getElementById('headgearsabove');
      if (headgearsAboveLayer) {
        if (element.dataset.headgearSrc) {
          headgearsAboveLayer.style.display = "block";
          headgearsAboveLayer.src = element.dataset.headgearSrc;

          const headgearScale = element.dataset.headgearScale ?? 1;
          const headgearX = element.dataset.headgearX ?? 0;
          const headgearY = element.dataset.headgearY ?? 0;

          headgearsAboveLayer.style.transform = `
                  translateX(-50%)
                  translate(${headgearX}px, ${headgearY}px)
                  scale(${headgearScale})
              `;
        } else if (layerName === 'shirts' || layerName === 'outfits') {
          // Clear headgearsabove if new shirt/outfit doesn't have headgear
          headgearsAboveLayer.style.display = "none";
          headgearsAboveLayer.src = "";
        }
      }

      // Handle dual leg system for outfits (like nutcracker shoes)
      if (element.dataset.legSrc) {
        const outfitShoesLayer = document.getElementById('outfitshoes');
        const outfitRightShoeLayer = document.getElementById('outfitrightshoe');
        const carsLayer = document.getElementById('cars');
        const carIsSkate = carsLayer && carsLayer.src && (carsLayer.src.includes('skate.png') || carsLayer.src.includes('dcirc.png') || carsLayer.src.includes('circ.png'));
        const carIsEquipped = carsLayer && carsLayer.style.display === 'block' && !carIsSkate;

        if (outfitShoesLayer) {
          outfitShoesLayer.style.display = carIsEquipped ? "none" : "block";
          outfitShoesLayer.src = element.dataset.legSrc;

          const legScale = element.dataset.legScale ?? 0.82;
          const legX = element.dataset.legX ?? -50;
          const legY = element.dataset.legY ?? 218;

          outfitShoesLayer.style.transform = `
                  translateX(-50%)
                  translate(${legX}px, ${legY}px)
                  scale(${legScale})
              `;
        }

        if (outfitRightShoeLayer) {
          outfitRightShoeLayer.style.display = carIsEquipped ? "none" : "block";
          const rightLegSrc = element.dataset.rightLegSrc || element.dataset.legSrc;
          outfitRightShoeLayer.src = rightLegSrc;

          const rightLegScale = element.dataset.rightLegScale ?? element.dataset.legScale ?? 0.82;
          const rightLegX = element.dataset.rightLegX ?? 50;
          const rightLegY = element.dataset.rightLegY ?? element.dataset.legY ?? 218;

          outfitRightShoeLayer.style.transform = `
                  translateX(-50%)
                  translate(${rightLegX}px, ${rightLegY}px)
                  scale(${rightLegScale})
              `;
        }
      }
    }

    // Handle dual shoes system
    if (layerName === 'shoes') {
      const rightShoeLayer = document.getElementById('rightshoe');
      if (rightShoeLayer) {
        rightShoeLayer.style.display = "block";
        // Choose right shoe src, preferring invis-specific right src when invis is active
        const rightSrc = (isInvisSkinActive() && element.dataset.invisRightSrc) ? element.dataset.invisRightSrc : (element.dataset.rightSrc || actualSrc || src);
        rightShoeLayer.src = rightSrc;

        // Determine right shoe transform values, preferring invis-specific dataset when invis is active
        const rightScale = isInvisSkinActive()
          ? (element.dataset.invisRightScale ?? element.dataset.invisScale ?? element.dataset.rightScale ?? element.dataset.scale ?? 1)
          : (element.dataset.rightScale ?? element.dataset.scale ?? 1);

        const rightX = isInvisSkinActive()
          ? (element.dataset.invisRightX ?? element.dataset.invisX ?? element.dataset.rightX ?? element.dataset.x ?? 0)
          : (element.dataset.rightX ?? element.dataset.x ?? 0);

        const rightY = isInvisSkinActive()
          ? (element.dataset.invisRightY ?? element.dataset.invisY ?? element.dataset.rightY ?? element.dataset.y ?? 0)
          : (element.dataset.rightY ?? element.dataset.y ?? 0);

        rightShoeLayer.style.transform = `
          translateX(-50%)
          translate(${Math.round(rightX)}px, ${Math.round(rightY)}px)
          scale(${rightScale})
        `;
      }
    }
  }

  addToInventory({
    type: element.dataset.layer,
    src: element.dataset.animated === 'true' ? element.dataset.frames : element.dataset.src,
    icon: element.querySelector("img")?.src,
    menuElement: element
  });

  // Use actualScale/actualX/actualY if they were set (for invis variant), otherwise use dataset values
  const scale = ((layerName === 'shirts' || layerName === 'shoes' || layerName === 'pants') && typeof actualScale !== 'undefined') ? actualScale : (element.dataset.scale ?? 1);
  const x = ((layerName === 'shirts' || layerName === 'shoes' || layerName === 'pants') && typeof actualX !== 'undefined') ? actualX : (element.dataset.x ?? 0);
  const y = ((layerName === 'shirts' || layerName === 'shoes' || layerName === 'pants') && typeof actualY !== 'undefined') ? actualY : (element.dataset.y ?? 0);

  const finalX = Math.round(x);
  const finalY = Math.round(y);

  const rotation = element.dataset.rotation ?? 0;

  layer.style.transform = `
    translateX(-50%)
    translate(${finalX}px, ${finalY}px)
    scale(${scale})
    rotate(${rotation}deg)
  `;

  // Mutual Exclusivity: Clear EQUIPPED class from BOTH submenus for shirts and outfits
  if (layerName === 'shirts' || layerName === 'outfits') {
    document.querySelectorAll('#shirtsMenu li, #outfitsMenu li').forEach(li => {
      li.classList.remove('equipped');
    });
  } else {
    const submenu = element.closest(".submenu");
    if (submenu) {
      submenu.querySelectorAll("li")
        .forEach(li => li.classList.remove("equipped"));
    }
  }

  element.classList.add("equipped");
  // If equipping a headgear, ensure the headgears layer is explicitly set
  if (layerName === 'headgears') {
    const headgearsLayer = document.getElementById('headgears');
    if (headgearsLayer) {
      headgearsLayer.style.display = 'block';
      headgearsLayer.src = element.dataset.src || '';
      const headgearScale = element.dataset.scale ?? 1;
      const headgearX = element.dataset.x ?? 0;
      const headgearY = element.dataset.y ?? 0;
      headgearsLayer.style.transform = `
        translateX(-50%)
        translate(${headgearX}px, ${headgearY}px)
        scale(${headgearScale})
      `;
      // Make sure head is visible when placing a headgear (UNLESS ghost outfit is on)
      const headLayer = document.getElementById('head');
      if (headLayer && !isGhostOutfitActive()) {
        headLayer.style.display = 'block';
      }
    }
  }

  // Sync state classes (like ghost-active) based on current equipment
  isGhostOutfitActive();

  saveState();
  enforceLayerOrder();
  overrideLayerOrder();

  // Custom Skate Logic (Z-Index only - asset swap handled by syncBodyParts)
  // Must be after overrideLayerOrder to persist zIndex
  if (layerName === 'cars') {
    const carsLayer = document.getElementById('cars');
    if (src.includes('skate.png') || src.includes('dcirc.png') || src.includes('circ.png')) {
      if (carsLayer) carsLayer.style.zIndex = 1;
    }
  }

  // Handle Arm Rotation and Positioning (and sync sleeves)
  // Replaced inline logic with helper call to ensure it runs for all updates
  applyArmRotation();

  // Refresh inventory UI so equipped items are highlighted
  try { renderInventory(); } catch (e) { /* ignore if renderInventory not ready */ }
  syncBodyParts();

  // Myth Cape Rainbow Logic Overlay
  if (layerName === 'capes') {
    if (src && src.includes('cape24')) {
      layer.classList.add('rainbow-overlay-active');
      ensureGlobalRainbowRunning();
    } else {
      layer.classList.remove('rainbow-overlay-active');
    }
  }

  // Re-apply equipped filter if active to keep the list updated
  if (isFilterEquippedActive && typeof applyEquippedFilter === 'function') {
    applyEquippedFilter();
  }

  // Sync back sleeves and hand duplications
  syncBackShirtsabove();
  duplicateHandItemToBack();
}

function equipHat(imagePath, element) {
  // === DARK / NORMAL JESTER AUTO-UNEQUIP ===
  if (isDarkJesterActive() || isNormalJesterActive()) {
    const tanSkinBtn = document.querySelector('#specialsMenu li[data-skin-color="#d49e7a"]');
    if (tanSkinBtn) equipSkinColor(tanSkinBtn, '#d49e7a');
  }

  const hat = document.getElementById("hat");
  const isAnimated = element.dataset.animated === "true";

  // Check if same hat is equipped
  let isSameHat = false;
  if (isAnimated && element.dataset.frames) {
    const framesPath = element.dataset.frames.replace(/\/$/, '');
    if (hat.src && hat.src.includes(framesPath)) {
      isSameHat = true;
    }
  } else {
    if (hat.src && hat.src.includes(imagePath)) {
      isSameHat = true;
    }
  }

  // Toggle off Ghost Outfit if it's active and we are EQUIPPING a new hat
  if (!isSameHat && isGhostOutfitActive()) {
    const ghostMenuItem = document.querySelector('[data-layer="outfits"][data-frames*="shirt52"].equipped') ||
      document.querySelector('[data-layer="shirts"][data-frames*="shirt52"].equipped');
    if (ghostMenuItem) {
      equipItem(ghostMenuItem);
    }
  }

  // Check if reaper outfit (shirt63/shirt76) is currently equipped - unequip it first
  const shirtsLayer = document.getElementById('shirts');
  const reaperMenuItem = document.querySelector('[data-layer="outfits"][data-src*="shirt63"].equipped') ||
    document.querySelector('[data-layer="outfits"][data-src*="shirt76"].equipped');
  const isReaperEquipped = shirtsLayer && shirtsLayer.style.display === 'block' && reaperMenuItem;

  if (isReaperEquipped) {
    shirtsLayer.style.display = 'none';
    stopAnimation(shirtsLayer);
    shirtsLayer.src = '';

    // Clear shirt-related layers including headgears and headgearsabove
    const shirtsaboveLayer = document.getElementById('shirtsabove');
    const shirtstopLayer = document.getElementById('shirtstop');
    const shirtsbehindLayer = document.getElementById('shirtsbehind');
    const headgearsLayer = document.getElementById('headgears');
    const headgearsAboveLayer = document.getElementById('headgearsabove');
    if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
    if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
    if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }
    if (headgearsLayer) { headgearsLayer.style.display = 'none'; headgearsLayer.src = ''; }
    if (headgearsAboveLayer) { headgearsAboveLayer.style.display = 'none'; headgearsAboveLayer.src = ''; }

    // Restore all body parts
    const bodyLayer = document.getElementById('body');
    const armLayer = document.getElementById('arm');
    const headLayer = document.getElementById('head');
    const feetLayer = document.getElementById('feet');
    const legLayer = document.getElementById('leg');
    const pupilLayer = document.getElementById('pupil');
    const baseLayer = document.getElementById('base');

    const isInvis = isInvisSkinActive();
    const opac = isInvis ? '0' : '1';

    if (bodyLayer) { bodyLayer.style.display = 'block'; bodyLayer.style.opacity = opac; }
    if (armLayer) { armLayer.style.display = 'block'; armLayer.style.opacity = opac; }
    if (baseLayer) {
      baseLayer.style.display = 'block';
      baseLayer.style.opacity = isInvis ? '0' : '1';
      baseLayer.src = isInvis ? "base.png" : "specials/base.png";
    }
    if (headLayer) {
      headLayer.style.display = 'block';
      if (isInvis) {
        const equippedEye = document.querySelector('#eyesMenu li.equipped');
        const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';
        headLayer.style.opacity = (equippedEye && !isEyeException(eyeSrc)) ? '0' : '1';
      } else {
        headLayer.style.opacity = '1';
      }
    }
    if (feetLayer) { feetLayer.style.display = 'block'; feetLayer.style.opacity = opac; }
    if (legLayer) { legLayer.style.display = 'block'; legLayer.style.opacity = opac; }
    if (pupilLayer) {
      pupilLayer.style.display = 'block';
      if (isInvis) {
        pupilLayer.style.display = 'none';
        pupilLayer.style.opacity = '0';
      } else {
        pupilLayer.style.opacity = '1';
      }
    }

    // Remove equipped class from reaper outfit
    if (reaperMenuItem) {
      reaperMenuItem.classList.remove('equipped');
    }
    syncHeadSprite();
  }

  // Check if shirt 52 is currently equipped - unequip it first
  const shirt52MenuItem = document.querySelector('[data-layer="outfits"][data-frames*="shirt52"]') || document.querySelector('[data-layer="shirts"][data-frames*="shirt52"]');
  const isShirt52Equipped = shirtsLayer && shirtsLayer.style.display === 'block' &&
    shirt52MenuItem && shirt52MenuItem.classList.contains('equipped');

  if (isShirt52Equipped) {
    shirtsLayer.style.display = 'none';
    stopAnimation(shirtsLayer);
    shirtsLayer.src = '';

    // Clear shirt-related layers
    const shirtsaboveLayer = document.getElementById('shirtsabove');
    const shirtstopLayer = document.getElementById('shirtstop');
    const shirtsbehindLayer = document.getElementById('shirtsbehind');
    if (shirtsaboveLayer) { shirtsaboveLayer.style.display = 'none'; shirtsaboveLayer.src = ''; }
    if (shirtstopLayer) { shirtstopLayer.style.display = 'none'; shirtstopLayer.src = ''; }
    if (shirtsbehindLayer) { shirtsbehindLayer.style.display = 'none'; shirtsbehindLayer.src = ''; }

    // Sync body parts
    syncBodyParts();
  }

  if (isSameHat) {
    hat.style.display = "none";
    stopAnimation(hat);
    hat.src = "";
    element.classList.remove("equipped");

    // === SELECTIVE UNEQUIP CLEANUP ===
    if (element.dataset.headgearSrc) {
      const habove = document.getElementById('headgearsabove');
      if (habove) { habove.style.display = 'none'; habove.src = ''; }
    }
    // ===============================

    // sync state based on what's still equipped
    syncBodyParts();
    syncHeadSprite();
    renderInventory();
    isGhostOutfitActive();
    applyArmRotation();

    saveState();
    return;
  }

  hat.style.display = "block";
  if (isAnimated) {
    startAnimation(hat, {
      framesPath: element.dataset.frames,
      frameCount: Number(element.dataset.frameCount),
      fps: Number(element.dataset.fps) || 8
    });
  } else {
    stopAnimation(hat);
    hat.src = imagePath;
  }

  addToInventory({
    type: "hat",
    src: isAnimated ? element.dataset.frames : imagePath,
    icon: element.querySelector("img")?.src,
    menuElement: element
  });

  const scale = element.dataset.scale ?? 1;
  const x = element.dataset.x ?? 0;
  const y = element.dataset.y ?? 0;

  hat.style.transform = `
    translateX(-50%)
    translate(${x}px, ${y}px)
    scale(${scale})
  `;

  element.closest(".submenu").querySelectorAll("li")
    .forEach(li => li.classList.remove("equipped"));

  element.classList.add("equipped");

  // Refresh inventory UI so hat-equipped slots highlight immediately
  try { renderInventory(); } catch (e) { }

  // Sync state classes (like ghost-active) based on current equipment
  isGhostOutfitActive();

  saveState();
  enforceLayerOrder();
  overrideLayerOrder();
  syncBodyParts();
}

document.querySelectorAll(".submenu").forEach(submenu => {
  submenu.addEventListener("click", e => {
    const li = e.target.closest("li");
    if (!li) return;

    if (li.dataset.layer) equipItem(li);
    if (li.dataset.hat) equipHat(li.dataset.hat, li);
  });
});

// ==================== PLATFORM MANAGEMENT ====================
window.setPlatform = function (platformSrc, skipSave = false) {
  const layer = document.getElementById('platforms');
  if (!layer) return;

  console.log('--- setPlatform CALLED ---', platformSrc);

  layer.style.display = 'block';
  layer.src = platformSrc;
  layer.dataset.originalSrc = platformSrc; // Force clean path storage for saveState

  // IMPORTANT: Re-apply transforms (scale, position)
  // These are usually defined in index.html on the img tags
  const menuElement = findMenuElementBySrc('platforms', platformSrc);
  const scale = menuElement ? (menuElement.dataset.scale || 10) : 10;
  const x = menuElement ? (menuElement.dataset.x || -15) : -15;
  const y = menuElement ? (menuElement.dataset.y || 469) : 469;
  layer.style.transform = `translateX(-50%) translate(${x}px, ${y}px) scale(${scale})`;

  // Sync shadow (center platform shadow)
  const shadow = document.getElementById('platform-shadow');
  if (shadow) {
    shadow.src = platformSrc;
    shadow.style.display = 'block';
    // Offset the shadow well below the platform to match extender shadow distance
    const sx = parseFloat(x) + 1;
    const sy = parseFloat(y) + 45;
    shadow.style.transform = `translateX(-50%) translate(${sx}px, ${sy}px) scale(${scale})`;
  }

  // Sync extenders
  const left = document.getElementById('platform-left');
  const right = document.getElementById('platform-right');
  if (left) {
    left.style.backgroundImage = `url(${platformSrc})`;
    left.style.display = 'block';
  }
  if (right) {
    right.style.backgroundImage = `url(${platformSrc})`;
    right.style.display = 'block';
  }

  // Sync shadow extenders
  const shadowLeft = document.getElementById('platform-shadow-left');
  const shadowRight = document.getElementById('platform-shadow-right');
  if (shadowLeft) {
    shadowLeft.style.backgroundImage = `url(${platformSrc})`;
    shadowLeft.style.display = 'block';
  }
  if (shadowRight) {
    shadowRight.style.backgroundImage = `url(${platformSrc})`;
    shadowRight.style.display = 'block';
  }

  // Update UI indicators
  document.querySelectorAll('[data-layer="platforms"]').forEach(el => {
    const dataSrc = el.dataset.src || '';
    if (platformSrc.includes(dataSrc)) {
      el.classList.add('equipped');
    } else {
      el.classList.remove('equipped');
    }
  });

  if (!skipSave) saveState();
};

// Robust mobile Safari/iOS detection
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// ---------------------------------------------------------
// UNEQUIP ALL FUNCTION
// ---------------------------------------------------------
window.unequipAll = function (force = false) {
  if (!force && !confirm('Are you sure you want to remove the set?')) return;

  // Clean up DJC layers
  hideDjcLayers();
  hideNjcLayers();

  // Restore arm to normal positioning (may have been overridden by DJC)
  const armRestore = document.getElementById('arm');
  if (armRestore) {
    armRestore.style.transform = '';
  }

  // Use a transparent placeholder to force Safari to purge the old image from GPU memory
  const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // 1. CLEAR CLOTHING (Optimized for Safari GPU)
  const layersToClear = [
    'hat', 'hair', 'headgears', 'headgearsabove', 'eyes', 'faces',
    'shirts', 'shirtsabove', 'shirtsbehind', 'shirtstop',
    'pants', 'shoes', 'rightshoe', 'outfitshoes', 'outfitrightshoe',
    'hands', 'back-hands', 'capes', 'capesabove', 'wings', 'cars', 'floaties',
    'scarfs', 'backpacks', 'necklaces', 'pets', 'pets-back', 'skin'
  ];

  layersToClear.forEach(layerId => {
    const layer = document.getElementById(layerId);
    if (layer && layer.style.display !== 'none') {
      layer.style.display = 'none';
      stopAnimation(layer);
      layer.src = placeholder;
    }
  });

  // 2. RESTORE BODY (Explicitly force state)
  const isInvisActive = isInvisSkinActive();
  const bodyParts = ['body', 'leg', 'feet', 'pupil', 'arm'];

  bodyParts.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'block';
      el.style.opacity = isInvisActive ? '0' : '1';
    }
  });

  const baseEl = document.getElementById('base');
  const headEl = document.getElementById('head');
  if (baseEl) {
    baseEl.style.display = 'block';
  }
  if (headEl) {
    headEl.style.display = 'block';
  }

  // 3. UI & STATE SYNC
  document.querySelectorAll('.equipped').forEach(el => {
    if (el.dataset.layer !== 'platforms') {
      el.classList.remove('equipped');
    }
  });

  document.querySelectorAll('#specialsMenu li').forEach(el => el.classList.remove('equipped'));
  const normalBaseBtn = document.querySelector('#specialsMenu li[onclick*="equipNormalCharacter"]');
  const invisBaseBtn = document.querySelector('#specialsMenu li[onclick*="equipInvisCharacter"]');

  const isRobot = isRobotSkinActive();
  const isDracula = isDraculaSkinActive();

  if (isInvisActive) {
    document.querySelectorAll('#specialsMenu li').forEach(el => el.classList.remove('equipped'));
    if (invisBaseBtn) invisBaseBtn.classList.add('equipped');
  } else if (isRobot) {
    document.querySelectorAll('#specialsMenu li').forEach(el => el.classList.remove('equipped'));
    const robotBtn = document.getElementById('robotSkinBtn');
    if (robotBtn) robotBtn.classList.add('equipped');
  } else if (isDracula) {
    document.querySelectorAll('#specialsMenu li').forEach(el => el.classList.remove('equipped'));
    const draculaBtn = document.getElementById('draculaSkinBtn');
    if (draculaBtn) draculaBtn.classList.add('equipped');
  } else {
    document.querySelectorAll('#specialsMenu li').forEach(el => el.classList.remove('equipped'));
    if (normalBaseBtn) normalBaseBtn.classList.add('equipped');
  }

  // 4. CLEAR GHOST STATE
  document.body.classList.remove('ghost-active');

  // 5. FINAL SYNC (Crucial: Run after state/classes are updated)
  syncBodyParts();
  if (typeof applyArmRotation === 'function') applyArmRotation();
  if (typeof renderInventory === 'function') renderInventory();

  saveState();
}
window.isMobileSafari = function () {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isAndroidMobile = /Android/.test(ua) && /Mobile/.test(ua);
  const isSafariMobile = /Safari/.test(ua) && /Mobile/.test(ua);
  return isIOS || isAndroidMobile || isSafariMobile;
};

// Generate pixel-perfect platform for mobile
window.generatePlatformImage = function (src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = function () {
      const tileWidth = img.naturalWidth || 32;
      const tileHeight = img.naturalHeight || 32;
      const scale = 8;
      const scaledTileWidth = tileWidth * scale;
      const scaledTileHeight = tileHeight * scale;

      const numTiles = Math.floor(4096 / scaledTileWidth);
      const canvasWidth = numTiles * scaledTileWidth;
      const canvasHeight = scaledTileHeight;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.mozImageSmoothingEnabled = false;
      ctx.webkitImageSmoothingEnabled = false;
      ctx.msImageSmoothingEnabled = false;

      for (let i = 0; i < numTiles; i++) {
        ctx.drawImage(img, i * scaledTileWidth, 0, scaledTileWidth, scaledTileHeight);
      }

      try {
        const dataUrl = canvas.toDataURL("image/png");
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = function () {
      reject(new Error("Failed to load platform image: " + src));
    };

    img.src = src;
  });
};

/* OLD PLATFORM FUNCTIONS REMOVED */

/* INITIALIZATION REMOVED */


// ==================== BACKGROUND MANAGEMENT ====================
window.setBackground = function (src, skipSave = false) {
  const body = document.body;
  const html = document.documentElement;

  body.style.backgroundImage = `url("${src}")`;

  // Determine background color and settings based on theme
  let bgColor = "#000"; // default black
  let themeColor = "#ffffff"; // default white for borders

  if (src.includes("bg_tile")) {
    body.style.backgroundRepeat = "repeat";
    body.style.backgroundSize = "86px 86px";
    body.style.backgroundPosition = "top left";
    bgColor = "#000"; // black for default tile
    themeColor = "#ffffff";
  } else if (src.includes("bg2")) {
    body.style.backgroundRepeat = "no-repeat";
    body.style.backgroundSize = "cover";
    body.style.backgroundPosition = "center";
    bgColor = "#1a1a2e"; // dark blue/black for bg2
    themeColor = "#ffd700";
  } else if (src.includes("bg3")) {
    body.style.backgroundRepeat = "no-repeat";
    body.style.backgroundSize = "cover";
    body.style.backgroundPosition = "center";
    bgColor = "#0a0a1a"; // very dark blue for bg3
    themeColor = "#87ceeb";
  } else if (src.includes("bg4")) {
    body.style.backgroundRepeat = "no-repeat";
    body.style.backgroundSize = "cover";
    body.style.backgroundPosition = "center";
    bgColor = "#1a0a1a"; // dark purple/pink for bg4
    themeColor = "#ff69b4";
  } else if (src.includes("bg5")) {
    body.style.backgroundRepeat = "no-repeat";
    body.style.backgroundSize = "cover";
    body.style.backgroundPosition = "center";
    bgColor = "#0a1a0a"; // dark green for bg5
    themeColor = "#98fb98";
  }

  // Set background color for html and body to fill sides
  html.style.backgroundColor = bgColor;
  body.style.backgroundColor = bgColor;

  // Set theme border color
  const root = document.documentElement;
  root.style.setProperty("--theme-border-color", themeColor);

  // Update UI indicators for backgrounds
  document.querySelectorAll('.bg-menu-drawer img').forEach(el => {
    if (el.src === src || (el.onclick && el.onclick.toString().includes(src))) {
      el.classList.add('equipped');
    } else {
      el.classList.remove('equipped');
    }
  });

  if (!skipSave) {
    saveState();
  }
}

function enforceLayerOrder() {
  const wrapper = document.querySelector(".base-wrapper");

  const order = [
    "platforms",
    "wings",
    "back-arm",
    "back-shirtsabove",
    "back-hands",
    "pets-back",
    "capes",
    "shirtsbehind",
    "base",
    "djc-left-leg",
    "njc-left-leg",
    "djc-right-leg",
    "njc-right-leg",
    "djc-right-arm",
    "njc-right-arm",
    "body",
    "djc-body",
    "njc-body",
    "leg",
    "feet",
    "head",
    "djc-head",
    "njc-head",
    "shirts",
    "shoes",
    "rightshoe",
    "pants",
    "pupil",
    "eyes",
    "hair",
    "capesabove",
    "hat",
    "faces",
    "headgears",
    "headgearsabove",
    "cars",
    "hands",
    "arm",
    "shirtsabove",
    "shirtstop",
    "floaties",
    "scarfs",
    "pets"
  ];

  order.forEach(id => {
    const el = document.getElementById(id);
    if (el) wrapper.appendChild(el);
  });
}

function overrideLayerOrder() {
  // Custom layering override: Align with CSS values
  const customOrder = {
    'platforms': { z: 1, order: -1 },
    'base': { z: 10, order: 0 },
    'body': { z: 11, order: 1 },
    'diaperbody': { z: 12, order: 1.5 },
    'leg': { z: 11, order: 2 },
    'diaperleg': { z: 12, order: 2.5 },
    'feet': { z: 11, order: 3 },
    'outfitshoes': { z: 11, order: 3.1 },
    'outfitrightshoe': { z: 11, order: 3.2 },
    'shoes': { z: 11, order: 3.3 },
    'rightshoe': { z: 11, order: 3.4 },
    'head': { z: 19, order: 4 },
    'shirts': { z: 22, order: 5 },
    'eyes': { z: 23, order: 6 },
    'pupil': { z: 20, order: 4.5 },
    'pants': { z: 25, order: 10 },
    'hair': { z: 26, order: 11 },
    'capesabove': { z: 28, order: 12 },
    'hat': { z: 27, order: 12 },
    'faces': { z: 29, order: 13 },
    'headgears': { z: 30, order: 14 },
    'headgearsabove': { z: 31, order: 15 },
    'floaties': { z: 39, order: 13 },
    'cars': { z: 40, order: 14 },
    'hands': { z: 49, order: 17 },
    'arm': { z: 50, order: 18 },
    'shirtsabove': { z: 51, order: 19 },
    'shirtstop': { z: 48, order: 16.5 },
    'pets': { z: 60, order: 21 },
    'shirtsbehind': { z: 2, order: 23 },
    'pets-back': { z: 1, order: 24 },
    'capes': { z: 1, order: 25 },
    'back-arm': { z: 10, order: -0.5 },
    'djc-right-arm': { z: 10, order: -0.5 },
    'njc-right-arm': { z: 10, order: -0.5 },
    'back-shirtsabove': { z: 11, order: -0.4 },
    'back-hands': { z: 11, order: -0.3 }
  };

  Object.entries(customOrder).forEach(([id, config]) => {
    const el = document.getElementById(id);
    if (el) {
      let finalZ = config.z;

      // SPECIAL OVERRIDE: Only Halloween Villain Knives (hand32) or Shiny Hammer (shiny_hammer) should be above arm (50) and sleeves (51, 52)
      if (id === 'hands') {
        if (el.src && (el.src.includes('hand32') || el.src.includes('shiny_hammer'))) {
          finalZ = 53;
        } else {
          finalZ = 49;
        }
      }

      // SPECIAL OVERRIDE: Skater items should be behind body
      if (id === 'cars') {
        if (el.src && (el.src.includes('skate.png') || el.src.includes('dcirc.png') || el.src.includes('circ.png'))) {
          finalZ = 1;
        }
      }

      el.style.zIndex = finalZ;
      console.log(`Set ${id} z-index to ${finalZ}`);
    }
  });
}
// Helper to get rotation/scale matrix from element
function getTransform(el) {
  const style = window.getComputedStyle(el);
  const transform = style.transform || style.webkitTransform || 'none';
  if (transform === 'none') {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  const matrix = transform.match(/^matrix\((.+)\)$/);
  if (matrix) {
    const values = matrix[1].split(',').map(parseFloat);
    return {
      a: values[0], b: values[1], c: values[2], d: values[3],
      e: values[4], f: values[5]
    };
  }
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

window.downloadFile = async function (dataUrlOrJsonText, filename, mimeType) {
  // 1. Try Capacitor (for native APK/Android app wrapper)
  if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    try {
      const fs = window.Capacitor.Plugins.Filesystem;
      const share = window.Capacitor.Plugins.Share;
      if (fs && share) {
        let base64Data = '';
        if (dataUrlOrJsonText.startsWith('data:')) {
          base64Data = dataUrlOrJsonText.split(',')[1];
        } else {
          // Convert text data (JSON) to base64 safely
          base64Data = btoa(unescape(encodeURIComponent(dataUrlOrJsonText)));
        }

        // Write the file to the app's CACHE directory (requires no runtime permission)
        const writeResult = await fs.writeFile({
          path: filename,
          data: base64Data,
          directory: 'CACHE'
        });

        // Open the native system share dialog so user can save/send it
        await share.share({
          title: filename,
          url: writeResult.uri
        });
        return; // Success!
      }
    } catch (e) {
      console.warn('Capacitor native share/save failed, falling back to other methods:', e);
    }
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.Capacitor;
  // 2. Try native web share (if available in a standard mobile browser)
  if (isMobile && navigator.share) {
    try {
      let file;
      if (dataUrlOrJsonText.startsWith('data:')) {
        const blob = await (await fetch(dataUrlOrJsonText)).blob();
        file = new File([blob], filename, { type: mimeType || 'image/png' });
      } else {
        const blob = new Blob([dataUrlOrJsonText], { type: mimeType || 'application/json' });
        file = new File([blob], filename, { type: mimeType || 'application/json' });
      }
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: `Exported ${filename}`
        });
        return;
      }
    } catch (e) {
      console.warn('Web share failed, falling back to browser download:', e);
    }
  }

  // 3. Fallback: Browser download
  try {
    const link = document.createElement('a');
    if (dataUrlOrJsonText.startsWith('data:')) {
      link.href = dataUrlOrJsonText;
    } else {
      const blob = new Blob([dataUrlOrJsonText], { type: mimeType || 'text/plain' });
      link.href = URL.createObjectURL(blob);
    }
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (!dataUrlOrJsonText.startsWith('data:')) {
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    }
  } catch (e) {
    alert('Failed to download or save file. Please check app permissions or try a different browser.');
    console.error('All download methods failed:', e);
  }
};

window.downloadSet = async function () {
  const bgModeOption = document.querySelector('[data-group="bgMode"].active');
  const mode = bgModeOption ? bgModeOption.dataset.value : 'transparent';
  const includePlatform = document.querySelector('[data-toggle="platform"]').classList.contains('active');
  const includeStats = document.querySelector('[data-toggle="stats"]').classList.contains('active');
  const characterScene = document.querySelector('.character-scene');

  if (!characterScene) {
    alert('Character not found!');
    return;
  }

  try {
    // Get all visible character layers in z-index order
    const layers = [
      'platforms', 'back-arm', 'back-shirtsabove', 'back-hands', 'pets-back', 'base', 'body', 'diaperbody', 'leg', 'diaperleg', 'feet', 'arm', 'pants', 'shirtsbehind', 'shirtstop',
      'head', 'pupil', 'shoes', 'rightshoe', 'outfitshoes', 'outfitrightshoe', 'shirts', 'eyes', 'hair', 'faces', 'hands',
      'shirtsabove', 'capesabove', 'headgears', 'headgearsabove', 'hat', 'capes', 'wings', 'cars', 'floaties',
      'scarfs', 'pets'
    ];
    const visibleImages = [];

    const shirtsLayer = document.getElementById('shirts');
    // Check if Ghost Outfit (shirt52) is equipped (check src or frames path)
    const isGhostOutfit = shirtsLayer && (
      (shirtsLayer.src && shirtsLayer.src.includes('shirt52')) ||
      (activeAnimations && activeAnimations['shirts'] && activeAnimations['shirts'].framesPath && activeAnimations['shirts'].framesPath.includes('shirt52'))
    );

    layers.forEach(layerId => {
      // Respect the platform toggle
      if (layerId === 'platforms' && !includePlatform) return;

      // Force exclude body parts if Ghost Outfit is equipped
      if (isGhostOutfit && ['head', 'arm', 'leg', 'feet', 'pupil', 'body', 'base'].includes(layerId)) {
        return;
      }

      const img = document.getElementById(layerId);
      // Check if element exists and has src
      if (img && img.src) {
        // Check both inline style and computed style for display
        const computedStyle = window.getComputedStyle(img);
        const isHidden = img.style.display === 'none' || computedStyle.display === 'none';

        if (!isHidden) {
          // Get computed z-index for proper layering
          const zIndex = parseInt(computedStyle.zIndex) || 0;
          const opacity = computedStyle.opacity !== '' ? parseFloat(computedStyle.opacity) : 1;

          visibleImages.push({
            element: img,
            src: img.src,
            zIndex: zIndex,
            opacity: opacity
          });
        }
      }
    });

    if (visibleImages.length === 0) {
      alert('No character parts to download!');
      return;
    }

    // Sort by z-index to maintain proper layering
    visibleImages.sort((a, b) => a.zIndex - b.zIndex);

    // Load all images
    const loadedImages = [];
    for (const imgData of visibleImages) {
      try {
        const loadedImg = await loadImage(imgData.src);
        loadedImages.push({
          image: loadedImg,
          element: imgData.element,
          opacity: imgData.opacity,
          zIndex: imgData.zIndex
        });
      } catch (error) {
        console.error('Failed to load image:', imgData.src, error);
      }
    }

    // Temporarily reset scene transforms to get accurate coordinate measurements
    const originalTransform = characterScene.style.transform;
    const originalZoom = characterScene.style.zoom;
    characterScene.style.transform = 'none';
    characterScene.style.zoom = '1';

    // Crucial: force multiple reflows and wait for the browser to recalculate everything
    void characterScene.offsetHeight;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const imageData = [];
    const sceneRect = characterScene.getBoundingClientRect();

    for (const item of loadedImages) {
      const rect = item.element.getBoundingClientRect();
      const transform = getTransform(item.element);

      // Center point relative to scene
      const cx = rect.left + rect.width / 2 - sceneRect.left;
      const cy = rect.top + rect.height / 2 - sceneRect.top;

      imageData.push({
        image: item.image,
        minX: rect.left - sceneRect.left,
        minY: rect.top - sceneRect.top,
        maxX: rect.right - sceneRect.left,
        maxY: rect.bottom - sceneRect.top,
        cx: cx,
        cy: cy,
        opacity: item.opacity,
        transform: transform,
        w: item.element.offsetWidth,
        h: item.element.offsetHeight,
        id: item.element.id
      });
    }


    // Calculate bounds.
    // For width (X), constrain to character/items only (ignoring wide platforms), with side padding.
    // For height (Y), include everything (so we see the full platform thickness/height).

    let allMinY = Math.min(...imageData.map(i => i.minY));
    let allMaxY = Math.max(...imageData.map(i => i.maxY));
    let allMinX, allMaxX;

    const nonPlatformItems = imageData.filter(i => i.id !== 'platforms' && i.id !== 'backgrounds');

    // Include Stats in measurement if enabled
    if (includeStats) {
      ['player-name', 'player-level', 'player-badge'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.style.display !== 'none' && window.getComputedStyle(el).display !== 'none') {
          const rect = el.getBoundingClientRect();
          const relMinX = rect.left - sceneRect.left;
          const relMinY = rect.top - sceneRect.top;
          const relMaxX = rect.right - sceneRect.left;
          const relMaxY = rect.bottom - sceneRect.top;

          allMinY = Math.min(allMinY, relMinY);
          allMaxY = Math.max(allMaxY, relMaxY);

          // We also want the canvas width to accommodate the name if it's wider than the character
          imageData.push({
            minX: relMinX,
            maxX: relMaxX,
            minY: relMinY,
            maxY: relMaxY,
            id: id,
            isStatElement: true // Flag to skip drawing in the main loop
          });

          // Refresh nonPlatformItems to include these stats for width calculation
          nonPlatformItems.push(imageData[imageData.length - 1]);
        }
      });
    }

    if (nonPlatformItems.length > 0) {
      // If we have character items or stats, crop width relative to them
      const charMinX = Math.min(...nonPlatformItems.map(i => i.minX));
      const charMaxX = Math.max(...nonPlatformItems.map(i => i.maxX));
      const PADDING_X = 125; // 125px padding on each side for context
      allMinX = charMinX - PADDING_X;
      allMaxX = charMaxX + PADDING_X;
    } else {
      // Only platform is visible, show full width
      allMinX = Math.min(...imageData.map(i => i.minX));
      allMaxX = Math.max(...imageData.map(i => i.maxX));
    }

    // Add vertical padding
    const PADDING_Y = 20;
    allMinY -= PADDING_Y;
    allMaxY += PADDING_Y;

    const width = Math.ceil(allMaxX - allMinX);
    const height = Math.ceil(allMaxY - allMinY);

    if (width <= 0 || height <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Draw background if mode is 'current'
    if (mode === 'current') {
      const bgImage = getComputedStyle(document.body).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const bgUrl = bgImage.replace(/url\(['"]?(.+?)['"]?\)/i, '$1');
        try {
          const bgImg = await loadImage(bgUrl);
          const bgAspect = bgImg.width / bgImg.height;
          const canvasAspect = width / height;
          let drawWidth, drawHeight, drawX, drawY;

          if (canvasAspect > bgAspect) {
            drawWidth = width;
            drawHeight = width / bgAspect;
            drawX = 0;
            drawY = (height - drawHeight) / 2;
          } else {
            drawWidth = height * bgAspect;
            drawHeight = height;
            drawX = (width - drawWidth) / 2;
            drawY = 0;
          }
          ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);
        } catch (e) {
          console.warn('Failed to load background:', e);
        }
      }
    }


    // Draw character layers with rotation
    for (const imgData of imageData) {
      if (imgData.isStatElement) continue; // Drawn later with specialized logic
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = imgData.opacity;

      ctx.save();
      const drawInfoCX = imgData.cx - allMinX;
      const drawInfoCY = imgData.cy - allMinY;

      ctx.translate(drawInfoCX, drawInfoCY);
      const t = imgData.transform;
      ctx.transform(t.a, t.b, t.c, t.d, 0, 0);

      ctx.drawImage(imgData.image, -imgData.w / 2, -imgData.h / 2, imgData.w, imgData.h);
      ctx.restore();

      ctx.globalAlpha = previousAlpha;
    }

    // Draw Player Stats if enabled
    if (includeStats) {
      const playerNameDiv = document.getElementById('player-name');
      const playerLevelImg = document.getElementById('player-level');
      const playerBadgeImg = document.getElementById('player-badge');
      const playerInfoContainer = document.querySelector('.player-info-container');

      if (playerInfoContainer && (playerNameDiv.style.display !== 'none' || playerLevelImg.style.display !== 'none' || playerBadgeImg.style.display !== 'none')) {
        const infoRect = playerInfoContainer.getBoundingClientRect();
        const infoBaseX = infoRect.left - sceneRect.left - allMinX;
        const infoBaseY = infoRect.top - sceneRect.top - allMinY;

        // Draw Badge
        if (playerBadgeImg.style.display !== 'none' && playerBadgeImg.src) {
          const badgeRect = playerBadgeImg.getBoundingClientRect();
          // Recalculate precisely relative to the scene
          const badgeX = (badgeRect.left - sceneRect.left) - allMinX;
          const badgeY = (badgeRect.top - sceneRect.top) - allMinY;
          const bImg = await loadImage(playerBadgeImg.src);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(bImg, badgeX, badgeY, playerBadgeImg.offsetWidth, playerBadgeImg.offsetHeight);
        }

        // Draw Level
        if (playerLevelImg.style.display !== 'none' && playerLevelImg.src) {
          const levelRect = playerLevelImg.getBoundingClientRect();
          const levelX = (levelRect.left - sceneRect.left) - allMinX;
          const levelY = (levelRect.top - sceneRect.top) - allMinY;
          const lImg = await loadImage(playerLevelImg.src);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(lImg, levelX, levelY, playerLevelImg.offsetWidth, playerLevelImg.offsetHeight);
        }

        // Draw Name
        if (playerNameDiv.style.display !== 'none' && playerNameDiv.textContent) {
          const nameRect = playerNameDiv.getBoundingClientRect();
          const nameX = (nameRect.left - sceneRect.left) - allMinX;
          const nameY = (nameRect.top - sceneRect.top) - allMinY + 13; // Shift name down by 13px total ($9 + 4$)

          ctx.save();
          const computedNameStyle = window.getComputedStyle(playerNameDiv);
          ctx.font = `bold ${computedNameStyle.fontSize} "Century Gothic", sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          // Handle Shadows (Manual recreation of text-shadow and filter: drop-shadow)
          // The current style uses: text-shadow: 4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)
          ctx.fillStyle = 'rgba(0, 0, 0, 1)';
          ctx.fillText(playerNameDiv.textContent, nameX + 4, nameY + 6);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
          ctx.fillText(playerNameDiv.textContent, nameX, nameY + 4);

          // Handle Gradients / Colors
          const background = computedNameStyle.background;
          const isRainbow = playerNameDiv.style.animation && playerNameDiv.style.animation.includes('rainbow-fade');

          if (isRainbow) {
            // Replicate current rainbow color (simplified to white-ish for static export if we can't grab precise frame)
            // Or better: try to extract the current color from the element
            ctx.fillStyle = computedNameStyle.color || '#ff0000';
          } else if (background && background.includes('gradient')) {
            // Create linear gradient
            const gradParams = background.match(/linear-gradient\(([^)]+)\)/);
            if (gradParams) {
              const gradient = ctx.createLinearGradient(nameX, nameY, nameX, nameY + nameRect.height);
              // Simple parser for our known gradients
              if (background.includes('#C0C0C0')) { // Diamond
                gradient.addColorStop(0, '#C0C0C0');
                gradient.addColorStop(0.5, '#F0F0F0');
                gradient.addColorStop(1, '#C0C0C0');
              } else if (background.includes('#0c3bf6')) { // Gradient 1
                gradient.addColorStop(0, '#0c3bf6');
                gradient.addColorStop(1, '#fe0065');
              } else if (background.includes('#517dfd')) { // Gradient 2
                gradient.addColorStop(0, '#517dfd');
                gradient.addColorStop(1, '#ff4f96');
              } else if (background.includes('#fefb1d')) { // Gradient 3
                gradient.addColorStop(0, '#fefb1d');
                gradient.addColorStop(0.5, '#fefeda');
                gradient.addColorStop(1, '#fea700');
              }
              ctx.fillStyle = gradient;
            } else {
              ctx.fillStyle = computedNameStyle.color;
            }
          } else {
            ctx.fillStyle = computedNameStyle.color;
          }

          ctx.fillText(playerNameDiv.textContent, nameX, nameY);
          ctx.restore();
        }
      }
    }

    // Download
    const dataUrl = canvas.toDataURL('image/png');
    await window.downloadFile(dataUrl, 'character-set.png', 'image/png');

    window.closeDownloadModal();

    // Restore character scene scale now that all measurements and drawing are done
    characterScene.style.transform = originalTransform;
    characterScene.style.zoom = originalZoom;
  } catch (error) {
    console.error('Download failed:', error);
    alert('Failed to download. Error: ' + error.message);
  }

  try { renderInventory(); } catch (e) { }
  saveState();
}


// Helper function to load images with CORS
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only use anonymous for non-file protocols to avoid local CORS issues
    if (window.location.protocol !== 'file:') {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

window.openDownloadModal = function () {
  document.getElementById("downloadModal").classList.add("show");

  // Setup click handlers for download options
  const options = document.querySelectorAll('.download-option');
  options.forEach(option => {
    option.onclick = function () {
      if (this.dataset.group) {
        // Radio behavior - only one active per group
        const group = this.dataset.group;
        document.querySelectorAll(`[data-group="${group}"]`).forEach(opt => {
          opt.classList.remove('active');
        });
        this.classList.add('active');
      } else if (this.dataset.toggle) {
        // Toggle behavior
        this.classList.toggle('active');
      }
    };
  });
}

window.closeDownloadModal = function () {
  document.getElementById("downloadModal").classList.remove("show");
}

// Re-enforce DOM order
enforceLayerOrder();

// Player Options Functions
window.openPlayerOptionsModal = async function () {
  const modal = document.getElementById("playerOptionsModal");
  modal.classList.add("show");

  // Load levels from levels folder
  const levelGrid = document.getElementById("playerLevelGrid");
  if (levelGrid.children.length === 0) {
    // List of actual level files
    const levelFiles = [
      'spr_level_0.png',
      'spr_level_1.png',
      'spr_level_2.png',
      'spr_level_3.png',
      'spr_level_4.png',
      'spr_level_5.png',
      'spr_level_6.png'
    ];

    levelFiles.forEach(filename => {
      const img = document.createElement('img');
      img.src = `levels/${filename}`;
      img.className = 'player-level-item';
      img.dataset.src = `levels/${filename}`;
      img.onclick = function () {
        // Toggle behavior - can deselect by clicking again
        if (this.classList.contains('selected')) {
          this.classList.remove('selected');
        } else {
          document.querySelectorAll('.player-level-item').forEach(item => {
            item.classList.remove('selected');
          });
          this.classList.add('selected');
        }
      };
      levelGrid.appendChild(img);
    });
  }

  // Load badges from badges folder
  const badgesGrid = document.getElementById("playerBadgesGrid");
  if (badgesGrid.children.length === 0) {
    // List of actual badge files
    const badgeFiles = [
      'spr_badge_staff.png',
      'spr_role_1.png',
      'spr_role_3.png',
      'spr_role_4.png',
      'spr_role_5.png',
      'spr_role_6.png',
      'spr_role_7.png',
      'spr_role_8.png'
    ];

    badgeFiles.forEach(filename => {
      const img = document.createElement('img');
      img.src = `badges/${filename}`;
      img.className = 'player-badge-item';
      img.dataset.src = `badges/${filename}`;
      img.onclick = function () {
        // Single select behavior - same as levels
        if (this.classList.contains('selected')) {
          this.classList.remove('selected');
        } else {
          document.querySelectorAll('.player-badge-item').forEach(item => {
            item.classList.remove('selected');
          });
          this.classList.add('selected');
        }
      };
      badgesGrid.appendChild(img);
    });
  }

  // Setup color selection
  const colorItems = document.querySelectorAll('.player-color-item');
  colorItems.forEach(item => {
    item.onclick = function () {
      // Single select behavior
      if (this.classList.contains('selected')) {
        this.classList.remove('selected');
      } else {
        document.querySelectorAll('.player-color-item').forEach(colorItem => {
          colorItem.classList.remove('selected');
        });
        this.classList.add('selected');
      }
    };
  });

  // Load saved options
  const savedOptions = JSON.parse(localStorage.getItem('playerOptions') || '{}');
  if (savedOptions.name) {
    document.getElementById('playerNameInput').value = savedOptions.name;
  }
  if (savedOptions.level) {
    document.querySelectorAll('.player-level-item').forEach(item => {
      if (item.dataset.src === savedOptions.level) {
        item.classList.add('selected');
      }
    });
  }
  if (savedOptions.badge) {
    document.querySelectorAll('.player-badge-item').forEach(item => {
      if (item.dataset.src === savedOptions.badge) {
        item.classList.add('selected');
      }
    });
  }
  if (savedOptions.color) {
    document.querySelectorAll('.player-color-item').forEach(item => {
      if (item.dataset.color === savedOptions.color) {
        item.classList.add('selected');
      }
    });
  }
}

window.closePlayerOptionsModal = function () {
  document.getElementById("playerOptionsModal").classList.remove("show");
}

window.openSettingsModal = function () {
  document.getElementById("settingsModal").classList.add("show");
}

window.closeSettingsModal = function () {
  document.getElementById("settingsModal").classList.remove("show");
}

window.openRoadmapModal = function () {
  const modal = document.getElementById("roadmapModal");
  modal.style.display = "flex";

  // Trigger entry transition
  const list = modal.querySelector('.roadmap-list');
  if (list) {
    // Small delay to allow display:flex to apply before transition starts
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        list.classList.add('active');
      });
    });
  }
}

window.closeRoadmapModal = function () {
  const modal = document.getElementById("roadmapModal");
  modal.style.display = "none";

  // Reset transition state
  const list = modal.querySelector('.roadmap-list');
  if (list) {
    list.classList.remove('active');
  }
}

window.confirmPlayerOptions = function () {
  const name = document.getElementById('playerNameInput').value.trim();
  const selectedLevel = document.querySelector('.player-level-item.selected');
  const selectedBadge = document.querySelector('.player-badge-item.selected');
  const selectedColor = document.querySelector('.player-color-item.selected');

  // Update display elements
  const playerNameDiv = document.getElementById('player-name');
  const playerLevelImg = document.getElementById('player-level');
  const playerBadgeImg = document.getElementById('player-badge');

  if (name) {
    playerNameDiv.textContent = name;
    playerNameDiv.style.display = 'block';

    // Apply color
    if (selectedColor) {
      const color = selectedColor.dataset.color;
      if (color === 'rainbow') {
        playerNameDiv.style.background = 'none';
        playerNameDiv.style.webkitBackgroundClip = 'unset';
        playerNameDiv.style.backgroundClip = 'unset';
        playerNameDiv.style.webkitTextFillColor = 'unset';
        playerNameDiv.style.color = '#ff0000';
        playerNameDiv.style.animation = 'rainbow-fade 45s linear infinite';
        playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
      } else if (color === 'diamond') {
        playerNameDiv.style.background = 'linear-gradient(135deg, #C0C0C0, #F0F0F0, #C0C0C0)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.animation = 'none';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else if (color === 'gradient1') {
        playerNameDiv.style.background = 'linear-gradient(180deg, #0c3bf6, #fe0065)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.animation = 'none';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else if (color === 'gradient2') {
        playerNameDiv.style.background = 'linear-gradient(180deg, #517dfd, #ff4f96)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.animation = 'none';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else if (color === 'gradient3') {
        playerNameDiv.style.background = 'linear-gradient(180deg, #fefb1d, #fefeda, #fea700)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.animation = 'none';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else {
        const colorMap = {
          'white': '#FFFFFF',
          'blue': '#4A90E2',
          'green': '#50C878',
          'purple': '#9B59B6',
          'pink': '#FF69B4',
          'red': '#d6453b',
          'lightgreen': '#38e231',
          'lightblue': '#2c96eb'
        };
        playerNameDiv.style.color = colorMap[color] || '#FFFFFF';
        playerNameDiv.style.background = 'none';
        playerNameDiv.style.webkitTextFillColor = 'unset';
        playerNameDiv.style.webkitBackgroundClip = 'unset';
        playerNameDiv.style.backgroundClip = 'unset';
        playerNameDiv.style.animation = 'none';
        playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
        playerNameDiv.style.filter = 'none';
      }
    } else {
      playerNameDiv.style.color = 'white';
      playerNameDiv.style.background = 'none';
      playerNameDiv.style.webkitTextFillColor = 'unset';
      playerNameDiv.style.webkitBackgroundClip = 'unset';
      playerNameDiv.style.backgroundClip = 'unset';
      playerNameDiv.style.animation = 'none';
      playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
      playerNameDiv.style.filter = 'none';
    }
  } else {
    playerNameDiv.style.display = 'none';
  }

  if (selectedLevel) {
    playerLevelImg.src = selectedLevel.dataset.src;
    playerLevelImg.style.display = 'block';
  } else {
    playerLevelImg.style.display = 'none';
  }

  if (selectedBadge) {
    playerBadgeImg.src = selectedBadge.dataset.src;
    playerBadgeImg.style.display = 'block';
  } else {
    playerBadgeImg.style.display = 'none';
  }

  // Save to localStorage
  const playerOptions = {
    name: name,
    level: selectedLevel ? selectedLevel.dataset.src : null,
    badge: selectedBadge ? selectedBadge.dataset.src : null,
    color: selectedColor ? selectedColor.dataset.color : 'white'
  };
  localStorage.setItem('playerOptions', JSON.stringify(playerOptions));

  closePlayerOptionsModal();
}

window.resetPlayerOptions = function () {
  // Clear input
  document.getElementById('playerNameInput').value = '';

  // Deselect all items
  document.querySelectorAll('.player-level-item.selected').forEach(item => {
    item.classList.remove('selected');
  });
  document.querySelectorAll('.player-badge-item.selected').forEach(item => {
    item.classList.remove('selected');
  });

  // Hide display elements
  document.getElementById('player-name').style.display = 'none';
  document.getElementById('player-level').style.display = 'none';
  document.getElementById('player-badge').style.display = 'none';

  // Clear from localStorage
  localStorage.removeItem('playerOptions');
}

// Load player options on page load
window.addEventListener('load', function () {
  const savedOptions = JSON.parse(localStorage.getItem('playerOptions') || '{}');

  if (savedOptions.name) {
    const playerNameDiv = document.getElementById('player-name');
    playerNameDiv.textContent = savedOptions.name;
    playerNameDiv.style.display = 'block';

    // Apply saved color
    if (savedOptions.color) {
      const color = savedOptions.color;
      if (color === 'rainbow') {
        playerNameDiv.style.background = 'none';
        playerNameDiv.style.webkitBackgroundClip = 'unset';
        playerNameDiv.style.backgroundClip = 'unset';
        playerNameDiv.style.webkitTextFillColor = 'unset';
        playerNameDiv.style.color = '#ff0000';
        playerNameDiv.style.animation = 'rainbow-fade 45s linear infinite';
        playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
      } else if (color === 'diamond') {
        playerNameDiv.style.background = 'linear-gradient(135deg, #C0C0C0, #F0F0F0, #C0C0C0)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else if (color === 'gradient1') {
        playerNameDiv.style.background = 'linear-gradient(180deg, #0c3bf6, #fe0065)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else if (color === 'gradient2') {
        playerNameDiv.style.background = 'linear-gradient(180deg, #517dfd, #ff4f96)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else if (color === 'gradient3') {
        playerNameDiv.style.background = 'linear-gradient(180deg, #fefb1d, #fefeda, #fea700)';
        playerNameDiv.style.webkitBackgroundClip = 'text';
        playerNameDiv.style.backgroundClip = 'text';
        playerNameDiv.style.webkitTextFillColor = 'transparent';
        playerNameDiv.style.color = 'transparent';
        playerNameDiv.style.textShadow = 'none';
        playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
      } else {
        const colorMap = {
          'white': '#FFFFFF',
          'blue': '#4A90E2',
          'green': '#50C878',
          'purple': '#9B59B6',
          'pink': '#FF69B4',
          'red': '#d6453b',
          'lightgreen': '#38e231',
          'lightblue': '#2c96eb'
        };
        playerNameDiv.style.color = colorMap[color] || '#FFFFFF';
        playerNameDiv.style.background = 'none';
        playerNameDiv.style.webkitTextFillColor = 'unset';
        playerNameDiv.style.webkitBackgroundClip = 'unset';
        playerNameDiv.style.backgroundClip = 'unset';
        playerNameDiv.style.animation = 'none';
        playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
        playerNameDiv.style.filter = 'none';
      }
    }
  }

  if (savedOptions.level) {
    const playerLevelImg = document.getElementById('player-level');
    playerLevelImg.src = savedOptions.level;
    playerLevelImg.style.display = 'block';
  }

  if (savedOptions.badge) {
    const playerBadgeImg = document.getElementById('player-badge');
    playerBadgeImg.src = savedOptions.badge;
    playerBadgeImg.style.display = 'block';
  }
});

function cropCanvasToActivePixels(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w, maxX = 0, minY = h, maxY = 0;
  let hasPixels = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > 5) {
        hasPixels = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasPixels) return canvas;

  const padding = 4;
  minX = Math.max(0, minX - padding);
  maxX = Math.min(w - 1, maxX + padding);
  minY = Math.max(0, minY - padding);
  maxY = Math.min(h - 1, maxY + padding);

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropW;
  croppedCanvas.height = cropH;
  const croppedCtx = croppedCanvas.getContext('2d');
  croppedCtx.imageSmoothingEnabled = false;
  
  croppedCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return croppedCanvas;
}

// Generate preview image for save slot (transparent PNG without platform)
async function generateSavePreview() {
  try {
    const characterScene = document.querySelector('.character-scene');
    if (!characterScene) return null;

    const visibleImages = [];
    const layers = Array.from(characterScene.querySelectorAll('img'));

    // Collect visible layers (EXCEPT platforms)
    layers.forEach(img => {
      if (img.style.display !== 'none' && img.src && img.complete) {
        // Skip platform layer in previews
        if (img.id === 'platforms' || img.id === 'platform-shadow' || img.id === 'player-badge' || img.id === 'player-level' || img.id === 'player-name') return;

        const style = window.getComputedStyle(img);
        const zIndex = parseInt(style.zIndex || '0');
        const opacity = parseFloat(style.opacity || '1');
        const isBodyLayer = ['body', 'base', 'head', 'pupil', 'arm', 'leg', 'feet', 'back-arm'].includes(img.id);
        if (opacity > 0 || isBodyLayer) {
          visibleImages.push({ element: img, src: img.src, zIndex, opacity });
        }
      }
    });

    if (visibleImages.length === 0) return null;
    visibleImages.sort((a, b) => a.zIndex - b.zIndex);

    const loadedImages = [];
    for (const imgData of visibleImages) {
      try {
        const loadedImg = await loadImage(imgData.src);
        loadedImages.push({
          image: loadedImg,
          element: imgData.element,
          opacity: imgData.opacity
        });
      } catch (e) {
        console.error('Failed to load image for preview:', e);
      }
    }

    // Capture scene rect BEFORE resetting transform to account for its own position/padding
    const initialSceneRect = characterScene.getBoundingClientRect();

    // Temporarily reset scene transforms for clean measurements
    const originalTransform = characterScene.style.transform;
    const originalZoom = characterScene.style.zoom;
    characterScene.style.transform = 'none';
    characterScene.style.zoom = '1';

    // ── Stable Pivot Fix ──────────────────────────────────────────────
    // Temporarily reset arm-related inline transforms to their CSS-class
    // defaults so that hand-item rotation/positioning overrides don't
    // affect pivot calculations or baked-in arm group rendering.
    // For shirtsabove layers, re-apply ONLY the shirt's base transform
    // (scale + translate) WITHOUT any hand-item-induced rotation.
    const _armRelatedIds = ['arm', 'shirtsabove', 'shirtstop',
                            'back-arm', 'back-shirtsabove'];
    const _savedArmTransforms = {};
    _armRelatedIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        _savedArmTransforms[id] = el.style.transform;
        el.style.transform = '';  // Reset to CSS class default
      }
    });

    // Re-apply shirt-specific base transforms for shirtsabove (without rotation)
    const _eqShirt = document.querySelector('.submenu[id$="shirtsMenu"] .equipped') ||
                     document.querySelector('[data-layer="shirts"].equipped') ||
                     document.querySelector('[data-layer="outfits"].equipped');
    if (_eqShirt) {
      const _saEl = document.getElementById('shirtsabove');
      if (_saEl && _saEl.style.display !== 'none' && _saEl.src) {
        const s = _eqShirt.dataset.aboveScale ?? 1;
        const x = _eqShirt.dataset.aboveX ?? 0;
        const y = _eqShirt.dataset.aboveY ?? 0;
        _saEl.style.transform = `translateX(-50%) translate(${x}px, ${y}px) scale(${s})`;
      }
      const _bsaEl = document.getElementById('back-shirtsabove');
      if (_bsaEl && _bsaEl.style.display !== 'none' && _bsaEl.src) {
        const s = _eqShirt.dataset.aboveScale ?? 1;
        const x = parseFloat(_eqShirt.dataset.aboveX ?? 0) + 130;
        const y = _eqShirt.dataset.aboveY ?? 0;
        _bsaEl.style.transform = `translateX(-50%) translate(${x}px, ${y}px) scale(${s})`;
      }
      // Re-apply shirtstop base transform (without rotation)
      const _stEl = document.getElementById('shirtstop');
      if (_stEl && _stEl.style.display !== 'none' && _stEl.src && _eqShirt.dataset.topSrc) {
        const s = _eqShirt.dataset.topScale ?? 1;
        const x = _eqShirt.dataset.topX ?? 0;
        const y = _eqShirt.dataset.topY ?? 0;
        _stEl.style.transform = `translateX(-50%) translate(${x}px, ${y}px) scale(${s})`;
      }
    }
    // ── End Stable Pivot Fix ──────────────────────────────────────────

    // Force reflow
    void characterScene.offsetWidth;

    const imageData = [];
    const sceneRect = characterScene.getBoundingClientRect();

    for (const item of loadedImages) {
      const rect = item.element.getBoundingClientRect();
      const transform = getTransform(item.element);

      // Calculate center relative to scene origin (0,0 of the scene box)
      const cx = rect.left + rect.width / 2 - sceneRect.left;
      const cy = rect.top + rect.height / 2 - sceneRect.top;

      imageData.push({
        id: item.element.id,
        image: item.image,
        minX: rect.left - sceneRect.left,
        minY: rect.top - sceneRect.top,
        maxX: rect.right - sceneRect.left,
        maxY: rect.bottom - sceneRect.top,
        cx,
        cy,
        opacity: item.opacity,
        transform,
        w: item.element.offsetWidth,
        h: item.element.offsetHeight
      });
    }

    // Restore transforms
    characterScene.style.transform = originalTransform;
    characterScene.style.zoom = originalZoom;

    // Restore arm-related inline transforms
    _armRelatedIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && _savedArmTransforms[id] !== undefined) {
        el.style.transform = _savedArmTransforms[id];
      }
    });

    if (imageData.length === 0) return null;

    // Calculate character bounds relative to it's "body" or center
    const bodyImg = imageData.find(i => i.image.src.includes('body.png') || i.image.src.includes('base.png'));
    let centerX;
    if (bodyImg) {
      centerX = bodyImg.cx;
    } else {
      const minX = Math.min(...imageData.map(i => i.minX));
      const maxX = Math.max(...imageData.map(i => i.maxX));
      centerX = (minX + maxX) / 2;
    }

    const previewPadding = 15;
    const allMinX = Math.min(...imageData.map(i => i.minX)) - previewPadding;
    const allMaxX = Math.max(...imageData.map(i => i.maxX)) + previewPadding;
    const allMinY = Math.min(...imageData.map(i => i.minY)) - previewPadding;
    const allMaxY = Math.max(...imageData.map(i => i.maxY)) + previewPadding;

    const width = Math.ceil(allMaxX - allMinX);
    const height = Math.ceil(allMaxY - allMinY);

    // Define Layer Groups (MUST be defined before findPivot)
    const HEAD_LAYERS = ['head', 'pupil', 'headgears', 'headgearsabove', 'hair', 'eyes', 'faces', 'hat', 'djc-head', 'njc-head', 'shirtstop'];
    const HEAD_BASE_LAYERS = ['head', 'djc-head', 'njc-head', 'pupil'];
    const HEAD_ACC_LAYERS = ['headgears', 'headgearsabove', 'hair', 'eyes', 'faces', 'hat', 'shirtstop'];
    const ARM_LAYERS = ['arm', 'hands', 'shirtsabove', 'weapons', 'shields'];
    const BASE_ARM_LAYERS = ['base', 'back-arm', 'back-shirtsabove', 'back-hands', 'djc-right-arm', 'njc-right-arm'];

    // Scale factor for high-resolution captures (Full HD quality)
    const EXPORT_SCALE = 2;

    // Helper to draw a subset of images
    const renderGroup = (subset) => {
      if (!subset || subset.length === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = width * EXPORT_SCALE;
      canvas.height = height * EXPORT_SCALE;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      for (const imgData of subset) {
        ctx.save();
        ctx.globalAlpha = imgData.opacity;
        const drawX = (imgData.cx - allMinX) * EXPORT_SCALE;
        const drawY = (imgData.cy - allMinY) * EXPORT_SCALE;
        ctx.translate(drawX, drawY);
        const t = imgData.transform;
        ctx.transform(t.a, t.b, t.c, t.d, 0, 0);
        ctx.drawImage(imgData.image, (-imgData.w / 2) * EXPORT_SCALE, (-imgData.h / 2) * EXPORT_SCALE, imgData.w * EXPORT_SCALE, imgData.h * EXPORT_SCALE);
        ctx.restore();
      }
      return canvas.toDataURL('image/webp', 0.8);
    };

    // Calculate Pivot Points for Thumbnail Maker Rotation
    function getCanvasPoint(imgData, px, py) {
      if (!imgData) return { x: 0, y: 0 };
      const drawX = imgData.cx - allMinX;
      const drawY = imgData.cy - allMinY;
      const localX = px - imgData.w / 2;
      const localY = py - imgData.h / 2;
      const t = imgData.transform;
      return {
        x: (drawX + (t.a * localX + t.c * localY)) * EXPORT_SCALE,
        y: (drawY + (t.b * localX + t.d * localY)) * EXPORT_SCALE
      };
    }

    let armPivotX = 0, armPivotY = 0, headPivotX = 0, headPivotY = 0, baseArmPivotX = 0, baseArmPivotY = 0;

    const isJester = imageData.some(i => i.id.startsWith('djc-') || i.id.startsWith('njc-'));

    if (isJester) {
      // Jester custom pivots (calibrated)
      const jArm = imageData.find(i => i.id === 'arm');
      if (jArm) {
        const pt = getCanvasPoint(jArm, 140, 45); // Left arm pivot moved 10px up and 10px left (X: 140, Y: 45)
        armPivotX = pt.x; armPivotY = pt.y;
      }
      
      const jesterBase = imageData.find(i => i.id === 'djc-right-arm' || i.id === 'njc-right-arm');
      if (jesterBase) {
        const pt = getCanvasPoint(jesterBase, 70, 60);
        baseArmPivotX = pt.x; baseArmPivotY = pt.y;
      } else {
        baseArmPivotX = armPivotX; baseArmPivotY = armPivotY;
      }
      
      const jHead = imageData.find(i => i.id === 'djc-head' || i.id === 'njc-head');
      if (jHead) {
        const pt = getCanvasPoint(jHead, jHead.w / 2, jHead.h); // Neck pivot at bottom center of head image
        headPivotX = pt.x; headPivotY = pt.y;
      } else {
        headPivotX = ((allMaxX - allMinX) / 2) * EXPORT_SCALE;
        headPivotY = ((allMaxY - allMinY) / 2) * EXPORT_SCALE;
      }
    } else {
      // Normal character pivots using findPivot
      const findPivot = (layers, px, py) => {
        // 1. High Priority: Actual body part layers (arm, head, base, back-arm)
        const primaryIds = ['arm', 'head', 'base', 'body', 'back-arm'];
        const primaryRef = imageData.find(i => layers.includes(i.id) && primaryIds.includes(i.id) && i.w > 100);
        if (primaryRef) return getCanvasPoint(primaryRef, px, py);

        // 2. Medium Priority: Fallback to any large layer in the group
        const ref = imageData.find(i => layers.includes(i.id) && i.w > 100);
        if (ref) return getCanvasPoint(ref, px, py);
        
        return null;
      };

      const headPt = findPivot(HEAD_LAYERS, 118.5, 118);
      if (headPt) { headPivotX = headPt.x; headPivotY = headPt.y; }
      else { headPivotX = ((allMaxX - allMinX) / 2) * EXPORT_SCALE; headPivotY = ((allMaxY - allMinY) / 2) * EXPORT_SCALE; }

      const armPt = findPivot(ARM_LAYERS, 59.5, 129.5);
      if (armPt) { armPivotX = armPt.x; armPivotY = armPt.y; }

      const basePt = findPivot(BASE_ARM_LAYERS, 82, 175); 
      if (basePt) { baseArmPivotX = basePt.x; baseArmPivotY = basePt.y; }
      else { baseArmPivotX = armPivotX; baseArmPivotY = armPivotY; }
    }

    // Filter images into groups
    const headImages = imageData.filter(i => HEAD_LAYERS.includes(i.id));
    const headBaseImages = imageData.filter(i => HEAD_BASE_LAYERS.includes(i.id));
    const headAccImages = imageData.filter(i => HEAD_ACC_LAYERS.includes(i.id));
    const armImages = imageData.filter(i => ARM_LAYERS.includes(i.id));
    const baseArmImages = imageData.filter(i => BASE_ARM_LAYERS.includes(i.id));
    const CAPES_ABOVE_LAYERS = ['capesabove'];
    const restImages = imageData.filter(i => !HEAD_LAYERS.includes(i.id) && !ARM_LAYERS.includes(i.id) && !BASE_ARM_LAYERS.includes(i.id) && !CAPES_ABOVE_LAYERS.includes(i.id));
    const capesAboveImages = imageData.filter(i => CAPES_ABOVE_LAYERS.includes(i.id));

    // Render components
    const restDataUrl = renderGroup(restImages);
    const baseArmDataUrl = renderGroup(baseArmImages);
    const headDataUrl = renderGroup(headImages);
    const headBaseDataUrl = renderGroup(headBaseImages);
    const headAccDataUrl = renderGroup(headAccImages);
    const armDataUrl = renderGroup(armImages);
    const capesAboveDataUrl = renderGroup(capesAboveImages);

    // Flat combined canvas for the preview card
    const canvas = document.createElement('canvas');
    canvas.width = width * EXPORT_SCALE;
    canvas.height = height * EXPORT_SCALE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (const imgData of imageData) {
      ctx.save();
      ctx.globalAlpha = imgData.opacity;
      const drawX = (imgData.cx - allMinX) * EXPORT_SCALE;
      const drawY = (imgData.cy - allMinY) * EXPORT_SCALE;
      ctx.translate(drawX, drawY);
      const t = imgData.transform;
      ctx.transform(t.a, t.b, t.c, t.d, 0, 0);
      ctx.drawImage(imgData.image, (-imgData.w / 2) * EXPORT_SCALE, (-imgData.h / 2) * EXPORT_SCALE, imgData.w * EXPORT_SCALE, imgData.h * EXPORT_SCALE);
      ctx.restore();
    }

    const isRobot = imageData.some(i => i.image.src.includes('robot_body') || i.image.src.includes('robot_head') || i.image.src.includes('robotskin'));
    const isGsc = imageData.some(i => i.image.src.includes('gsc/head.png'));
    const isSc = imageData.some(i => i.image.src.includes('sc/head.png'));
    const isInvis = imageData.some(i => i.id === 'head' && (i.image.src.includes('invisibleskin') || i.image.src.includes('pupil.png')));

    const calculatedSkinType = isJester ? 'jester' : (isGsc ? 'golden_skeleton' : (isSc ? 'skeleton' : (isInvis ? 'invisible' : (isRobot ? 'robot' : 'normal'))));
    const croppedCanvas = cropCanvasToActivePixels(canvas);

    return {
      previewImage: croppedCanvas.toDataURL('image/webp', 0.8),
      skinType: calculatedSkinType,
      width: width * EXPORT_SCALE,
      height: height * EXPORT_SCALE,
      layers: {
        rest: restDataUrl,
        baseArm: baseArmDataUrl,
        head: headDataUrl,
        headBase: headBaseDataUrl,
        headAccessories: headAccDataUrl,
        arm: armDataUrl,
        capesAbove: capesAboveDataUrl
      },
      pivots: {
        armX: armPivotX,
        armY: armPivotY,
        baseArmX: baseArmPivotX,
        baseArmY: baseArmPivotY,
        headX: headPivotX,
        headY: headPivotY
      }
    };
  } catch (error) {
    console.error('Preview generation failed:', error);
    return null;
  }
}

// Save current state to a slot
async function saveToSlot(slotNumber) {
  const overlayState = localStorage.getItem('overlayState');
  const playerOptions = localStorage.getItem('playerOptions');

  if (!overlayState && !playerOptions) {
    alert('Nothing to save! Equip some items first.');
    return;
  }

  // Generate preview image and layers
  const previewData = await generateSavePreview();
  if (!previewData) return;

  const skinColorVal = activeSkinColor === 'rainbow' ? `hsl(${Math.round(globalRainbowHue)}, 100%, 60%)` : (activeSkinColor || '#d49e7a');

  const saveData = {
    overlayState: overlayState || '{}',
    previewImage: previewData.previewImage,
    skinType: previewData.skinType,
    skinColor: skinColorVal,
    layers: previewData.layers,
    pivots: previewData.pivots,
    timestamp: Date.now()
  };

  try {
    localStorage.setItem(`saveSlot${slotNumber}`, JSON.stringify(saveData));
  } catch (error) {
    console.error('Failed to save to character slot:', error);
    alert('Storage cache is full! Please delete some other slots (character/world/thumbnails) to free up space.');
    return;
  }

  // Update slot visual
  updateSlotVisual(slotNumber, previewData.previewImage);

  // Visual feedback
  const slot = document.querySelector(`.save-slot[data-slot="${slotNumber}"]`);
  const originalBorder = slot.style.borderColor;
  slot.style.borderColor = 'rgba(100, 255, 100, 1)';
  setTimeout(() => {
    slot.style.borderColor = originalBorder;
  }, 500);
}

// Load state from a slot
function loadFromSlot(slotNumber) {
  const saveDataStr = localStorage.getItem(`saveSlot${slotNumber}`);

  if (!saveDataStr) {
    alert('This slot is empty!');
    return;
  }

  try {
    const saveData = JSON.parse(saveDataStr);

    // Completely clear the current character to avoid layer conflicts
    // We pass true to force restore body parts, which is essential for switching
    // between states like Invis Skin or Ghost Outfit.
    unequipAll(true);

    // Restore overlay state (equipped items, background, scaling)
    if (saveData.overlayState) {
      localStorage.setItem('overlayState', saveData.overlayState);
      // loadState handles: 
      // 1. Scene scaling
      // 2. Background image
      // 3. Equipping items via equipItem/equipHat
      // 4. Inventory synchronization
      loadState();
    }

    // Final synchronization to ensure z-index and outfit side-effects are correct
    enforceLayerOrder();
    overrideLayerOrder();
    isGhostOutfitActive();
    syncBodyParts();

    // Visual feedback for successful load
    const slot = document.querySelector(`.save-slot[data-slot="${slotNumber}"]`);
    if (slot) {
      const originalBorder = slot.style.borderColor;
      slot.style.shadow = '0 0 20px rgba(100, 255, 255, 0.5)';
      slot.style.borderColor = 'rgba(100, 255, 255, 1)';
      setTimeout(() => {
        slot.style.borderColor = originalBorder;
        slot.style.shadow = '';
      }, 500);
    }

  } catch (error) {
    console.error('Failed to load save:', error);
    alert('Failed to load save data!');
  }
}

// Update slot visual with preview image
function updateSlotVisual(slotNumber, previewImage) {
  // Just re-render all slots to keep them in sync
  renderSaveSlots();
}

// Button wrapper functions for save and delete
window.saveToSlotBtn = async function (slotNumber) {
  await saveToSlot(slotNumber);
  renderSaveSlots(); // Re-render to update the preview
}

window.deleteSlot = function (slotNumber) {
  if (confirm(`Delete Slot ${slotNumber}? This will remove the slot completely.`)) {
    // Remove from localStorage
    localStorage.removeItem(`saveSlot${slotNumber}`);

    // Get all slots and reorder
    const allSlots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');
    const slotIndex = allSlots.indexOf(slotNumber);

    if (slotIndex > -1) {
      allSlots.splice(slotIndex, 1);
      localStorage.setItem('saveSlotsList', JSON.stringify(allSlots));
    }

    // Rebuild the slots UI
    renderSaveSlots();
  }
}

// Add new slot
window.addNewSlot = function () {
  const allSlots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');

  // Find the next available slot number
  let nextSlotNumber = 1;
  while (allSlots.includes(nextSlotNumber)) {
    nextSlotNumber++;
  }

  allSlots.push(nextSlotNumber);
  localStorage.setItem('saveSlotsList', JSON.stringify(allSlots));

  renderSaveSlots();
}

// Render all save slots dynamically
function renderSaveSlots() {
  const container = document.getElementById('saveSlotsContainer');
  if (!container) return;

  const allSlots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');

  container.innerHTML = '';

  allSlots.forEach(slotNumber => {
    const slotContainer = document.createElement('div');
    slotContainer.className = 'save-slot-container';

    const saveDataStr = localStorage.getItem(`saveSlot${slotNumber}`);
    const hasData = !!saveDataStr;

    let previewImage = null;
    if (hasData) {
      try {
        const saveData = JSON.parse(saveDataStr);
        previewImage = saveData.previewImage;
      } catch (error) {
        console.error(`Failed to load slot ${slotNumber}:`, error);
      }
    }

    slotContainer.innerHTML = `
      <div class="save-slot ${hasData ? 'has-save' : ''}" data-slot="${slotNumber}" onclick="loadFromSlot(${slotNumber})">
        <div class="save-slot-preview" style="${previewImage ? `background-image: url(${previewImage})` : ''}"></div>
        <div class="save-slot-label">Slot ${slotNumber}</div>
      </div>
      <div class="save-slot-buttons">
        <button class="save-slot-btn save-btn" onclick="event.stopPropagation(); saveToSlotBtn(${slotNumber})" title="Save">+</button>
        <button class="save-slot-btn delete-btn" onclick="event.stopPropagation(); window.deleteSlot(${slotNumber})" title="Delete">&times;</button>
      </div>
    `;

    container.appendChild(slotContainer);
  });
}

function migrateSaveSlots() {
  try {
    // 1. Character Slots Migration
    const charSlots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');
    let charSlotsChanged = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const match = key.match(/^saveSlot(\d+)$/);
      if (match) {
        const slotNum = parseInt(match[1]);
        if (!charSlots.includes(slotNum)) {
          charSlots.push(slotNum);
          charSlotsChanged = true;
        }
      }
    }
    if (charSlotsChanged) {
      charSlots.sort((a, b) => a - b);
      localStorage.setItem('saveSlotsList', JSON.stringify(charSlots));
      console.log('Migrated character slots list:', charSlots);
    }

    // 2. World Planner Slots Migration
    const wpSlots = JSON.parse(localStorage.getItem('wpSaveSlotsList') || '[]');
    let wpSlotsChanged = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const match = key.match(/^wpSaveSlot_(\d+)$/);
      if (match) {
        const slotNum = parseInt(match[1]);
        if (!wpSlots.includes(slotNum)) {
          wpSlots.push(slotNum);
          wpSlotsChanged = true;
        }
      }
    }
    if (wpSlotsChanged) {
      wpSlots.sort((a, b) => a - b);
      localStorage.setItem('wpSaveSlotsList', JSON.stringify(wpSlots));
      console.log('Migrated World Planner slots list:', wpSlots);
    }
  } catch (e) {
    console.error('Failed to run save slots migration:', e);
  }
}

// Initialize slots on page load
window.addEventListener('DOMContentLoaded', () => {
  // Run metadata migration for existing save slots
  migrateSaveSlots();

  // Hard reset utility: visit ?reset=true to clear state
  if (window.location.search.includes('reset=true')) {
    localStorage.clear();
    window.location.href = window.location.pathname;
    return;
  }

  // Default: slightly smaller character on mobile so it feels less cramped
  if (!manualZoom) {
    if (window.innerWidth <= 768) {
      sceneScale = 0.3;
    } else {
      sceneScale = 0.5;
    }
  }

  applySceneScale();
  loadState();
  generateSkinMenuIcons();

  // Initialize with no slots if first time
  const allSlots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');
  if (allSlots.length === 0) {
    localStorage.setItem('saveSlotsList', JSON.stringify([]));
  }

  renderSaveSlots();
});

// ==================== TOP DRAWER MENU ====================
window.toggleTopDrawer = function () {
  const drawer = document.getElementById('top-drawer');
  drawer.classList.toggle('open');
};

// ==================== PLATFORM INFINITE TILING ====================
function syncPlatformExtensions() {
  const platformImg = document.getElementById('platforms');
  const leftExtender = document.getElementById('platform-left');
  const rightExtender = document.getElementById('platform-right');
  const shadowLeft = document.getElementById('platform-shadow-left');
  const shadowRight = document.getElementById('platform-shadow-right');

  if (!platformImg || !leftExtender || !rightExtender) return;

  // Check visibility using computed style to account for display:none
  const style = window.getComputedStyle(platformImg);
  const isVisible = style.display !== 'none' && platformImg.style.display !== 'none';

  if (isVisible && platformImg.src) {
    const src = platformImg.src;

    // Update background image
    leftExtender.style.backgroundImage = `url("${src}")`;
    rightExtender.style.backgroundImage = `url("${src}")`;

    // Sync display
    leftExtender.style.display = 'block';
    rightExtender.style.display = 'block';

    // Sync shadow extenders
    if (shadowLeft) {
      shadowLeft.style.backgroundImage = `url("${src}")`;
      shadowLeft.style.display = 'block';
    }
    if (shadowRight) {
      shadowRight.style.backgroundImage = `url("${src}")`;
      shadowRight.style.display = 'block';
    }

    // Sync height to match the main platform image
    // We use offsetHeight to match the rendered size
    if (platformImg.offsetHeight > 0) {
      leftExtender.style.height = `${platformImg.offsetHeight}px`;
      rightExtender.style.height = `${platformImg.offsetHeight}px`;
      if (shadowLeft) shadowLeft.style.height = `${platformImg.offsetHeight}px`;
      if (shadowRight) shadowRight.style.height = `${platformImg.offsetHeight}px`;
    }
  } else {
    leftExtender.style.display = 'none';
    rightExtender.style.display = 'none';
    if (shadowLeft) shadowLeft.style.display = 'none';
    if (shadowRight) shadowRight.style.display = 'none';
  }
}

/**
 * Sorts all menu items within each submenu alphabetically based on their text content.
 */
function sortSubmenuItems() {
  document.querySelectorAll('.submenu').forEach(submenu => {
    // Skip menus with manually defined order
    if (submenu.id === 'specialsMenu' || submenu.id === 'genderMenu') return;
    const items = Array.from(submenu.querySelectorAll('li'));
    if (items.length <= 1) return;

    items.sort((a, b) => {
      // Helper to generate a "Sort Key" based on the Hybrid Logic:
      // 1. Strip Prefixes (Colors, etc.) to Normalize Name
      // 2. Identify Base Noun (Last Word of Normalized Name)
      // 3. Construct Key: BaseNoun + RestOfAttributes + Prefix
      const getSortKey = (item) => {
        let name = item.textContent.trim();
        const original_name = name; // Backup

        // 1. Define Prefixes to Strip
        const prefixes = [
          "Blue", "Green", "Red", "Yellow", "Pink", "Purple", "Orange",
          "Black", "White", "Dark", "Light", "Golden", "Silver", "Bronze",
          "Emerald", "Ruby", "Sapphire", "Diamond", "Majestic", "Epic", "Hyper",
          "Neon", "Radioactive", "Flaming", "Frost", "Acid", "Aqua", "Cyan", "Brown",
          "Grey", "Gray", "Violet", "Indigo", "Magenta", "Lime", "Olive", "Teal",
          "Navy", "Maroon", "Broken", "Cursed", "Ancient", "Mystic", "Legendary",
          "Crystal", "Electric", "Shadow", "Ghost", "Tech", "Cyber", "Pixel",
          "Festive", "Xmas", "Valentine", "Halloween", "Easter", "Summer", "Winter",
          "Rainbow", "Magma", "Water", "Earth", "Air", "Fire", "Ice", "Vampire",
          "Zombie", "Alien", "Robot", "Mecha", "Steampunk", "Retro", "Mini", "Long", "Messy"
        ];

        // 2. Exceptions (Start with specific words -> Keep order)
        const start_exceptions = ["Lambo", "Pet", "Wings of", "Hand of", "Eye of", "Mask of"];
        if (start_exceptions.some(exc => name.startsWith(exc))) return name;

        // 3. Strip Prefix if present
        let found_prefix = "";
        let words = name.split(' ');
        if (words.length > 1 && prefixes.includes(words[0])) {
          found_prefix = words.shift();
          name = words.join(' ');
        }

        // 4. Identify Base Noun (Last Word) & Construct Key
        words = name.split(' ');
        if (words.length > 1) {
          const last = words.pop();
          // Key: BaseNoun + RestOfAttributes + Prefix
          return (last + ' ' + words.join(' ') + ' ' + found_prefix).trim();
        }
        return (name + ' ' + found_prefix).trim();
      };

      const keyA = getSortKey(a).toLowerCase();
      const keyB = getSortKey(b).toLowerCase();

      return keyA.localeCompare(keyB, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Re-append items in the new sorted order
    items.forEach(li => submenu.appendChild(li));
  });
}

/**
 * Dynamically wraps every submenu <li> content into the unified Roadmap-style structure.
 * Standardizes sizes to 60x50 icon containers with 10px rounding.
 */
function applyRoadmapStyleToSubmenus() {
  const submenuItems = document.querySelectorAll('.submenu li');

  submenuItems.forEach(li => {
    // 1. Extract the existing icon and text
    const originalImg = li.querySelector('img');
    if (!originalImg) return;

    // Preserve original name (text after the <img> tag)
    let originalName = li.textContent.trim();

    // 2. Clear the <li> for restructuring
    li.innerHTML = '';

    // 3. Create the Icon Container (Left side)
    const iconContainer = document.createElement('div');
    iconContainer.className = 'roadmap-item-icon-container';

    // Update the image to use unified roadmap class
    originalImg.className = 'roadmap-image-icon';
    iconContainer.appendChild(originalImg);

    // 4. Create the Text Span (Right side)
    const textSpan = document.createElement('span');
    textSpan.className = 'roadmap-item-text';
    textSpan.textContent = originalName;

    // 5. Assemble back into the <li>
    li.appendChild(iconContainer);
    li.appendChild(textSpan);
  });
}

// Observe platform changes to auto-sync
window.addEventListener('DOMContentLoaded', () => {
  const platformImg = document.getElementById('platforms');
  if (platformImg) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && (mutation.attributeName === 'src' || mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
          syncPlatformExtensions();
        }
      });
    });

    observer.observe(platformImg, { attributes: true });

    // Also sync on load
    platformImg.addEventListener('load', syncPlatformExtensions);
    // Initial sync
    setTimeout(syncPlatformExtensions, 100);
  }

  // Handle Rocker Makeup Item Visibility
  document.body.classList.toggle('hide-rocker-makeup', !showRockerMakeupItem);
  if (!showRockerMakeupItem) {
    const eyesLayer = document.getElementById('eyes');
    if (isRockerMakeupActive()) {
      eyesLayer.style.display = 'none';
      eyesLayer.src = '';
      const rockerItem = document.querySelector('li[data-src="eyes/rocker.png"]');
      if (rockerItem) rockerItem.classList.remove('equipped');
      syncBodyParts();
    }
  }

  // Sort items alphabetically within each menu
  sortSubmenuItems();

  // Unified UI Application
  applyRoadmapStyleToSubmenus();

  // Always populate the Updates/Valentines hamburger menu
  if (typeof populateUpdatesMenu === 'function') {
    populateUpdatesMenu();
  }
});
// Original Loading Logic Restored — now preloads World Planner assets during the loading screen
const loadingStartTime = Date.now();
window.wpAssetsPreloaded = false; // Flag so we never preload again after first load

window.addEventListener('load', async () => {
  const loadingScreen = document.getElementById('loading-screen');
  const loaderInitial = document.getElementById('loader-initial');
  const loadingSelection = document.getElementById('loading-selection');
  const loaderProgressFill = document.querySelector('#loader-initial .loader-progress-fill');

  if (loadingScreen) {
    // Private visitor tracking (fire-and-forget, doesn't block)
    if (!sessionStorage.getItem('counted')) {
      fetch('https://api.counterapi.dev/v1/breaworlds-set-planner/visits/up')
        .then(() => sessionStorage.setItem('counted', 'true'))
        .catch(() => { });
    }

    // Preload World Planner assets during the loading screen
    // This replaces the old fake CSS progress animation with real progress
    try {
      // Stop the fake CSS grow animation and drive the bar with real progress
      if (loaderProgressFill) {
        loaderProgressFill.style.animation = 'progress-slide 2s linear infinite';
        loaderProgressFill.style.width = '0%';
      }

      // Fetch manifest, parse blocks, load active world, then preload all used images
      const manifestResponse = await fetch(`worldplanner/blocks_manifest.json?t=${Date.now()}`);
      const manifestData = await manifestResponse.json();

      // Build a temporary block map for preloading
      const preloadBlocks = manifestData.blocks || [];
      const preloadThemes = manifestData.themes || [];
      const preloadBlockMap = {};
      for (const b of preloadBlocks) preloadBlockMap[b.id] = b;

      // Load saved world grid from localStorage to know which blocks to preload
      const savedGrid = localStorage.getItem('wp_active_grid_exclusive') || localStorage.getItem('wp_active_grid');
      const savedBGGrid = localStorage.getItem('wp_background_grid_exclusive');
      const savedInventory = localStorage.getItem('wp_inventory');

      const uniqueSrcs = new Set();
      const uniqueBlockIds = new Set();

      // Scan active world grid
      if (savedGrid) {
        try {
          const gridData = JSON.parse(savedGrid);
          for (let y = 0; y < gridData.length; y++) {
            if (gridData[y]) {
              for (let x = 0; x < gridData[y].length; x++) {
                const cell = gridData[y][x];
                if (cell) {
                  const bid = (typeof cell === 'object') ? cell.id : cell;
                  if (bid) uniqueBlockIds.add(bid);
                }
              }
            }
          }
        } catch (e) { /* ignore parse errors */ }
      }

      // Scan background grid
      if (savedBGGrid) {
        try {
          const bgData = JSON.parse(savedBGGrid);
          for (let y = 0; y < bgData.length; y++) {
            if (bgData[y]) {
              for (let x = 0; x < bgData[y].length; x++) {
                const cell = bgData[y][x];
                if (cell) {
                  const bid = (typeof cell === 'object') ? cell.id : cell;
                  if (bid) uniqueBlockIds.add(bid);
                }
              }
            }
          }
        } catch (e) { /* ignore parse errors */ }
      }

      // Scan saved inventory
      if (savedInventory) {
        try {
          const invData = JSON.parse(savedInventory);
          if (Array.isArray(invData)) invData.forEach(id => { if (id) uniqueBlockIds.add(id); });
        } catch (e) { /* ignore parse errors */ }
      }

      // Default blocks
      ['spr_fg_dirt', 'spr_fg_grass', 'spr_fg_obsidian_block', 'spr_fg_bedrock'].forEach(id => uniqueBlockIds.add(id));

      // Theme backgrounds (preload all 15 themes to prevent black background when switching slots or themes)
      if (Array.isArray(preloadThemes) && preloadThemes.length > 0) {
        preloadThemes.forEach(t => {
          if (t && t.src) uniqueSrcs.add(t.src);
        });
      } else {
        const savedThemeId = localStorage.getItem('wp_planner_theme_id') || 'bg_forest';
        const activeTheme = preloadThemes.find(t => t.id === savedThemeId);
        if (activeTheme && activeTheme.src) uniqueSrcs.add(activeTheme.src);
      }

      // Resolve block IDs to image sources
      uniqueBlockIds.forEach(id => {
        const block = preloadBlockMap[id];
        if (block) {
          if (block.src) uniqueSrcs.add(block.src);
          if (block.framesPath && block.frameCount > 0) {
            for (let f = 0; f < block.frameCount; f++) {
              uniqueSrcs.add(`${block.framesPath}${f}.png`);
            }
          }
        }
      });

      const srcList = Array.from(uniqueSrcs);
      const total = srcList.length;
      let loadedCount = 0;

      if (total > 0) {
        const promises = srcList.map(src => {
          return new Promise(resolve => {
            const img = new Image();
            if (window.location.protocol !== 'file:') img.crossOrigin = 'anonymous';
            img.onload = () => { resolve(img); };
            img.onerror = () => { resolve(null); };
            img.src = src;
          }).then(() => {
            loadedCount++;
            if (loaderProgressFill) {
              loaderProgressFill.style.width = `${Math.min(100, Math.round((loadedCount / total) * 100))}%`;
            }
          });
        });
        await Promise.all(promises);
      }

      window.wpAssetsPreloaded = true;
      console.log(`Pre-loaded ${total} World Planner assets during loading screen.`);
    } catch (e) {
      console.warn("Asset preloading during loading screen failed (will load on demand):", e);
    }

    // Ensure a minimum display time of 1.5s so the loading screen isn't a flash
    const elapsed = Date.now() - loadingStartTime;
    const remaining = Math.max(0, 1500 - elapsed);

    setTimeout(() => {
      // Replace bar with selection options
      if (loaderInitial && loadingSelection) {
        loaderInitial.style.display = 'none';
        loadingSelection.style.display = 'flex';

        // Show "See What's New" and "Watch Guide" buttons with matching fade
        const whatsNewBtn = document.querySelector('.whats-new-trigger-btn');
        if (whatsNewBtn) {
          whatsNewBtn.classList.add('visible');
        }
        const watchVideoBtn = document.querySelector('.watch-video-btn');
        if (watchVideoBtn) {
          watchVideoBtn.classList.add('visible');
        }

        // Show "Report Bugs" and "APK Download" buttons with delay
        setTimeout(() => {
          const bugBtn = document.getElementById('report-bugs-btn');
          if (bugBtn) bugBtn.classList.add('visible');
          const isCapacitor = !!(window.Capacitor || /Capacitor|AndroidWebView/i.test(navigator.userAgent));
          const apkBtn = document.getElementById('apk-download-btn');
          if (apkBtn) {
            if (isCapacitor) {
              apkBtn.style.setProperty('display', 'none', 'important');
            } else {
              apkBtn.classList.add('visible');
            }
          }
        }, 600);

        // Auto-show modal if not confirmed yet
        if (!localStorage.getItem('whats_new_v251_confirmed')) {
          // Do not auto-show updates modal for new users anymore
        }
      }
    }, remaining);
  }
});

// ==========================================
// WORLD PLANNER FEATURE
// ==========================================

const WORLD_WIDTH = 100; // 0 to 99
const WORLD_HEIGHT = 50; // Increased from 45 to 50
const BLOCK_SIZE = 32;

window.WORLD_WIDTH = WORLD_WIDTH;
window.WORLD_HEIGHT = WORLD_HEIGHT;
window.BLOCK_SIZE = BLOCK_SIZE;

window.activePlannerType = 'set'; // Track current planner to optimize inactive loops

window.selectPlanner = function (type) {
  window.activePlannerType = type;
  if (typeof window.logModeClick === 'function') {
    window.logModeClick(type);
  }
  const wpContainer = document.getElementById("world-planner-container");
  const setContainer = document.getElementById("set-planner-container");
  const fishContainer = document.getElementById("fish-calculator-container");
  const tmContainer = document.getElementById("thumbnail-maker-container");
  const loadingScreen = document.getElementById("loading-screen");

  // Set Planner Specific UI
  const hamburger = document.querySelector(".hamburger");
  const spInventory = document.getElementById("sp-inventory-bar");
  const zoomControls = document.querySelector(".zoom-controls");
  const spTeleport = document.getElementById("sp-wrench-menu");

  // Hide all first
  wpContainer.style.display = "none";
  if (setContainer) setContainer.style.display = "none";
  if (fishContainer) fishContainer.style.display = "none";
  if (tmContainer) tmContainer.style.display = "none";

  // Toggle mode-specific UI - SP inventory bar ONLY shows in set planner
  if (hamburger) {
    hamburger.style.display = (type === "set") ? "flex" : "none";
    if (type !== "set") hamburger.classList.remove("open");
  }
  if (type !== "set") {
    const sideMenu = document.getElementById("sideMenu");
    if (sideMenu) sideMenu.classList.remove("open");
    document.body.classList.remove("menu-open");
  }
  if (spInventory) spInventory.style.display = (type === "set") ? "flex" : "none";
  if (zoomControls) zoomControls.style.display = (type === "set") ? "flex" : "none";
  if (spTeleport) spTeleport.style.display = (type === "set") ? "flex" : "none";

  // Close any open wrench menus
  document.querySelectorAll('.wrench-menu-container').forEach(el => el.classList.remove('open'));

  if (type === "world") {
    wpContainer.style.display = "flex";
    initWorldPlanner();
  } else if (type === "fish") {
    if (fishContainer) fishContainer.style.display = "block";
  } else if (type === "thumbnail") {
    if (tmContainer) tmContainer.style.display = "flex";
    if (window.initThumbnailMaker) window.initThumbnailMaker();
  } else {
    if (setContainer) setContainer.style.display = "block";

    // Re-apply saved player options so name/level/badge persist across menu navigation
    const savedPlayerOpts = JSON.parse(localStorage.getItem('playerOptions') || '{}');
    if (savedPlayerOpts.name) {
      const playerNameDiv = document.getElementById('player-name');
      if (playerNameDiv) {
        playerNameDiv.textContent = savedPlayerOpts.name;
        playerNameDiv.style.display = 'block';

        // Apply saved color
        const color = savedPlayerOpts.color || 'white';
        if (color === 'rainbow') {
          playerNameDiv.style.background = 'none';
          playerNameDiv.style.webkitBackgroundClip = 'unset';
          playerNameDiv.style.backgroundClip = 'unset';
          playerNameDiv.style.webkitTextFillColor = 'unset';
          playerNameDiv.style.color = '#ff0000';
          playerNameDiv.style.animation = 'rainbow-fade 45s linear infinite';
          playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
          playerNameDiv.style.filter = 'none';
        } else if (color === 'diamond') {
          playerNameDiv.style.background = 'linear-gradient(135deg, #C0C0C0, #F0F0F0, #C0C0C0)';
          playerNameDiv.style.webkitBackgroundClip = 'text';
          playerNameDiv.style.backgroundClip = 'text';
          playerNameDiv.style.webkitTextFillColor = 'transparent';
          playerNameDiv.style.color = 'transparent';
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.textShadow = 'none';
          playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
        } else if (color === 'gradient1') {
          playerNameDiv.style.background = 'linear-gradient(180deg, #0c3bf6, #fe0065)';
          playerNameDiv.style.webkitBackgroundClip = 'text';
          playerNameDiv.style.backgroundClip = 'text';
          playerNameDiv.style.webkitTextFillColor = 'transparent';
          playerNameDiv.style.color = 'transparent';
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.textShadow = 'none';
          playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
        } else if (color === 'gradient2') {
          playerNameDiv.style.background = 'linear-gradient(180deg, #517dfd, #ff4f96)';
          playerNameDiv.style.webkitBackgroundClip = 'text';
          playerNameDiv.style.backgroundClip = 'text';
          playerNameDiv.style.webkitTextFillColor = 'transparent';
          playerNameDiv.style.color = 'transparent';
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.textShadow = 'none';
          playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
        } else if (color === 'gradient3') {
          playerNameDiv.style.background = 'linear-gradient(180deg, #fefb1d, #fefeda, #fea700)';
          playerNameDiv.style.webkitBackgroundClip = 'text';
          playerNameDiv.style.backgroundClip = 'text';
          playerNameDiv.style.webkitTextFillColor = 'transparent';
          playerNameDiv.style.color = 'transparent';
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.textShadow = 'none';
          playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
        } else {
          const colorMap = {
            'white': '#FFFFFF', 'blue': '#4A90E2', 'green': '#50C878',
            'purple': '#9B59B6', 'pink': '#FF69B4', 'red': '#d6453b',
            'lightgreen': '#38e231', 'lightblue': '#2c96eb'
          };
          playerNameDiv.style.color = colorMap[color] || '#FFFFFF';
          playerNameDiv.style.background = 'none';
          playerNameDiv.style.webkitTextFillColor = 'unset';
          playerNameDiv.style.webkitBackgroundClip = 'unset';
          playerNameDiv.style.backgroundClip = 'unset';
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
          playerNameDiv.style.filter = 'none';
        }
      }
    }
    if (savedPlayerOpts.level) {
      const playerLevelImg = document.getElementById('player-level');
      if (playerLevelImg) {
        playerLevelImg.src = savedPlayerOpts.level;
        playerLevelImg.style.display = 'block';
      }
    }
    if (savedPlayerOpts.badge) {
      const playerBadgeImg = document.getElementById('player-badge');
      if (playerBadgeImg) {
        playerBadgeImg.src = savedPlayerOpts.badge;
        playerBadgeImg.style.display = 'block';
      }
    }
  }

  // Fade out loading screen after selection (if not already hidden)
  if (loadingScreen && loadingScreen.style.display !== "none") {
    loadingScreen.classList.add("fade-out");
    // Clear any previous fade timer to prevent race conditions
    if (window._loadScreenFadeTimer) clearTimeout(window._loadScreenFadeTimer);
    window._loadScreenFadeTimer = setTimeout(() => {
      loadingScreen.style.display = "none";
      loadingScreen.classList.remove("fade-out");
      window._loadScreenFadeTimer = null;
    }, 800);
  }
};

window.backToSelection = function () {
  window.activePlannerType = 'menu';

  // Cancel any pending fade-out timer from selectPlanner so the menu stays visible
  if (window._loadScreenFadeTimer) {
    clearTimeout(window._loadScreenFadeTimer);
    window._loadScreenFadeTimer = null;
  }
  const wpContainer = document.getElementById("world-planner-container");
  const setContainer = document.getElementById("set-planner-container");
  const fishContainer = document.getElementById("fish-calculator-container");
  const tmContainer = document.getElementById("thumbnail-maker-container");
  const loadingScreen = document.getElementById("loading-screen");
  const loaderInitial = document.getElementById("loader-initial");
  const loadingSelection = document.getElementById("loading-selection");

  // Set Planner Specific UI
  const hamburger = document.querySelector(".hamburger");
  const spInventory = document.getElementById("sp-inventory-bar");
  const zoomControls = document.querySelector(".zoom-controls");
  const spTeleport = document.getElementById("sp-wrench-menu");

  if (wpContainer) wpContainer.style.display = "none";
  if (setContainer) setContainer.style.display = "none";
  if (fishContainer) fishContainer.style.display = "none";
  if (tmContainer) tmContainer.style.display = "none";

  // Hide SP UI
  if (hamburger) {
    hamburger.style.display = "none";
    hamburger.classList.remove("open");
  }
  const sideMenu = document.getElementById("sideMenu");
  if (sideMenu) sideMenu.classList.remove("open");
  document.body.classList.remove("menu-open");

  if (spInventory) spInventory.style.display = "none";
  if (zoomControls) zoomControls.style.display = "none";
  
  // Ghost removal
  const bgWrap = document.querySelector(".background-wrapper"); if (bgWrap) bgWrap.style.display = "none";
  const charDisp = document.getElementById("characterDisplay"); if (charDisp) charDisp.style.display = "none";
  const nameDisp = document.getElementById("player-name"); if (nameDisp) nameDisp.style.display = "none";
  if (spTeleport) spTeleport.style.display = "none";

  // Close any open wrench menus
  document.querySelectorAll('.wrench-menu-container').forEach(el => el.classList.remove('open'));

  if (loadingScreen) {
    loadingScreen.style.display = "flex";
    loadingScreen.classList.remove("fade-out");
    if (loaderInitial) loaderInitial.style.display = "none";
    if (loadingSelection) loadingSelection.style.display = "flex";


    const bugBtn = document.getElementById('report-bugs-btn');
    if (bugBtn) bugBtn.classList.add('visible');
    const isCapacitor = !!(window.Capacitor || /Capacitor|AndroidWebView/i.test(navigator.userAgent));
    const apkBtn = document.getElementById('apk-download-btn');
    if (apkBtn) {
      if (isCapacitor) {
        apkBtn.style.setProperty('display', 'none', 'important');
      } else {
        apkBtn.classList.add('visible');
      }
    }
  }
};

