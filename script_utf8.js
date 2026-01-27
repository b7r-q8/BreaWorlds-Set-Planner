
let inventory = [];
const MAX_SLOTS = 10;
let inventoryClickDebounce = false;

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
    platform: document.getElementById("platform-tiles")?.style.backgroundImage || '',
    inventory: inventory.map(item => ({
      type: item.type,
      src: item.src,
      icon: item.icon
    }))
  };

  // Save equipped items for each layer
  const layers = ['base', 'body', 'leg', 'feet', 'arm', 'shirtsbehind', 'head', 'pupil', 'hat', 'hair', 'headgears', 'shirtstop', 'eyes', 'faces', 'shirts', 'pants', 'shoes', 'rightshoe', 'hands', 'shirtsabove', 'capes', 'capesabove', 'wings', 'pets-back', 'cars', 'floaties', 'scarfs', 'pets'];
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
  if (!saved) return;

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

    // Restore platform
    if (state.platform) {
      // Platform state might be a CSS url() string or a plain src, handle both
      const pSrc = state.platform.replace('url("', '').replace('")', '').replace('url(', '').replace(')', '');
      setPlatform(pSrc, true);
    } else {
      setPlatform('platforms/platform1.png', true);
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
          headElement.src = itemData.src;
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

    // Hide body parts based on what's equipped
    if (state.equippedItems) {
      if (state.equippedItems['shoes']) {
        const feetLayer = document.getElementById('feet');
        if (feetLayer) feetLayer.style.display = 'none';
      }
      if (state.equippedItems['pants']) {
        const legLayer = document.getElementById('leg');
        if (legLayer) legLayer.style.display = 'none';
      }
      if (state.equippedItems['shirts']) {
        const bodyLayer = document.getElementById('body');
        if (bodyLayer) bodyLayer.style.display = 'none';
      }
      if (state.equippedItems['eyes']) {
        const pupilLayer = document.getElementById('pupil');
        if (pupilLayer) {
          if (isEyeException(state.equippedItems['eyes'].src)) {
            pupilLayer.style.display = 'block';
          } else {
            // Only hide if not overridden by a special outfit that wants it visible
            const shirtItem = state.equippedItems['shirts'];
            const isReaper = shirtItem && shirtItem.src && (shirtItem.src.includes('shirt63') || shirtItem.src.includes('shirt76'));
            const isNutcracker = shirtItem && shirtItem.src && shirtItem.src.includes('shirt24');

            if (!(isReaper || isNutcracker)) {
              pupilLayer.style.display = 'none';
            } else {
              pupilLayer.style.display = 'block';
            }
          }
        }
      }

      // Special handling for shirt 52 (ghost outfit) - hide pupil if equipped
      if (state.equippedItems['shirts']) {
        const shirtItem = state.equippedItems['shirts'];
        if (shirtItem.src && shirtItem.src.includes('shirt52')) {
          const pupilLayer = document.getElementById('pupil');
          if (pupilLayer) pupilLayer.style.display = 'none';

          ['arm', 'head', 'feet', 'leg'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
          });
        }
      }
    }

    // Save state once at the end to ensure everything is saved together
    saveState();
  } catch (e) {
    console.error('Error loading state:', e);
  }
}

// Helper function to find menu element by layer and src
function findMenuElementBySrc(layerName, src) {
  const allMenuItems = document.querySelectorAll('.submenu li');

  for (const item of allMenuItems) {
    if (layerName === 'hat') {
      if (item.dataset.hat === src) return item;
    } else {
      // Check for exact src match - also check outfits when looking for shirts
      if ((item.dataset.layer === layerName || (layerName === 'shirts' && item.dataset.layer === 'outfits')) && item.dataset.src === src) return item;

      // Also check for animated items by frames path
      if ((item.dataset.layer === layerName || (layerName === 'shirts' && item.dataset.layer === 'outfits')) && item.dataset.animated === 'true' && item.dataset.frames) {
        // Check if the saved src matches the frames path
        if (src === item.dataset.frames || src.startsWith(item.dataset.frames) || item.dataset.frames.startsWith(src)) {
          return item;
        }
      }
    }
  }

  return null;
}

// Helper function to find equipped menu element by checking equipped class
function findEquippedMenuElement(layerName) {
  const allMenuItems = document.querySelectorAll('.submenu li');

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
    if (sleeve && sleeve.style.display !== 'none') {
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

      // Apply Overrides from Hand (if any)
      if (useArmOverrides && overrideSleeveScale) finalScale = overrideSleeveScale;
      if (useArmOverrides && overrideSleeveX) finalX = parseFloat(overrideSleeveX);
      if (useArmOverrides && overrideSleeveY) finalY = parseFloat(overrideSleeveY);

      // Construct Transform String
      let transform = '';

      if (useVars && !useArmOverrides) {
        // If no shirt data AND no arm rotation, clear transform to let CSS handle it
        transform = '';
      } else {
        // If we have specific data OR rotation, we must build string
        const sScale = (useVars && !overrideSleeveScale) ? (sleeve.id === 'shirtsabove' ? 'var(--shirtsabove-scale)' : 'var(--arm-scale)') : finalScale;
        const sX = (useVars && !overrideSleeveX) ? (sleeve.id === 'shirtsabove' ? 'var(--shirtsabove-x)' : (useArmOverrides ? armXStr : 0)) : `${finalX}px`;
        const sY = (useVars && !overrideSleeveY) ? (sleeve.id === 'shirtsabove' ? 'var(--shirtsabove-y)' : (useArmOverrides ? armYStr : 0)) : `${finalY}px`;

        transform = `translateX(-50%) translate(${sX}, ${sY}) scale(${sScale})`;
        if (useArmOverrides) {
          transform += ` rotate(${armRot}deg)`;
        }
      }

      sleeve.style.transform = transform;
    }
  });
}

