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
      // If ghost is NOT active, ensure the part is visible
      if (!isGhost) {
        // Body parts are never hidden by clothing — same behaviour as color skin variants.
        // Cars (non-skate) hide feet. Skate items hide base.
        let shouldHide = false;
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
          if (id === 'base') {
            // Base must remain in layout to anchor character position
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

      // Set opacity based on invis state, but preserve skate-hidden base
      if (id === 'base' && isSkate) {
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
            // Don't restore feet for shirt52 - keep it hidden
          } else if (layerType === 'pants') {
            // Don't restore leg for shirt52 - keep it hidden
          } else if (layerType === 'eyes') {
            // Don't restore pupil for shirt52 - keep it hidden
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
    'hands', 'capes', 'capesabove', 'wings', 'cars', 'floaties',
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
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.Capacitor;
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
      console.warn('Native share failed, falling back to browser download:', e);
    }
  }
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

        // Show "See What's New" button with matching fade
        const whatsNewBtn = document.querySelector('.whats-new-trigger-btn');
        if (whatsNewBtn) {
          whatsNewBtn.classList.add('visible');
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
    setTimeout(() => {
      loadingScreen.style.display = "none";
      loadingScreen.classList.remove("fade-out");
    }, 800);
  }
};

window.backToSelection = function () {
  window.activePlannerType = 'menu';
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

// ==================== BLOCK SPOTLIGHT ====================
window.wpSpotlightActiveIds = new Set();

window.openSpotlightModal = function() {
  const listContainer = document.getElementById('wpSpotlightList');
  if (!listContainer) return;

  const counts = {};
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    if (!wpGrid[y]) continue;
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const blockData = wpGrid[y][x];
      if (blockData) {
        let blockId = (typeof blockData === 'object' && blockData !== null) ? blockData.id : blockData;
        if (blockId) {
          if (!((blockId === 'bedrock' || blockId === 'spr_fg_bedrock') && y >= WORLD_HEIGHT - 5)) {
            counts[blockId] = (counts[blockId] || 0) + 1;
          }
        }
      }
      const bgData = wpBackgroundGrid[y][x];
      if (bgData) {
        let blockId = (typeof bgData === 'object' && bgData !== null) ? bgData.id : bgData;
        if (blockId) {
          counts[blockId] = (counts[blockId] || 0) + 1;
        }
      }
    }
  }

  listContainer.innerHTML = '';
  const sortedBlockIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  if (sortedBlockIds.length === 0) {
    listContainer.innerHTML = '<div style="text-align:center; opacity:0.5; padding: 20px;">No blocks placed yet.</div>';
  } else {
    sortedBlockIds.forEach(blockId => {
      const block = wpBlockMap[blockId];
      if (!block) return;

      const item = document.createElement('div');
      item.className = 'wp-count-item wp-spotlight-item' + (window.wpSpotlightActiveIds.has(blockId) ? ' active' : '');
      item.style.cursor = 'pointer';
      item.dataset.blockId = blockId;
      item.onclick = function() { toggleSpotlight(blockId, this); };

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

  const modal = document.getElementById('wp-spotlight-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closeSpotlightModal = function() {
  const modal = document.getElementById('wp-spotlight-modal');
  if (modal) modal.classList.add('hidden');
};

window.toggleSpotlight = function(blockId, element) {
  if (window.wpSpotlightActiveIds.has(blockId)) {
    window.wpSpotlightActiveIds.delete(blockId);
    if (element) element.classList.remove('active');
  } else {
    window.wpSpotlightActiveIds.add(blockId);
    if (element) element.classList.add('active');
  }
  wpDirty = true;
  wpMarkStaticDirty();
};

window.clearSpotlight = function() {
  window.wpSpotlightActiveIds.clear();
  document.querySelectorAll('.wp-spotlight-item').forEach(item => {
    item.classList.remove('active');
  });
  wpDirty = true;
  wpMarkStaticDirty();
};

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

window.exportWPWorldSlot = function(slotNumber) {
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
