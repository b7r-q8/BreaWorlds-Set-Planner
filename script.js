
let inventory = [];
const MAX_SLOTS = 10;
let inventoryClickDebounce = false;

// Feature toggles
let enableRockerBodySwap = true;
let showRockerMakeupItem = true;

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
let sceneScale = 1;
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
    if (window.innerWidth <= 600) {
      sceneScale = 0.85;
    } else {
      sceneScale = 1.0;
    }
  }

  // Force clamp again just to be absolutely sure
  const minScale = 0.6;
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
  const minScale = 0.6;
  const maxScale = 1.4;
  sceneScale = Math.min(maxScale, Math.max(minScale, (parseFloat(sceneScale) || 1.0) + delta));
  applySceneScale();
  saveState();
}

window.resetZoom = function () {
  manualZoom = false; // Allow auto-scaling again
  if (window.innerWidth <= 600) {
    sceneScale = 0.85;
  } else {
    sceneScale = 1.0;
  }
  applySceneScale();
  saveState();
}

// Save state to localStorage
function saveState() {
  const state = {
    manualZoom: manualZoom,
    sceneScale: sceneScale,
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
        state.equippedItems[layerName] = {
          src: layer.src,
          opacity: layer.style.opacity || '',
          transform: layer.style.transform || ''
        };
      } else if (layerName === 'head') {
        // Special handling for head layer (may be changed by invis skin)
        state.equippedItems[layerName] = {
          src: layer.src,
          transform: layer.style.transform || ''
        };

      } else if (layerName === 'arm') {
        state.equippedItems[layerName] = {
          src: layer.src,
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

  localStorage.setItem('overlayState', JSON.stringify(state));
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
      equipItem(platform1Btn);
    }
    // Set default background (already handled by setBackground default if not in state, but explicit here is good)
    setBackground('backgrounds/bg3.png', true);
    return;
  }

  try {
    const state = JSON.parse(saved);

    // Restore scaling preference
    if (state.manualZoom !== undefined) manualZoom = state.manualZoom;
    if (state.sceneScale !== undefined) {
      sceneScale = parseFloat(state.sceneScale) || 1.0;
      // Clamp loaded value just in case
      sceneScale = Math.min(1.4, Math.max(0.6, sceneScale));
    }

    // Apply scale immediately after restoring it
    applySceneScale();

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
          if (itemData.src.includes('invisibleskin')) {
            document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
            const invisMenuItem = document.querySelector("#specialsMenu li[onclick*='equipInvisCharacter']");
            if (invisMenuItem) invisMenuItem.classList.add("equipped");
          } else if (itemData.src.includes('specials/head.png')) {
            // Normal character
            document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
            const normalMenuItem = document.querySelector("#specialsMenu li[onclick*='equipNormalCharacter']");
            if (normalMenuItem) normalMenuItem.classList.add("equipped");
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

    // Save state once at the end to ensure everything is saved together
    saveState();
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
      // Exception: Shark Hoodie top-layer (above3) should NOT rotate with the arm
      const isSharkTop = (sleeve.id === 'shirtstop' && equippedShirt && (equippedShirt.dataset.src?.includes('shirt3') || equippedShirt.dataset.frames?.includes('shirt3')));

      if (!isSharkTop && sleeve.style.display === 'none') {
        return; // Skip if hidden and not the shark exception
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
      // Exception: Shark Hoodie detail stays static relative to the body
      if (useArmOverrides && !isSharkTop) {
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
          if (overrideSleeveScale) finalScale = parseFloat(overrideSleeveScale);

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

        // Apply rotation to all sleeves EXCEPT the static Shark Hoodie detail
        if (useArmOverrides && !isSharkTop) {
          transform += ` rotate(${armRot}deg)`;
        }
      }

      sleeve.style.transform = transform;
    }
  });
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

  activeAnimations[layer.id] = setInterval(() => {
    layer.src = `${framesPath}${frame}.png`;
    frame = frame % frameCount + 1;
  }, 1000 / fps);
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
  });

  // Auto-scroll disabled per user request for steady typing view
}