function addToInventory(item) {
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
  menu.style.display = menu.style.display === "block" ? "none" : "block";
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

function searchItems() {
  // Update search bar styling
  updateSearchBar();

  // Move creator text down and make it bigger on page load
  updateCreatorText({
    fontSize: '22px',
    marginBottom: '25px'  // Reverted back to 25px
  });

  const searchTerm = document.getElementById("menuSearch").value.toLowerCase();
  const allMenuItems = document.querySelectorAll(".menu-item");
  const allSubmenuItems = document.querySelectorAll(".submenu li");

  // Remove existing highlights
  document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));

  if (searchTerm.length === 0) {
    // Clear search - show all items
    allMenuItems.forEach(item => {
      item.style.display = "";
      item.classList.remove("highlight");
    });
    allSubmenuItems.forEach(item => {
      item.style.display = "";
      item.classList.remove("highlight");
    });
    return;
  }

  let firstMatch = null;

  // Open all submenus first to make all items searchable
  document.querySelectorAll('.submenu').forEach(submenu => {
    submenu.style.display = "block";
  });

  // Search main menu items - hide all categories
  allMenuItems.forEach(item => {
    item.style.display = "none";
    item.classList.remove("highlight");
  });

  // Search submenu items (now all are visible)
  allSubmenuItems.forEach(item => {
    const text = item.textContent.toLowerCase();
    const isMatch = text.includes(searchTerm);

    if (isMatch) {
      item.style.display = "";
      item.classList.add("highlight");
      if (!firstMatch) {
        firstMatch = item;
      }
    } else {
      item.style.display = "none";
      item.classList.remove("highlight");
    }
  });

  // Scroll to first match
  if (firstMatch) {
    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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
  headElement.style.transform = "";
  headElement.style.opacity = "";

  const armElement = document.getElementById('arm');
  if (armElement) {
    armElement.style.display = 'block';
    armElement.src = "arm.png";
    armElement.style.opacity = "";
    armElement.style.transform = "";
  }

  // Restore body parts opacity
  const bodyParts = ['body', 'leg', 'feet', 'pupil'];
  bodyParts.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.style.opacity = "";
  });

  // Show base + head using the specials assets
  baseElement.style.display = "block";
  baseElement.src = "specials/base.png";

  headElement.style.display = "block";
  headElement.src = "specials/head.png";

  // Re-equip shirts with body variant (normal) if they have one
  // shirtsLayer already declared above
  if (shirtsLayer && shirtsLayer.style.display === 'block' && shirtsLayer.src) {
    // Find the currently equipped shirt menu item
    const equippedShirt = document.querySelector('#shirtsMenu li.equipped');
    if (equippedShirt && equippedShirt.dataset.invisSrc) {
      // Switch back to body variant manually
      shirtsLayer.src = equippedShirt.dataset.src;

      const normalScale = equippedShirt.dataset.scale ?? 1;
      const normalX = equippedShirt.dataset.x ?? 0;
      const normalY = equippedShirt.dataset.y ?? 0;

      shirtsLayer.style.transform = `
        translateX(-50%)
        translate(${normalX}px, ${normalY}px)
        scale(${normalScale})
      `;
    }
  }

  // Restore shoes to their normal variant when switching back to normal base
  const shoesLayer = document.getElementById('shoes');
  if (shoesLayer && shoesLayer.style.display === 'block') {
    const equippedShoe = document.querySelector('#shoesMenu li.equipped');
    if (equippedShoe && equippedShoe.dataset.invisSrc) {
      shoesLayer.src = equippedShoe.dataset.src || equippedShoe.dataset.rightSrc || '';

      const normalScaleS = equippedShoe.dataset.scale ?? 1;
      const normalXS = equippedShoe.dataset.x ?? 0;
      const normalYS = equippedShoe.dataset.y ?? 0;

      shoesLayer.style.transform = `
        translateX(-50%)
        translate(${normalXS}px, ${normalYS}px)
        scale(${normalScaleS})
      `;

      const rightShoeLayer = document.getElementById('rightshoe');
      if (rightShoeLayer) {
        rightShoeLayer.style.display = 'block';
        const rightSrc = equippedShoe.dataset.rightSrc ?? equippedShoe.dataset.src ?? '';
        rightShoeLayer.src = rightSrc;

        const rightScale = equippedShoe.dataset.rightScale ?? equippedShoe.dataset.scale ?? 1;
        const rightX = equippedShoe.dataset.rightX ?? equippedShoe.dataset.x ?? 0;
        const rightY = equippedShoe.dataset.rightY ?? equippedShoe.dataset.y ?? 0;

        rightShoeLayer.style.transform = `
          translateX(-50%)
          translate(${rightX}px, ${rightY}px)
          scale(${rightScale})
        `;
      }
    }
  }

  // Restore pants to their normal variant when switching back to normal base
  const pantsLayer = document.getElementById('pants');
  if (pantsLayer && pantsLayer.style.display === 'block') {
    const equippedPants = document.querySelector('#pantsMenu li.equipped');
    if (equippedPants && equippedPants.dataset.invisSrc) {
      pantsLayer.src = equippedPants.dataset.src || '';

      const normalScaleP = equippedPants.dataset.scale ?? 1;
      const normalXP = equippedPants.dataset.x ?? 0;
      const normalYP = equippedPants.dataset.y ?? 0;

      pantsLayer.style.transform = `
        translateX(-50%)
        translate(${normalXP}px, ${normalYP}px)
        scale(${normalScaleP})
      `;
    }
  }

  // Mark this specials entry as selected (visual only, no inventory)
  document.querySelectorAll("#specialsMenu li").forEach(li => li.classList.remove("equipped"));
  element.classList.add("equipped");

  enforceLayerOrder();
  overrideLayerOrder();

  // Custom Skate Check: Re-apply if switching back to normal character
  const carsLayer = document.getElementById('cars');
  if (carsLayer && carsLayer.style.display === 'block' && carsLayer.src.includes('skate.png')) {
    const baseElement = document.getElementById('base');
    const legElement = document.getElementById('leg');

    if (baseElement) baseElement.src = 'baseskate.png';
    if (legElement) legElement.src = 'legskate.png';
    carsLayer.style.zIndex = 1;
  }

  saveState();
}

// Helper function to check if invis skin is equipped
function isInvisSkinActive() {
  const headElement = document.getElementById('head');
  return headElement && headElement.src.includes('specials/invisibleskin.png');
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

  // Swap the head image to your carved invisibleskin sprite
  headElement.style.display = "block";
  headElement.src = "specials/invisibleskin.png";
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
  saveState();
}

// Helper function to check if an eye item should NOT hide base eyes (pupil)
function isEyeException(src) {
  if (!src) return false;
  // Ranges: faces 10-12, 14-15, 20-21, 27-59
  const match = src.match(/faces(\d+)/);
  if (match) {
    const num = parseInt(match[1]);
    return (num >= 10 && num <= 12) || (num === 14 || num === 15) || (num >= 20 && num <= 21) || (num >= 27 && num <= 59);
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
  if (layerName === 'cars') {
    const shoesLayer = document.getElementById('shoes');
    const rightShoeLayer = document.getElementById('rightshoe');
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
  if (layerName !== 'wings' && layerName !== 'capes' && layerName !== 'hands' && layerName !== 'shirts' && layerName !== 'outfits' && layerName !== 'pets') {
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
      const bodyLayer = document.getElementById('body');
      const armLayer = document.getElementById('arm');
      const headLayer = document.getElementById('head');
      const feetLayer = document.getElementById('feet');
      const legLayer = document.getElementById('leg');
      const pupilLayer = document.getElementById('pupil');
      if (bodyLayer) bodyLayer.style.display = 'block';
      if (armLayer) armLayer.style.display = 'block';
      if (headLayer) headLayer.style.display = 'block';
      if (feetLayer) feetLayer.style.display = 'block';
      if (legLayer) legLayer.style.display = 'block';
      if (pupilLayer) pupilLayer.style.display = 'block';

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

  console.log('DEBUG equipItem:', {
    layerName,
    shirtsLayerDisplay: shirtsLayer?.style.display,
    shirt52HasEquipped: (document.querySelector('[data-layer="outfits"][data-frames*="shirt52"]') || document.querySelector('[data-layer="shirts"][data-frames*="shirt52"]'))?.classList.contains('equipped'),
    isShirt52Equipped,
    isClickingShirt52,
    isPets,
    isEquippingShirtOrOutfit
  });

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

  if (isShirt52Equipped && isEquippingShirtOrOutfit && !isClickingShirt52 && !isPets) {
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

      // Restore all body parts
      const bodyLayer = document.getElementById('body');
      const armLayer = document.getElementById('arm');
      const headLayer = document.getElementById('head');
      const feetLayer = document.getElementById('feet');
      const legLayer = document.getElementById('leg');
      const pupilLayer = document.getElementById('pupil');
      if (bodyLayer) bodyLayer.style.display = 'block';
      if (armLayer) armLayer.style.display = 'block';
      if (headLayer) headLayer.style.display = 'block';
      if (feetLayer) feetLayer.style.display = 'block';
      if (legLayer) legLayer.style.display = 'block';
      if (pupilLayer) pupilLayer.style.display = 'block';

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
      // Static item - consider normal, invis, and right variants as equivalent
      const candidates = [];
      if (element.dataset.src) candidates.push(element.dataset.src);
      if (element.dataset.invisSrc) candidates.push(element.dataset.invisSrc);
      if (element.dataset.rightSrc) candidates.push(element.dataset.rightSrc);
      if (element.dataset.invisRightSrc) candidates.push(element.dataset.invisRightSrc);

      currentSrc = layer.src && candidates.some(c => c && layer.src.includes(c));
      console.log('Static item check (candidates):', { candidates, 'layer.src': layer.src, currentSrc });
    }

    if (currentSrc) {
      // Same item - unequip it
      // Check if we're unequipping shirt 52 BEFORE clearing the src
      const isUnequippingShirt52 = (layerName === 'shirts' || layerName === 'outfits') && layer.src && layer.src.includes('shirt52');

      layer.style.display = "none";
      stopAnimation(layer);
      layer.src = "";

      // Show corresponding body parts when unequipping items
      if (layerName === 'shoes') {
        const feetLayer = document.getElementById('feet');
        if (feetLayer) feetLayer.style.display = 'block';
      } else if (layerName === 'pants') {
        const legLayer = document.getElementById('leg');
        if (legLayer) legLayer.style.display = 'block';
        // Clear any temporary z-index override when pants are unequipped
        const pantsLayerReset = document.getElementById('pants');
        if (pantsLayerReset) pantsLayerReset.style.zIndex = '';
      } else if (layerName === 'shirts' || layerName === 'outfits') {
        const bodyLayer = document.getElementById('body');
        if (bodyLayer) bodyLayer.style.display = 'block';

        // Restore all body parts if unequipping shirt 52
        if (isUnequippingShirt52) {
          const armLayer = document.getElementById('arm');
          const headLayer = document.getElementById('head');
          const feetLayer = document.getElementById('feet');
          const legLayer = document.getElementById('leg');
          const pupilLayer = document.getElementById('pupil');
          if (armLayer) armLayer.style.display = 'block';
          if (headLayer) headLayer.style.display = 'block';
          if (feetLayer) feetLayer.style.display = 'block';
          if (legLayer) legLayer.style.display = 'block';
          if (pupilLayer) pupilLayer.style.display = 'block';
        }
      } else if (layerName === 'eyes') {
        const pupilLayer = document.getElementById('pupil');
        const headLayer = document.getElementById('head');
        if (pupilLayer) pupilLayer.style.display = 'block';
        // Restore Invis Skin head if it was hidden
        if (isInvisSkinActive() && headLayer) {
          headLayer.style.opacity = '1';
        }
      } else if (layerName === 'cars') {
        // When unequipping a car, restore the feet immediately
        const feetLayer = document.getElementById('feet');
        if (feetLayer) {
          feetLayer.style.display = 'block';
          feetLayer.style.opacity = '';
        }

        // Custom Skate Logic: Revert assets if unequipping cars
        const baseLayer = document.getElementById('base');
        const legLayer = document.getElementById('leg');
        if (baseLayer) baseLayer.src = isInvisSkinActive() ? 'specials/invisibleskin.png' : 'base.png';
        if (legLayer) legLayer.src = 'leg.png';
      } else if (layerName === 'faces') {
        // Revert body/leg filter if unequipping rocker makeup (faces4)
        const bodyLayer = document.getElementById('body');
        const legLayer = document.getElementById('leg');
        if (bodyLayer) bodyLayer.style.filter = '';
        if (legLayer) legLayer.style.filter = '';
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

      element.classList.remove("equipped");
      // Update inventory UI so the slot highlight is cleared when an item is unequipped
      try { renderInventory(); } catch (e) { }
      applyArmRotation(); // Ensure arm/sleeves reset when hand is removed
      saveState();
      return;
    } else {
      // Different item of same type - continue to equip new one (don't return)
    }
  }

  layer.style.display = "block";
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
    const carsLayer = document.getElementById('cars');
    if (carsLayer && carsLayer.style.display === 'block') {
      carsLayer.style.display = 'none';
      carsLayer.src = '';
      document.querySelectorAll('[data-layer="cars"]').forEach(item => item.classList.remove('equipped'));
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
      const layersToUnequip = ['hat', 'headgears', 'hair', 'faces', 'eyes', 'pants', 'shoes'];
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
      const armLayer = document.getElementById('arm');
      const headLayer = document.getElementById('head');
      const feetLayer = document.getElementById('feet');
      const legLayer = document.getElementById('leg');
      const pupilLayer = document.getElementById('pupil');
      if (armLayer) armLayer.style.display = 'none';
      if (headLayer) headLayer.style.display = 'none';
      if (feetLayer) feetLayer.style.display = 'none';
      if (legLayer) legLayer.style.display = 'none';
      if (pupilLayer) pupilLayer.style.display = 'none';

      // Unequip all other items (except pets - they can stay)
      const layersToUnequip = ['hat', 'hair', 'headgears', 'headgearsabove', 'eyes', 'faces', 'pants', 'shoes', 'hands', 'capes', 'wings'];
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
    const pupilLayer = document.getElementById('pupil');
    const headLayer = document.getElementById('head');
    const isInvis = isInvisSkinActive();

    if (pupilLayer) {
      if (isEyeException(src)) {
        pupilLayer.style.display = 'block';
        if (isInvis) pupilLayer.style.opacity = '1';
      } else {
        pupilLayer.style.display = 'none';
        if (isInvis) pupilLayer.style.opacity = '0';
      }
    }

    // Toggle Invis Skin head visibility based on eye exception
    if (isInvis && headLayer) {
      if (isEyeException(src)) {
        headLayer.style.opacity = '1';
      } else {
        headLayer.style.opacity = '0';
      }
    }
  }

  // If equipping faces4 (rocker makeup), turn body/leg black using CSS filter
  if (layerName === 'faces' && src.includes('faces4.png')) {
    const bodyLayer = document.getElementById('body');
    const legLayer = document.getElementById('leg');

    if (bodyLayer) bodyLayer.style.filter = 'brightness(0)';
    if (legLayer) legLayer.style.filter = 'brightness(0)';
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

    if (carsLayer) {
      if (isSkate) {
        carsLayer.style.zIndex = -1;
      } else {
        carsLayer.style.zIndex = '';
      }
    }
  }

  if (isAnimated) {
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

        if (outfitShoesLayer) {
          outfitShoesLayer.style.display = "block";
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
          outfitRightShoeLayer.style.display = "block";
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

  element.closest(".submenu").querySelectorAll("li")
    .forEach(li => li.classList.remove("equipped"));

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
      // Make sure head is visible when placing a headgear
      const headLayer = document.getElementById('head');
      if (headLayer) headLayer.style.display = 'block';
    }
  }

  saveState();
  enforceLayerOrder();
  overrideLayerOrder();

  // Custom Skate Logic (Z-Index and Asset Swap)
  // Must be after overrideLayerOrder to persist zIndex
  if (layerName === 'cars') {
    const carsLayer = document.getElementById('cars');
    const baseLayer = document.getElementById('base');
    const legLayer = document.getElementById('leg');

    if (src.includes('skate.png') || src.includes('dcirc.png') || src.includes('circ.png')) {
      if (carsLayer) carsLayer.style.zIndex = 1;
      if (baseLayer) baseLayer.src = 'baseskate.png';
      if (legLayer) legLayer.src = 'legskate.png';
    } else {
      // Revert if equipping non-skate car
      if (baseLayer) baseLayer.src = isInvisSkinActive() ? 'specials/invisibleskin.png' : 'base.png';
      if (legLayer) legLayer.src = 'leg.png';
    }
  }

  // Handle Arm Rotation and Positioning (and sync sleeves)
  // Replaced inline logic with helper call to ensure it runs for all updates
  applyArmRotation();

  // Refresh inventory UI so equipped items are highlighted
  try { renderInventory(); } catch (e) { /* ignore if renderInventory not ready */ }
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
    if (bodyLayer) bodyLayer.style.display = 'block';
    if (armLayer) armLayer.style.display = 'block';
    if (headLayer) headLayer.style.display = 'block';
    if (feetLayer) feetLayer.style.display = 'block';
    if (legLayer) legLayer.style.display = 'block';
    if (pupilLayer) pupilLayer.style.display = 'block';

    // Remove equipped class from reaper outfit
    if (reaperMenuItem) {
      reaperMenuItem.classList.remove('equipped');
    }
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

    // Restore all body parts
    const bodyLayer = document.getElementById('body');
    const armLayer = document.getElementById('arm');
    const headLayer = document.getElementById('head');
    const feetLayer = document.getElementById('feet');
    const legLayer = document.getElementById('leg');
    const pupilLayer = document.getElementById('pupil');
    if (bodyLayer) bodyLayer.style.display = 'block';
    if (armLayer) armLayer.style.display = 'block';
    if (headLayer) headLayer.style.display = 'block';
    if (feetLayer) feetLayer.style.display = 'block';
    if (legLayer) legLayer.style.display = 'block';
    if (pupilLayer) pupilLayer.style.display = 'block';

    // Remove equipped class from outfit/shirt menu items
    document.querySelectorAll('[data-layer="outfits"], [data-layer="shirts"]').forEach(item => {
      item.classList.remove('equipped');
    });
  }

  if (isSameHat) {
    hat.style.display = "none";
    stopAnimation(hat);
    hat.src = "";
    element.classList.remove("equipped");
    try { renderInventory(); } catch (e) { }
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

  saveState();
  enforceLayerOrder();
  overrideLayerOrder();
}

document.querySelectorAll(".submenu").forEach(submenu => {
  submenu.addEventListener("click", e => {
    const li = e.target.closest("li");
    if (!li) return;

    if (li.dataset.layer) equipItem(li);
    if (li.dataset.hat) equipHat(li.dataset.hat, li);
  });
});

// Save slots functionality
let savedSets = {};

// Load saved sets from localStorage
function loadSavedSets() {
  try {
    const saved = localStorage.getItem('overlaySavedSets');
    console.log('Loading from localStorage:', saved);
    if (saved && saved !== 'null' && saved !== 'undefined') {
      const parsed = JSON.parse(saved);
      console.log('Parsed saved sets:', parsed);
      if (parsed && typeof parsed === 'object') {
        savedSets = parsed;
        console.log('Loaded saved sets:', savedSets);
        // Render after DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => renderSavedSlots(), 200);
          });
        } else {
          setTimeout(() => renderSavedSlots(), 200);
        }
      }
    } else {
      console.log('No saved sets found in localStorage');
      savedSets = {};
    }
  } catch (error) {
    console.error('Error loading saved sets:', error);
    savedSets = {};
  }
}