// Swap to the normal/base character (full character swap, not an inventory item)
window.equipNormalCharacter = function (element) {
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
    armElement.src = "arm.png";
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

  const legElement = document.getElementById('leg');
  if (legElement) legElement.src = "leg.png";

  // Re-equip shirts with body variant (normal) if they have one
  if (shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src) {
    const equippedShirt = document.querySelector('#shirtsMenu li.equipped');
    if (equippedShirt && equippedShirt.dataset.invisSrc) {
      shirtsLayer.src = equippedShirt.dataset.src;
      const normalScale = equippedShirt.dataset.scale ?? 1;
      const normalX = equippedShirt.dataset.x ?? 0;
      const normalY = equippedShirt.dataset.y ?? 0;
      shirtsLayer.style.transform = `translateX(-50%) translate(${normalX}px, ${normalY}px) scale(${normalScale})`;
    }
  }

  // Restore shoes
  const shoesLayer = document.getElementById('shoes');
  if (shoesLayer && shoesLayer.style.display === 'block') {
    const equippedShoe = document.querySelector('#shoesMenu li.equipped');
    if (equippedShoe && equippedShoe.dataset.invisSrc) {
      shoesLayer.src = equippedShoe.dataset.src || equippedShoe.dataset.rightSrc || '';
      const normalScaleS = equippedShoe.dataset.scale ?? 1;
      const normalXS = equippedShoe.dataset.x ?? 0;
      const normalYS = equippedShoe.dataset.y ?? 0;
      shoesLayer.style.transform = `translateX(-50%) translate(${normalXS}px, ${normalYS}px) scale(${normalScaleS})`;
      const rightShoeLayer = document.getElementById('rightshoe');
      if (rightShoeLayer) {
        rightShoeLayer.style.display = 'block';
        rightShoeLayer.src = equippedShoe.dataset.rightSrc ?? equippedShoe.dataset.src ?? '';
        const rightScale = equippedShoe.dataset.rightScale ?? equippedShoe.dataset.scale ?? 1;
        const rightX = equippedShoe.dataset.rightX ?? equippedShoe.dataset.x ?? 0;
        const rightY = equippedShoe.dataset.rightY ?? equippedShoe.dataset.y ?? 0;
        rightShoeLayer.style.transform = `translateX(-50%) translate(${rightX}px, ${rightY}px) scale(${rightScale})`;
      }
    }
  }

  // Restore pants
  const pantsLayer = document.getElementById('pants');
  if (pantsLayer && pantsLayer.style.display === 'block') {
    const equippedPants = document.querySelector('#pantsMenu li.equipped');
    if (equippedPants && equippedPants.dataset.invisSrc) {
      pantsLayer.src = equippedPants.dataset.src || '';
      const normalScaleP = equippedPants.dataset.scale ?? 1;
      const normalXP = equippedPants.dataset.x ?? 0;
      const normalYP = equippedPants.dataset.y ?? 0;
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

// Helper function to check if invis skin is equipped
function isInvisSkinActive() {
  const invisMenuItem = document.querySelector("#specialsMenu li[onclick*='equipInvisCharacter']");
  if (invisMenuItem) return invisMenuItem.classList.contains("equipped");

  const headElement = document.getElementById('head');
  return headElement && headElement.src && headElement.src.includes('invisibleskin');
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
  const isRocker = isRockerMakeupActive();
  const isInvis = isInvisSkinActive();
  const isGhost = isGhostOutfitActive();

  // Reset eyes layer opacity by default (overridden by syncHeadSprite if needed)
  const eyesLayer = document.getElementById('eyes');
  if (eyesLayer) eyesLayer.style.opacity = '1';

  // Check if skate car is equipped
  const carsLayer = document.getElementById('cars');
  const isSkate = carsLayer && carsLayer.style.display === 'block' && carsLayer.src && (carsLayer.src.includes('skate.png') || carsLayer.src.includes('dcirc.png') || carsLayer.src.includes('circ.png'));

  const parts = {
    'base': isRocker ? 'rockerbody/base.png' : (isSkate ? 'baseskate.png' : (isInvis ? 'base.png' : 'specials/base.png')),
    'body': isRocker ? 'rockerbody/body.png' : 'body.png',
    'arm': isRocker ? 'rockerbody/arm.png' : 'arm.png',
    'leg': isRocker ? 'rockerbody/leg.png' : (isSkate ? 'legskate.png' : 'leg.png'),
    'feet': isRocker ? 'rockerbody/feet.png' : 'feet.png'
  };

  Object.entries(parts).forEach(([id, src]) => {
    const el = document.getElementById(id);
    if (el) {
      el.src = src;
      // If ghost is NOT active, ensure the part is visible (unless specific item hides it)
      if (!isGhost) {
        // Fix: Check if corresponding layer has an item equipped before showing base part
        let shouldHide = false;
        if (id === 'feet') {
          const shoesLayer = document.getElementById('shoes');
          const carsLayer = document.getElementById('cars');
          const isSkate = carsLayer && carsLayer.style.display === 'block' && carsLayer.src && (carsLayer.src.includes('skate.png') || carsLayer.src.includes('dcirc.png') || carsLayer.src.includes('circ.png'));
          const carIsEquipped = carsLayer && carsLayer.style.display === 'block' && !isSkate;

          if ((shoesLayer && (shoesLayer.style.display === 'block' || shoesLayer.classList.contains('active'))) || carIsEquipped) {
            shouldHide = true;
          }
        } else if (id === 'leg') {
          const pantsLayer = document.getElementById('pants');
          if (pantsLayer && (pantsLayer.style.display === 'block' || pantsLayer.classList.contains('active'))) {
            shouldHide = true;
          }
        } else if (id === 'body') {
          const shirtsLayer = document.getElementById('shirts');
          const outfitsLayer = document.getElementById('outfits');
          if ((shirtsLayer && (shirtsLayer.style.display === 'block' || shirtsLayer.classList.contains('active'))) ||
            (outfitsLayer && (outfitsLayer.style.display === 'block' || outfitsLayer.classList.contains('active')))) {
            shouldHide = true;
          }
        }

        if (shouldHide) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
        } else {
          el.style.display = 'block';
          el.style.visibility = 'visible';
        }
      }

      el.style.opacity = isInvis ? '0' : '1';
    }
  });

  // === ROCKER VARIANT SYNC ===
  // If Rocker is toggled, we need to update currently equipped variant-supporting items
  ['shirts', 'pants', 'shoes'].forEach(layerId => {
    const layer = document.getElementById(layerId);
    if (layer && layer.style.display === 'block' && layer.src) {
      // Find the menu item that provided this src
      const equippedItem = document.querySelector(`li.equipped[data-layer="${layerId}"]`) ||
        document.querySelector(`img.equipped[data-layer="${layerId}"]`);

      if (equippedItem) {
        const baseSrc = equippedItem.dataset.src;
        if (baseSrc && rockerVariants[baseSrc]) {
          let targetSrc;
          // Rocker variants only apply to the base character (not when invisible skin is active)
          if (isRocker && !isInvis) {
            targetSrc = rockerVariants[baseSrc];
          } else {
            // Respect invis skin variant when Rocker is disabled OR when Invis is ON (Invis takes precedence)
            targetSrc = (isInvis && equippedItem.dataset.invisSrc) ? equippedItem.dataset.invisSrc : baseSrc;
          }

          if (layer.src && !layer.src.includes(targetSrc)) {
            console.log(`Syncing Rocker/Invis variant for ${layerId}: ${layer.src} -> ${targetSrc}`);
            layer.src = targetSrc;

            // If shoes, also update rightshoe counterpart
            if (layerId === 'shoes') {
              const rightShoeLayer = document.getElementById('rightshoe');
              if (rightShoeLayer && rightShoeLayer.style.display === 'block') {
                const baseRightSrc = equippedItem.dataset.rightSrc || baseSrc;
                const targetRightSrc = isRocker ? (rockerVariants[baseRightSrc] || rockerVariants[baseSrc]) : (isInvis ? equippedItem.dataset.invisRightSrc || equippedItem.dataset.invisSrc || baseRightSrc : baseRightSrc);
                rightShoeLayer.src = targetRightSrc;
              }
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

    if (!isGhost) {
      pupilLayer.style.display = 'block';
    }

    if (isRocker) {
      pupilLayer.style.opacity = '1';
    } else if (isInvis) {
      pupilLayer.style.opacity = (equippedEye && isEyeException(eyeSrc)) ? '1' : '0';
    } else {
      // Normal character: check if eye item hides pupil
      pupilLayer.style.opacity = (equippedEye && !isEyeException(eyeSrc)) ? '0' : '1';
    }
  }

  syncHeadSprite();

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
    headLayer.src = "specials/invisibleskin.png";
    const equippedEye = document.querySelector('#eyesMenu li.equipped');
    const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';
    headLayer.style.display = "block";
    headLayer.style.opacity = (equippedEye && !isEyeException(eyeSrc)) ? '0' : '1';
    return;
  }

  // Priority 2: Mechanical Bunny Helmet (facemech.png)
  if (faces29Equipped) {
    if (isInvisSkinActive()) {
      headLayer.src = "specials/invisibleskin.png";
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
      } else {
        headLayer.src = "facemech.png";
        // Eyes opacity is reset to '1' by syncBodyParts default, so we don't need to force it here
      }
      headLayer.style.opacity = "1";
    }
    headLayer.style.display = "block";
    return;
  }

  // Priority 3: Rocker or Normal
  if (isRocker) {
    headLayer.src = isInvisSkinActive() ? "rockerbody/invisrocker.png" : "rockerbody/head.png";
    headLayer.style.display = "block";
    headLayer.style.opacity = "1";
  } else {
    headLayer.src = "specials/head.png";
    headLayer.style.display = "block"; // Always show the head
    headLayer.style.opacity = "1";
  }
}

// Swap to the invis character variant (also a full character swap, no inventory)
window.equipInvisCharacter = function (element) {
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

  // Custom Skate Check: Re-apply if switching to invis while car is equipped
  const carsLayer = document.getElementById('cars');
  if (carsLayer && carsLayer.style.display === 'block' && carsLayer.src.includes('skate.png')) {
    baseElement.src = 'baseskate.png';
    const legElement = document.getElementById('leg');
    if (legElement) legElement.src = 'legskate.png';
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

function equipItem(element) {
  console.log('=== equipItem CALLED ===', element.dataset.layer, element.dataset.frames || element.dataset.src);
  const layerName = element.dataset.layer;
  const src = element.dataset.src || element.dataset.frames; // Support animated items without data-src
  // Outfits use the shirts layer
  const actualLayerName = layerName === 'outfits' ? 'shirts' : layerName;
  const layer = document.getElementById(actualLayerName);

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
      // Remove equipped class from cape menu items
      document.querySelectorAll('[data-layer="capes"]').forEach(item => {
        item.classList.remove('equipped');
      });
    }
  }

  // MUTUAL EXCLUSIVITY: Front and Back pets can't be equipped together
  if (layerName === 'pets') {
    const petsBackLayer = document.getElementById('pets-back');
    if (petsBackLayer && petsBackLayer.style.display === 'block') {
      petsBackLayer.style.display = 'none';
      stopAnimation(petsBackLayer);
      petsBackLayer.src = '';
      document.querySelectorAll('[data-layer="pets-back"]').forEach(item => {
        item.classList.remove('equipped');
      });
    }
  } else if (layerName === 'pets-back') {
    const petsLayer = document.getElementById('pets');
    if (petsLayer && petsLayer.style.display === 'block') {
      petsLayer.style.display = 'none';
      stopAnimation(petsLayer);
      petsLayer.src = '';
      document.querySelectorAll('[data-layer="pets"]').forEach(item => {
        item.classList.remove('equipped');
      });
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
        console.log('Space Suit Pants unequipped - removing Space Boots...');
        const spaceBoots = document.getElementById('space-boots-data');
        if (spaceBoots) {
          const shoesLayer = document.getElementById('shoes');
          const rightShoeLayer = document.getElementById('rightshoe');
          if (shoesLayer) {
            shoesLayer.style.display = 'none';
            shoesLayer.src = '';
          }
          if (rightShoeLayer) {
            rightShoeLayer.style.display = 'none';
            rightShoeLayer.src = '';
          }
          spaceBoots.classList.remove('equipped');
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

      // Handle dual cape system
      if (layerName === 'capes') {
        const capesaboveLayer = document.getElementById('capesabove');
        capesaboveLayer.style.display = "none";
        stopAnimation(capesaboveLayer);
        capesaboveLayer.src = "";
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

    if (bodyLayer) bodyLayer.style.filter = 'brightness(0)';
    if (legLayer) legLayer.style.filter = 'brightness(0)';
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

    // Shirts already supported: switch to invis variant when invis skin is active
    if (layerName === 'shirts' && isInvisSkinActive() && element.dataset.invisSrc) {
      actualSrc = element.dataset.invisSrc;
      actualScale = element.dataset.invisScale ?? actualScale;
      actualX = element.dataset.invisX ?? actualX;
      actualY = element.dataset.invisY ?? actualY;
    }

    // Shoes: support invis variant for slippers/etc. (and right shoe variants)
    if (layerName === 'shoes' && isInvisSkinActive() && element.dataset.invisSrc) {
      actualSrc = element.dataset.invisSrc;
      actualScale = element.dataset.invisScale ?? actualScale;
      actualX = element.dataset.invisX ?? actualX;
      actualY = element.dataset.invisY ?? actualY;
    }

    // Pants: support invis variant
    if (layerName === 'pants' && isInvisSkinActive() && element.dataset.invisSrc) {
      actualSrc = element.dataset.invisSrc;
      actualScale = element.dataset.invisScale ?? actualScale;
      actualX = element.dataset.invisX ?? actualX;
      actualY = element.dataset.invisY ?? actualY;
    }

    // Rocker Makeup variants: override source if Rocker is active and item has a variant
    // ONLY apply if invisible skin is NOT active (per user request)
    if (isRockerMakeupActive() && !isInvisSkinActive() && rockerVariants[actualSrc]) {
      console.log(`Applying Rocker variant for ${layerName}: ${actualSrc} -> ${rockerVariants[actualSrc]}`);
      actualSrc = rockerVariants[actualSrc];
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
    element.closest(".submenu").querySelectorAll("li")
      .forEach(li => li.classList.remove("equipped"));
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

  // Re-apply equipped filter if active to keep the list updated
  if (isFilterEquippedActive && typeof applyEquippedFilter === 'function') {
    applyEquippedFilter();
  }
}

function equipHat(imagePath, element) {
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
        const equippedEye = document.querySelector('#eyesMenu li.equipped');
        const eyeSrc = equippedEye ? (equippedEye.dataset.src || equippedEye.dataset.frames) : '';
        pupilLayer.style.opacity = (equippedEye && isEyeException(eyeSrc)) ? '1' : '0';
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
    try { renderInventory(); } catch (e) { }
    // Sync body parts after unequipped
    syncBodyParts();
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
  if (!force && !confirm('Are you sure you want to remove all clothing?')) return;

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

  if (isInvisActive) {
    if (invisBaseBtn) invisBaseBtn.classList.add('equipped');
  } else {
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
    "pets-back",
    "capes",
    "shirtsbehind",
    "base",
    "body",
    "leg",
    "feet",
    "head",
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
    'leg': { z: 11, order: 2 },
    'feet': { z: 11, order: 3 },
    'head': { z: 21, order: 4 },
    'shirts': { z: 22, order: 5 },
    'eyes': { z: 23, order: 6 },
    'pupil': { z: 23, order: 7 },
    'shoes': { z: 24, order: 8 },
    'rightshoe': { z: 24, order: 9 },
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
    'shirtstop': { z: 52, order: 20 },
    'pets': { z: 60, order: 21 },
    'shirtsbehind': { z: 2, order: 23 },
    'pets-back': { z: 1, order: 24 },
    'capes': { z: 1, order: 25 }
  };

  Object.entries(customOrder).forEach(([id, config]) => {
    const el = document.getElementById(id);
    if (el) {
      let finalZ = config.z;

      // SPECIAL OVERRIDE: Only Halloween Villain Knives (hand32) should be above arm (50) and sleeves (51, 52)
      if (id === 'hands') {
        if (el.src && el.src.includes('hand32')) {
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
      'platforms', 'pets-back', 'base', 'body', 'leg', 'feet', 'arm', 'pants', 'shirtsbehind', 'shirtstop',
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
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'character-set.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

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
    img.crossOrigin = 'anonymous';
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
      'spr_role_7.png'
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

// ==================== SAVE SLOT FUNCTIONALITY ====================

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
        if (img.id === 'platforms' || img.id === 'player-badge' || img.id === 'player-level' || img.id === 'player-name') return;

        const style = window.getComputedStyle(img);
        const zIndex = parseInt(style.zIndex || '0');
        const opacity = parseFloat(style.opacity || '1');
        if (opacity > 0) {
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

    if (width <= 0 || height <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (const imgData of imageData) {
      ctx.save();
      ctx.globalAlpha = imgData.opacity;

      // Position on the new small canvas
      const drawX = imgData.cx - allMinX;
      const drawY = imgData.cy - allMinY;

      ctx.translate(drawX, drawY);
      const t = imgData.transform;
      // We only apply the rotation part of the matrix if possible, 
      // but ctx.transform is more robust for general CSS transforms.
      ctx.transform(t.a, t.b, t.c, t.d, 0, 0);

      ctx.drawImage(imgData.image, -imgData.w / 2, -imgData.h / 2, imgData.w, imgData.h);
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
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

  // Generate preview image
  const previewImage = await generateSavePreview();

  const saveData = {
    overlayState: overlayState || '{}',
    previewImage: previewImage,
    timestamp: Date.now()
  };

  localStorage.setItem(`saveSlot${slotNumber}`, JSON.stringify(saveData));

  // Update slot visual
  updateSlotVisual(slotNumber, previewImage);

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

// Initialize slots on page load
window.addEventListener('DOMContentLoaded', () => {
  // Hard reset utility: visit ?reset=true to clear state
  if (window.location.search.includes('reset=true')) {
    localStorage.clear();
    window.location.href = window.location.pathname;
    return;
  }

  // Default: slightly smaller character on mobile so it feels less cramped
  if (!manualZoom) {
    if (window.innerWidth <= 600) {
      sceneScale = 0.85;
    } else {
      sceneScale = 1;
    }
  }

  applySceneScale();
  loadState();

  // Initialize with no slots if first time
  const allSlots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');
  if (allSlots.length === 0) {
    localStorage.setItem('saveSlotsList', JSON.stringify([]));
  }

  renderSaveSlots();
});

// Hide loading screen once everything is truly loaded
window.onload = function () {
  const loader = document.getElementById('loading-screen');
  if (loader) {
    // Increased delay to 3.6s as requested for a better cinematic introduction
    setTimeout(() => {
      loader.classList.add('fade-out');
    }, 3600);
  }

  // Private visitor tracking
  if (!sessionStorage.getItem('counted')) {
    fetch('https://api.counterapi.dev/v1/breaworlds-set-planner/visits/up')
      .then(() => sessionStorage.setItem('counted', 'true'))
      .catch(() => { /* silent fail to keep it invisible */ });
  }
};

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

    // Sync height to match the main platform image
    // We use offsetHeight to match the rendered size
    if (platformImg.offsetHeight > 0) {
      leftExtender.style.height = `${platformImg.offsetHeight}px`;
      rightExtender.style.height = `${platformImg.offsetHeight}px`;
    }
  } else {
    leftExtender.style.display = 'none';
    rightExtender.style.display = 'none';
  }
}

/**
 * Sorts all menu items within each submenu alphabetically based on their text content.
 */
function sortSubmenuItems() {
  document.querySelectorAll('.submenu').forEach(submenu => {
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
});
// Loading screen fade out with 3s minimum duration
const loadingStartTime = Date.now();
window.addEventListener('load', () => {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    const elapsed = Date.now() - loadingStartTime;
    const remaining = Math.max(0, 3000 - elapsed);

    setTimeout(() => {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 800);
    }, remaining);
  }
});