// Save current set to a slot
function saveToSlot(slotNumber) {
  console.log('saveToSlot called for slot:', slotNumber);
  try {
    const state = captureCurrentState();
    console.log('Captured state:', state);

    // Ensure savedSets is an object
    if (!savedSets || typeof savedSets !== 'object') {
      savedSets = {};
    }

    savedSets[slotNumber] = state;

    // Save to localStorage with a different key to avoid conflicts
    const jsonString = JSON.stringify(savedSets);
    console.log('Saving to localStorage, JSON length:', jsonString.length);
    localStorage.setItem('overlaySavedSets', jsonString);

    // Verify it was saved
    const verify = localStorage.getItem('overlaySavedSets');
    if (verify) {
      console.log('Verified save successful');
    } else {
      console.error('Save verification failed!');
    }

    // Generate and display preview
    generatePreview(slotNumber, state);

    // Update the slot to show it has a preview
    const slot = document.querySelector(`.save-slot[data-slot="${slotNumber}"]`);
    if (slot) {
      slot.classList.add('has-preview');
    }

    console.log('Save complete for slot:', slotNumber);
  } catch (error) {
    console.error('Error saving to slot:', error);
    alert('Error saving set: ' + error.message);
  }
}

// Load a saved set
function loadFromSlot(slotNumber) {
  const saved = savedSets[slotNumber];
  if (!saved) return;

  // Clear current equipped items
  // Force restore body parts so switching from an invis slot shows pupils correctly
  unequipAll(true);

  // Restore base/head
  if (saved.base) {
    const baseElement = document.getElementById('base');
    const headElement = document.getElementById('head');
    if (saved.base === 'invis') {
      baseElement.src = "base.png";
      baseElement.style.opacity = "0";
      headElement.src = "specials/invisibleskin.png";

      const armElement = document.getElementById('arm');
      if (armElement) armElement.style.opacity = "0";

      document.querySelectorAll("#specialsMenu li").forEach(li => {
        if (li.textContent.includes("Invis Skin")) {
          li.classList.add("equipped");
        } else {
          li.classList.remove("equipped");
        }
      });
      // Hide body parts (match equipInvisCharacter behavior)
      ['body', 'leg', 'feet', 'pupil', 'arm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (id === 'pupil') {
            const eyeItem = saved.equippedItems['eyes'];
            if (eyeItem && isEyeException(eyeItem.src)) {
              el.style.opacity = '1';
            } else {
              el.style.opacity = '0';
            }
          } else {
            el.style.opacity = '0';
          }
        }
      });

      // Handle Invis Skin head visibility in loadFromSlot
      const eyeItem = saved.equippedItems['eyes'];
      if (headElement) {
        if (eyeItem && !isEyeException(eyeItem.src)) {
          headElement.style.opacity = "0";
        } else {
          headElement.style.opacity = "1";
        }
      }
    } else {
      baseElement.src = "specials/base.png";
      baseElement.style.opacity = "";
      headElement.src = "specials/head.png";
      headElement.style.opacity = "";

      const armElement = document.getElementById('arm');
      if (armElement) {
        armElement.src = "arm.png";
        armElement.style.opacity = "";
      }

      document.querySelectorAll("#specialsMenu li").forEach(li => {
        if (li.textContent.includes("Normal Base")) {
          li.classList.add("equipped");
        } else {
          li.classList.remove("equipped");
        }
      });
      // Ensure pupil and body parts are visible when loading a normal base
      ['body', 'leg', 'feet', 'pupil'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = 'block';
          el.style.opacity = '';
        }
      });
    }
    baseElement.style.display = "block";
    headElement.style.display = "block";
  }

  // Restore equipped items (excluding capesabove, handled separately)
  Object.keys(saved.equippedItems || {}).forEach(layerName => {
    if (layerName === 'capesabove') return; // Handle separately

    const itemData = saved.equippedItems[layerName];
    const menuElement = findMenuElementBySrc(layerName, itemData.src);

    if (menuElement) {
      if (layerName === 'hat') {
        equipHat(itemData.src, menuElement);
      } else {
        equipItem(menuElement);
      }

      // Apply saved transform
      const layer = document.getElementById(layerName);
      if (layer) {
        if (layerName === 'arm') {
          // Special handling for arm: use CSS variables + rotation
          // If we tracked custom armX/armY we could use them, but we didn't save them explicitly in captureCurrentState yet.
          // However, we saved 'rotation'.
          // Ideally we should have saved armX/armY if they were custom.
          // Since we rely on equipItem to set everything up usually, loadFromSlot is tricky.
          // But loadFromSlot is "equipping" items based on src.
          // It calls equipItem!
          // equipItem(menuElement) will re-read data-arm-x from the menu element!
          // So we just need to NOT override it with generic transform logic if it's the arm?
          // OR we need to apply the rotation from safe state if it matches?

          // Actually, `equipItem` sets the transform correctly including rotation/position.
          // Does `loadFromSlot` override it?
          // Yes: `layer.style.transform = ...` below overrides it.

          // If layer is arm, we should probably SKIP generic transform override 
          // UNLESS we want to support manual positioning drag/drop (which we don't have yet).
          // The saved state has x/y which are 0/0 for arm (unless we changed captureCurrentState logic to save NaN/0).

          // If we just skip transform override for arm, `equipItem` does the work.
          // But `loadFromSlot` calls `equipItem`.
        } else {
          layer.style.transform = `
            translateX(-50%)
            translate(${itemData.x}px, ${itemData.y}px)
            scale(${itemData.scale})
            rotate(${itemData.rotation || 0}deg)
          `;
        }


        // Restore animation if needed
        if (itemData.animated && itemData.framesPath) {
          startAnimation(layer, {
            framesPath: itemData.framesPath,
            frameCount: itemData.frameCount,
            fps: itemData.fps
          });
        }
      }
    }
  });

  // Restore capesabove separately
  if (saved.equippedItems['capesabove']) {
    const capesaboveLayer = document.getElementById('capesabove');
    const itemData = saved.equippedItems['capesabove'];
    if (capesaboveLayer && itemData) {
      capesaboveLayer.style.display = "block";
      capesaboveLayer.src = itemData.src;
      capesaboveLayer.style.transform = `
        translateX(-50%)
        translate(${itemData.x}px, ${itemData.y}px)
        scale(${itemData.scale})
      `;
    }
  }

  enforceLayerOrder();
  overrideLayerOrder();
  applyArmRotation();
  saveState();
}

// Capture current state for saving
function captureCurrentState() {
  const state = {
    equippedItems: {},
    base: null
  };

  // Check base/head state
  const baseElement = document.getElementById('base');
  const headElement = document.getElementById('head');
  if (baseElement.style.opacity === '0') {
    state.base = 'invis';
  } else {
    state.base = 'normal';
  }

  // Save equipped items for each layer (including outfit side-effects)
  const layers = [
    'hat', 'hair', 'headgears', 'headgearsabove', 'eyes', 'faces',
    'shirts', 'shirtsabove', 'shirtsbehind', 'shirtstop',
    'pants', 'shoes', 'rightshoe', 'outfitshoes', 'outfitrightshoe',
    'hands', 'arm', 'capes', 'capesabove', 'wings', 'cars', 'floaties',
    'scarfs', 'pets', 'pets-back'
  ];

  layers.forEach(layerName => {
    const layer = document.getElementById(layerName);
    if (layer && layer.style.display === 'block' && layer.src) {
      const menuElement = findEquippedMenuElement(layerName);

      let src = layer.src;
      let framesPath = undefined;
      let frameCount = undefined;
      let fps = undefined;
      const isAnimated = activeAnimations[layerName] ? true : false;

      // Try to get original data from menu element if available
      if (menuElement) {
        // Special handling for hats using data-hat
        const originalSrc = layerName === 'hat' ? menuElement.dataset.hat : menuElement.dataset.src;
        if (originalSrc) src = originalSrc;

        if (isAnimated && menuElement.dataset.animated === 'true') {
          framesPath = menuElement.dataset.frames;
          frameCount = Number(menuElement.dataset.frameCount);
          fps = Number(menuElement.dataset.fps) || 8;
        }
      } else {
        // No menu element (e.g. side-effect layer like outfitshoes), use DOM src
        // If animated but no menu element, we might lose animation data unless we store it elsewhere
        // But outfit side-effects usually aren't animated separately or share frames
        if (isAnimated) {
          // Try to recover animation data from activeAnimations? 
          // Implementation detail: activeAnimations stores interval ID, not data.
          // However, most outfit side-effects (shoes, hat) are static or handled by main outfit animation.
        }
      }

      const transform = layer.style.transform || '';
      const scaleMatch = transform.match(/scale\(([^)]+)\)/);
      const translateMatch = transform.match(/translate\(([^)]+)\)/);
      const rotateMatch = transform.match(/rotate\(([^)]+)deg\)/);

      const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
      const translate = translateMatch ? translateMatch[1].split(',').map(v => parseFloat(v.trim())) : [0, 0];
      const rotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;

      state.equippedItems[layerName] = {
        src: src,
        scale: scale,
        x: translate[0] || 0,
        y: translate[1] || 0,
        rotation: rotation,
        animated: isAnimated
      };

      if (isAnimated && framesPath) {
        state.equippedItems[layerName].framesPath = framesPath;
        state.equippedItems[layerName].frameCount = frameCount;
        state.equippedItems[layerName].fps = fps;
      }
    }
  });

  return state;
}

// Generate preview image for a saved set
function generatePreview(slotNumber, state) {
  console.log('generatePreview called for slot:', slotNumber, 'state:', state);
  const canvas = document.getElementById('previewCanvas');
  if (!canvas) {
    console.error('Preview canvas not found!');
    return;
  }

  const ctx = canvas.getContext('2d');

  // Set canvas size (matching character size)
  canvas.width = 300;
  canvas.height = 400;

  // Clear canvas with transparent background
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Layer order matching the actual rendering (Z-index simulation)
  // Low Z-index -> High Z-index
  const layerOrder = [
    'wings', 'pets-back', 'capes', 'shirtsbehind', 'base',
    'shoes', 'rightshoe', 'outfitshoes', 'outfitrightshoe', // Shoes/Legs
    'pants', // Pants
    'head', // Head (Z 11)
    'arm', // Arm (Z 15) - Added support
    'shirts', 'shirtstop', // Shirts (Z 12)
    'capesabove',
    'shirtsabove', 'faces', 'eyes', 'hands', 'hair',
    'headgears', 'hat', 'headgearsabove', // Hats/Headgear (High Z)
    'cars', 'floaties', 'scarfs', 'pets'
  ];

  const images = {};
  let imagesLoaded = 0;
  let imagesFailed = 0;

  // Count images to load
  let totalImages = 2; // base and head always
  layerOrder.forEach(layerName => {
    if (layerName !== 'base' && layerName !== 'head') {
      if (state.equippedItems[layerName]) {
        totalImages++;
      }
    }
  });

  console.log('Total images to load:', totalImages);

  function drawPreview() {
    console.log('Drawing preview, loaded:', imagesLoaded, 'failed:', imagesFailed);
    // Clear canvas with white background for visibility
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Drawing parameters matching CSS positioning
    const baseWrapperBottom = 300; // Position base near bottom
    const layerTop = 127; // Base Y position for layers (matching CSS)

    layerOrder.forEach(layerName => {
      if (layerName === 'base') {
        const img = images['base'];
        if (img && img.complete && img.width > 0) {
          try {
            ctx.save();
            const baseY = baseWrapperBottom;
            ctx.translate(canvas.width / 2, baseY);
            // Draw base (clipped to show only top half)
            ctx.beginPath();
            ctx.rect(-img.width / 2, -img.height * 0.496, img.width, img.height * 0.496);
            ctx.clip();
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            ctx.restore();
          } catch (e) {
            console.error('Error drawing base:', e);
          }
        }
      } else if (layerName === 'head') {
        const img = images['head'];
        if (img && img.complete && img.width > 0) {
          try {
            ctx.save();
            const headX = canvas.width / 2 - 17;
            const headY = 94.3;
            ctx.translate(headX, headY);
            ctx.scale(1.38, 1.38);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            ctx.restore();
          } catch (e) {
            console.error('Error drawing head:', e);
          }
        }
      } else if (layerName === 'arm') {
        // Special drawing for arm
        const img = images['arm'];
        // ARM: Check opacity
        let isVisible = true;
        if (state.equippedItems && state.equippedItems['arm'] && state.equippedItems['arm'].opacity === '0') {
          isVisible = false;
        }

        if (isVisible && img && img.complete && img.width > 0) {
          try {
            ctx.save();
            // Arm position (approximate based on CSS or manual tuning)
            // Base is centered. Arm is usually attached to body.
            // CSS for #arm: top: 202px; left: 50%; translate(-50%, -50%)?
            // Actually let's check basic #arm CSS if possible, but hardcoding for now based on base.
            // Base bottom is 300.
            const armX = canvas.width / 2 + 10; // Slightly offset?
            const armY = 200; // Guessing based on observation

            // If there's a transform string in state, parse it
            const transform = (state.equippedItems['arm'] && state.equippedItems['arm'].transform) || '';
            const rotateMatch = transform.match(/rotate\(([^)]+)deg\)/);
            const rotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;

            ctx.translate(canvas.width / 2, 213); // Approximate arm pivot/center
            // Adjust translation to match game logic if needed

            if (rotation) {
              ctx.rotate(rotation * Math.PI / 180);
            }

            // Scale/Draw
            // Arm might be scaled?
            ctx.drawImage(img, -img.width / 2, -img.height / 2);

            ctx.restore();
          } catch (e) {
            console.error('Error drawing arm:', e);
          }
        }
      } else if (state.equippedItems[layerName]) {
        const img = images[layerName];
        const itemData = state.equippedItems[layerName];

        if (img && img.complete && img.width > 0) {
          try {
            ctx.save();
            const centerX = canvas.width / 2;
            const centerY = layerTop;

            ctx.translate(centerX + itemData.x, centerY + itemData.y);
            // Apply rotation if it exists
            if (itemData.rotation) {
              ctx.rotate(itemData.rotation * Math.PI / 180);
            }
            ctx.scale(itemData.scale, itemData.scale);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            ctx.restore();
          } catch (e) {
            console.error(`Error drawing ${layerName}:`, e);
          }
        }
      }
    });

    // Convert to data URL and display
    try {
      const dataUrl = canvas.toDataURL('image/png');
      console.log('Preview generated, data URL length:', dataUrl.length);
      if (dataUrl && dataUrl.length > 100) {
        renderPreviewToSlot(slotNumber, dataUrl);
      } else {
        console.error('Preview data URL is too short or invalid');
      }
    } catch (e) {
      console.error('Error converting canvas to data URL:', e);
    }
  }

  function imageLoaded() {
    imagesLoaded++;
    console.log('Image loaded:', imagesLoaded, '/', totalImages);
    if (imagesLoaded + imagesFailed >= totalImages) {
      setTimeout(drawPreview, 100); // Small delay to ensure all images are ready
    }
  }

  function imageFailed(src) {
    imagesFailed++;
    console.warn('Image failed to load:', src);
    if (imagesLoaded + imagesFailed >= totalImages) {
      setTimeout(drawPreview, 100);
    }
  }

  // Load base image
  const baseImg = new Image();
  baseImg.onload = () => {
    images['base'] = baseImg;
    imageLoaded();
  };
  baseImg.onerror = () => imageFailed(baseImg.src);
  baseImg.src = state.base === 'invis' ? 'base.png' : 'specials/base.png';

  // Load head image
  const headImg = new Image();
  headImg.onload = () => {
    images['head'] = headImg;
    imageLoaded();
  };
  headImg.onerror = () => imageFailed(headImg.src);
  headImg.src = state.base === 'invis' ? 'specials/invisibleskin.png' : 'specials/head.png';

  // Load equipped items
  Object.keys(state.equippedItems).forEach(layerName => {
    if (layerName === 'capesabove') return; // Handle separately

    const itemData = state.equippedItems[layerName];
    const img = new Image();

    img.onload = () => {
      images[layerName] = img;
      imageLoaded();
    };
    img.onerror = () => imageFailed(img.src);

    // Use first frame for animated items
    if (itemData.animated && itemData.framesPath) {
      img.src = `${itemData.framesPath}1.png`;
    } else {
      img.src = itemData.src;
    }
  });

  // Load capesabove if exists
  if (state.equippedItems['capesabove']) {
    const capesaboveImg = new Image();
    capesaboveImg.onload = () => {
      images['capesabove'] = capesaboveImg;
      imageLoaded();
    };
    capesaboveImg.onerror = () => imageFailed(capesaboveImg.src);
    capesaboveImg.src = state.equippedItems['capesabove'].src;
  }
}


// ==================== PLATFORM MANAGEMENT ====================
// Robust mobile Safari/iOS detection
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

window.setPlatform = function (src, skipSave = false) {
    const platformImg = document.getElementById("platform-img");
    if (!platformImg) {
        console.error("Platform img element not found");
        return;
    }

    const isMobile = window.isMobileSafari();
    console.log("Platform rendering - Mobile:", isMobile, "Source:", src);

    if (isMobile) {
        // MOBILE: Canvas rendering with all CSS backgrounds cleared
        window.generatePlatformImage(src).then(dataUrl => {
            // Clear all CSS backgrounds completely
            platformImg.style.background = 'none';
            platformImg.style.backgroundImage = 'none';
            platformImg.style.backgroundRepeat = '';
            platformImg.style.backgroundSize = '';
            // Set canvas image as src
            platformImg.src = dataUrl;
            platformImg.style.objectFit = 'cover';
            platformImg.style.objectPosition = 'center bottom';

            console.log("Mobile platform rendered with canvas");

            if (!skipSave) {
                saveState();
            }
        }).catch(err => {
            console.error("Platform canvas rendering error:", err);
            // Fallback to CSS
            platformImg.style.background = 'none';
            platformImg.style.backgroundImage = `url("${src}")`;
            platformImg.style.backgroundRepeat = 'repeat-x';
            platformImg.style.backgroundSize = 'auto 256px';
            platform.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        });
    } else {
        // DESKTOP: CSS background only, transparent img
        platformImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        platformImg.style.objectFit = 'fill';
        platformImg.style.background = `url("${src}") repeat-x center bottom / auto 256px`;
        platformImg.style.backgroundImage = '';

        console.log("Desktop platform rendered with CSS");

        if (!skipSave) {
            saveState();
        }
    }
};

// Initialize platform on load
function initializePlatform() {
    const platformImg = document.getElementById("platform-img");
    if (platformImg && (!platformImg.src || platformImg.src === window.location.href)) {
        console.log("Initializing platform");
        window.setPlatform("platforms/platform1.png", true);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePlatform);
} else {
    initializePlatform();
}


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

  if (!skipSave) {
    saveState();
  }
}
window.unequipAll = function (forceRestore = false) {
  // Stop animations
  Object.values(activeAnimations).forEach(interval => clearInterval(interval));
  activeAnimations = {};

  // Remove equipped highlight in menu (but keep special skins highlighted)
  document.querySelectorAll(".submenu li")
    .forEach(li => {
      // Don't remove equipped class from special menu items
      if (!li.closest('#specialsMenu')) {
        li.classList.remove("equipped");
      }
    });

  // Hide all character layers (BUT KEEP INVENTORY)
  const layers = [
    'hat', 'hair', 'headgears', 'headgearsabove', 'shirtstop', 'shirtsbehind', 'eyes', 'faces',
    'shirts', 'shirtsabove', 'pants', 'shoes', 'rightshoe', 'hands',
    'capes', 'capesabove', 'wings', 'cars', 'floaties', 'scarfs', 'pets', 'pets-back'
  ];

  layers.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.src = '';
    el.style.display = 'none';
  });

  // Also clear any outfit-specific shoe layers
  ['outfitshoes', 'outfitrightshoe'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.src = '';
    el.style.display = 'none';
  });

  // Show all body parts when everything is unequipped (unless invis skin is active)
  const bodyParts = ['body', 'leg', 'feet', 'pupil', 'arm', 'head'];
  const armElement = document.getElementById('arm');

  if (!isInvisSkinActive() || forceRestore) {
    bodyParts.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'block';
        el.style.opacity = '';
      }
    });

    // Also restore arm visibility and head visibility
    if (armElement) {
      armElement.style.opacity = "";
    }
    const headElement = document.getElementById('head');
    if (headElement) {
      headElement.style.opacity = "";
    }
  } else {
    // Invis skin is active - ensure the head layer (invisibleskin.png) is visible
    const headElement = document.getElementById('head');
    if (headElement) {
      headElement.style.opacity = "1";
    }
    // Pupils stay hidden for invis skin by default when naked
    const pupilElement = document.getElementById('pupil');
    if (pupilElement) {
      pupilElement.style.opacity = "0";
    }
  }

  // Reset arm rotation/position by recalculating based on (now missing) equipped items
  applyArmRotation();

  saveState();

  // Refresh inventory UI so any green highlights are cleared
  try { renderInventory(); } catch (e) { /* ignore if not ready */ }
}
function enforceLayerOrder() {
  const wrapper = document.querySelector(".base-wrapper");

  const order = [
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
    "hair",
    "capesabove",
    "hat",
    "faces",
    "headgears",
    "headgearsabove",
    "floaties",
    "cars",
    "hands",
    "arm",
    "pets",
    "shirtsabove",
    "shirtstop",
    "cars",
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
  const characterScene = document.querySelector('.character-scene');

  if (!characterScene) {
    alert('Character not found!');
    return;
  }

  try {
    // Get all visible character layers in z-index order
    const layers = ['base', 'body', 'leg', 'feet', 'arm', 'pants', 'shirtsbehind', 'shirtstop', 'head', 'pupil', 'shoes', 'rightshoe', 'shirts', 'eyes', 'hair', 'faces', 'hands', 'shirtsabove', 'capesabove', 'headgears', 'hat', 'capes', 'wings', 'cars', 'floaties', 'scarfs', 'pets'];
    const visibleImages = [];

    layers.forEach(layerId => {
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

    // Temporarily disable scene scaling to get accurate measurements
    const originalTransform = characterScene.style.transform;
    characterScene.style.transform = 'scale(1)';

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
        h: item.element.offsetHeight
      });
    }

    // Restore character scene scale
    characterScene.style.transform = originalTransform;

    // Calculate character bounds FIRST to find the center
    const bodyImg = imageData.find(i => i.image.src.includes('body.png'));
    let centerX;
    if (bodyImg) {
      centerX = bodyImg.cx;
    } else {
      const minX = Math.min(...imageData.map(i => i.minX));
      const maxX = Math.max(...imageData.map(i => i.maxX));
      centerX = (minX + maxX) / 2;
    }

    const charMinX = Math.min(...imageData.map(i => i.minX));
    const charMaxX = Math.max(...imageData.map(i => i.maxX));
    const maxRadius = Math.max(centerX - charMinX, charMaxX - centerX);

    let allMinX = centerX - maxRadius;
    let allMaxX = centerX + maxRadius;
    let allMinY = Math.min(...imageData.map(i => i.minY));
    let allMaxY = Math.max(...imageData.map(i => i.maxY));

    // Get platform position if needed and constrain it
    let platformData = null;
    if (includePlatform) {
      const platformTiles = document.getElementById('platform-tiles');
      if (platformTiles) {
        const platformRect = platformTiles.getBoundingClientRect();
        const platformBgImage = window.getComputedStyle(platformTiles).backgroundImage;
        if (platformBgImage && platformBgImage !== 'none') {
          // Constrain platform width based on the symmetrical character bounds + padding
          const padding = 200;
          allMinX -= padding;
          allMaxX += padding;

          platformData = {
            minX: platformRect.left - sceneRect.left,
            maxX: platformRect.right - sceneRect.left,
            top: platformRect.top - sceneRect.top,
            bottom: platformRect.bottom - sceneRect.top,
            height: platformRect.height,
            backgroundImage: platformBgImage
          };

          // Limit platform overlap to the final canvas area
          platformData.drawMinX = Math.max(platformData.minX, allMinX);
          platformData.drawMaxX = Math.min(platformData.maxX, allMaxX);

          allMinY = Math.min(allMinY, platformData.top);
          allMaxY = Math.max(allMaxY, platformData.bottom - 100);
        }
      }
    }

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

    // Draw platform
    if (platformData) {
      const platformUrl = platformData.backgroundImage.replace(/url\(['"]?(.+?)['"]?\)/i, '$1');
      try {
        const platformImg = await loadImage(platformUrl);
        const pX = platformData.drawMinX - allMinX;
        const pY = platformData.top - allMinY;
        const pW = platformData.drawMaxX - platformData.drawMinX;
        const pH = platformData.height;

        const tileHeight = pH;
        const tileWidth = (platformImg.width / platformImg.height) * tileHeight;

        for (let x = pX; x < pX + pW; x += tileWidth) {
          ctx.drawImage(platformImg, x, pY, tileWidth, tileHeight);
        }
      } catch (e) {
        console.warn('Failed to load platform:', e);
      }
    }

    // Draw character layers with rotation
    for (const imgData of imageData) {
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

    // Download
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'character-set.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.closeDownloadModal();
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

    // Collect visible layers
    layers.forEach(img => {
      if (img.style.display !== 'none' && img.src && img.complete) {
        const style = window.getComputedStyle(img);
        const zIndex = parseInt(style.zIndex) || 0;
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

    const originalTransform = characterScene.style.transform;
    characterScene.style.transform = 'scale(1)';

    const imageData = [];
    const sceneRect = characterScene.getBoundingClientRect();

    for (const item of loadedImages) {
      const rect = item.element.getBoundingClientRect();
      const transform = getTransform(item.element);
      const cx = rect.left + rect.width / 2 - sceneRect.left;
      const cy = rect.top + rect.height / 2 - sceneRect.top;

      imageData.push({
        image: item.image,
        minX: rect.left - sceneRect.left,
        minY: rect.top - sceneRect.top,
        maxX: rect.right - sceneRect.left,
        maxY: rect.bottom - sceneRect.top,
        cx, cy, opacity: item.opacity, transform,
        w: item.element.offsetWidth,
        h: item.element.offsetHeight
      });
    }

    characterScene.style.transform = originalTransform;

    // Calculate character bounds FIRST to find the center
    const bodyImg = imageData.find(i => i.image.src.includes('body.png'));
    let centerX;
    if (bodyImg) {
      centerX = bodyImg.cx;
    } else {
      const minX = Math.min(...imageData.map(i => i.minX));
      const maxX = Math.max(...imageData.map(i => i.maxX));
      centerX = (minX + maxX) / 2;
    }

    const charMinX = Math.min(...imageData.map(i => i.minX));
    const charMaxX = Math.max(...imageData.map(i => i.maxX));
    const maxRadius = Math.max(centerX - charMinX, charMaxX - centerX);

    // Use a small padding for previews too
    const previewPadding = 10;
    const allMinX = centerX - maxRadius - previewPadding;
    const allMaxX = centerX + maxRadius + previewPadding;
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
      const drawInfoCX = imgData.cx - allMinX;
      const drawInfoCY = imgData.cy - allMinY;

      ctx.translate(drawInfoCX, drawInfoCY);
      const t = imgData.transform;
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
    playerOptions: playerOptions || '{}',
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

    // First, completely clear the current character to avoid conflicts
    // Force restore body parts so loading a slot from an invis state works correctly
    unequipAll(true);

    // Restore overlay state by saving it to localStorage and calling loadState
    if (saveData.overlayState) {
      localStorage.setItem('overlayState', saveData.overlayState);
      // Use the existing loadState function to properly restore everything
      loadState();
    }

    // Restore player options
    if (saveData.playerOptions) {
      localStorage.setItem('playerOptions', saveData.playerOptions);
      const options = JSON.parse(saveData.playerOptions);

      // Apply player name
      const playerNameDiv = document.getElementById('player-name');
      if (options.name) {
        playerNameDiv.textContent = options.name;
        playerNameDiv.style.display = 'block';
      } else {
        playerNameDiv.style.display = 'none';
      }

      // Apply player color
      if (options.color) {
        const color = options.color;
        if (color === 'rainbow') {
          playerNameDiv.style.animation = 'rainbow-fade 45s linear infinite';
          playerNameDiv.style.background = 'none';
          playerNameDiv.style.webkitTextFillColor = 'unset';
          playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
          playerNameDiv.style.filter = 'none';
        } else if (color === 'diamond') {
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.background = 'linear-gradient(135deg, #C0C0C0 0%, #F0F0F0 50%, #C0C0C0 100%)';
          playerNameDiv.style.backgroundClip = 'text';
          playerNameDiv.style.webkitBackgroundClip = 'text';
          playerNameDiv.style.webkitTextFillColor = 'transparent';
          playerNameDiv.style.color = 'transparent';
          playerNameDiv.style.textShadow = 'none';
          playerNameDiv.style.filter = 'drop-shadow(4px 6px 0px rgba(0, 0, 0, 1)) drop-shadow(0px 4px 2px rgba(0, 0, 0, 0.9))';
        } else if (color.startsWith('gradient')) {
          const gradientMap = {
            'gradient1': 'linear-gradient(180deg, #0c3bf6 0%, #fe0065 100%)',
            'gradient2': 'linear-gradient(180deg, #517dfd 0%, #ff4f96 100%)',
            'gradient3': 'linear-gradient(180deg, #fefb1d 0%, #fefeda 50%, #fea700 100%)'
          };
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.background = gradientMap[color];
          playerNameDiv.style.backgroundClip = 'text';
          playerNameDiv.style.webkitBackgroundClip = 'text';
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
          playerNameDiv.style.animation = 'none';
          playerNameDiv.style.color = colorMap[color] || '#FFFFFF';
          playerNameDiv.style.background = 'none';
          playerNameDiv.style.webkitTextFillColor = 'unset';
          playerNameDiv.style.textShadow = '4px 6px 0px rgba(0, 0, 0, 1), 0px 4px 2px rgba(0, 0, 0, 0.9)';
          playerNameDiv.style.filter = 'none';
        }
      }

      // Apply player level
      const playerLevelImg = document.getElementById('player-level');
      if (options.level) {
        playerLevelImg.src = options.level;
        playerLevelImg.style.display = 'block';
      } else {
        playerLevelImg.style.display = 'none';
      }

      // Apply player badge
      const playerBadgeImg = document.getElementById('player-badge');
      if (options.badge) {
        playerBadgeImg.src = options.badge;
        playerBadgeImg.style.display = 'block';
      } else {
        playerBadgeImg.style.display = 'none';
      }
    }

    // Visual feedback
    const slot = document.querySelector(`.save-slot[data-slot="${slotNumber}"]`);
    if (slot) {
      const originalBorder = slot.style.borderColor;
      slot.style.borderColor = 'rgba(100, 255, 255, 1)';
      setTimeout(() => {
        slot.style.borderColor = originalBorder;
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
};

// ==================== TOP DRAWER MENU ====================
window.toggleTopDrawer = function () {
  const drawer = document.getElementById('top-drawer');
  drawer.classList.toggle('open');
};
