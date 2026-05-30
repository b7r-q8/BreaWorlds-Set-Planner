/* ============================================================
   THUMBNAIL MAKER  –  Full rewrite with ported old features
   ============================================================ */
(function () {
  'use strict';

  // ─────────── canvas quality multiplier ───────────
  // Renders the workspace at TM_QUALITY× internal resolution for sharper live preview.
  // All object coordinates stay in the original 1280×720 logical space.
  const TM_QUALITY = 2;

  // Get logical center coordinates of the workspace
  function tmGetLogicalWorkspaceCenter(objWidth, objHeight) {
    const activeBtn = document.querySelector('.tm-res-btn.active');
    let resType = activeBtn ? activeBtn.getAttribute('data-res') : 'youtube';
    let w = 1280;
    let h = 720;
    if (resType === 'instagram') { w = 720; h = 720; }
    else if (resType === 'tiktok') { w = 405; h = 720; }
    else if (resType === 'insta-portrait') { w = 576; h = 720; }

    return {
      x: w / 2 - (objWidth || 0) / 2,
      y: h / 2 - (objHeight || 0) / 2
    };
  }

  // ───────── character layer constants (unchanged) ─────────
  const HEAD_LAYERS = [
    'head', 'pupil', 'headgears', 'headgearsabove',
    'hair', 'eyes', 'faces', 'hat',
    'djc-head', 'njc-head', 'shirtstop'
  ];
  const ARM_LAYERS = ['arm', 'hands', 'shirtsabove', 'djc-right-arm', 'njc-right-arm'];
  const CLOTHING_ABOVE_HEAD = ['shirts', 'pants', 'scarfs'];
  const BODY_LAYERS = [
    'base', 'body', 'leg', 'feet',
    'shirtsbehind', 'outfitshoes', 'outfitrightshoe',
    'shoes', 'rightshoe', 'capes', 'capesabove',
    'floaties', 'cars', 'pets', 'pets-back', 'wings', 'backpacks', 'necklaces',
    'djc-body', 'djc-left-leg', 'djc-right-leg',
    'njc-body', 'njc-left-leg', 'njc-right-leg'
  ];
  const SKIN_TINT_PARTS = ['base', 'body', 'arm', 'leg', 'feet', 'head'];

  const Z_ORDER = {
    'platforms': 1, 'base': 10, 'body': 11, 'diaperbody': 12, 'leg': 11, 'diaperleg': 12, 'feet': 11,
    'outfitshoes': 11, 'outfitrightshoe': 11, 'shoes': 11, 'rightshoe': 11,
    'head': 19, 'shirts': 22, 'eyes': 23, 'pupil': 20, 'pants': 25, 'hair': 26,
    'capesabove': 28, 'hat': 27, 'faces': 29, 'headgears': 30, 'headgearsabove': 31,
    'floaties': 39, 'cars': 40, 'hands': 49, 'arm': 50, 'shirtsabove': 51,
    'shirtstop': 48, 'pets': 60, 'shirtsbehind': 2, 'pets-back': 1, 'capes': 1,
    'scarfs': 24, 'wings': 1, 'backpacks': 1, 'necklaces': 1,
    'djc-body': 11, 'djc-head': 19, 'djc-left-leg': 11, 'djc-right-leg': 11, 'djc-right-arm': 50,
    'njc-body': 11, 'njc-head': 19, 'njc-left-leg': 11, 'njc-right-leg': 11, 'njc-right-arm': 50
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€ item submenu constants (from old) â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const TM_ITEM_SUBMENU_IDS = [
    'specialsMenu', 'outfitsMenu', 'hatsMenu', 'hairMenu', 'facesMenu',
    'eyesMenu', 'wingsMenu', 'capesMenu', 'shirtsMenu', 'pantsMenu',
    'handsMenu', 'shoesMenu', 'petsMenu', 'carsMenu', 'floatiesMenu', 'scarfsMenu'
  ];
  const TM_ITEM_SUBMENU_TITLES = {
    specialsMenu: 'Specials', outfitsMenu: 'Outfits', hatsMenu: 'Hats & masks',
    hairMenu: 'Hair', facesMenu: 'Faces', eyesMenu: 'Eyes', wingsMenu: 'Wings',
    capesMenu: 'Capes', shirtsMenu: 'Shirts', pantsMenu: 'Pants', handsMenu: 'Hands',
    shoesMenu: 'Shoes', petsMenu: 'Pets', carsMenu: 'Cars', floatiesMenu: 'Floaties',
    scarfsMenu: 'Scarfs'
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€ state â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const tmState = {
    objects: [],
    selectedId: null,
    selectedIds: [],
    nextId: 1,
    selectedExpression: null,
    expandedGroups: {},   // id -> bool, for collapsible layers
    initialized: false,
    isPinchScaling: false,
    vignetteEnabled: false,
    vignetteIntensity: 0.55
  };

  // --- UNDO / REDO / AUTO-SAVE & RECONSTRUCTION ---
  const tmUndoStack = [];
  const tmRedoStack = [];
  const TM_MAX_HISTORY = 40;

  function tmCaptureStateSnapshot() {
    const objects = tmState.objects.map(obj => {
      const clone = Object.assign({}, obj);
      delete clone.el;
      delete clone.contentEl;
      if (clone.data) {
        clone.data = JSON.parse(JSON.stringify(clone.data));
      }
      if (clone.pivots) {
        clone.pivots = Object.assign({}, clone.pivots);
      }
      if (obj.type === 'character' && obj.el) {
        clone.childOrder = tmGetCharacterChildOrder(obj.el);
      }
      return clone;
    });
    return {
      objects: objects,
      vignetteEnabled: tmState.vignetteEnabled,
      vignetteIntensity: tmState.vignetteIntensity
    };
  }

  function tmGetCharacterChildOrder(charEl) {
    const contentEl = charEl.querySelector(':scope > .tm-object-content');
    if (!contentEl) {
      const wrapper = charEl.querySelector('.tm-char-wrapper');
      if (!wrapper) return [];
      return Array.from(wrapper.children).map(child => {
        if (child.classList.contains('tm-base-arm-group')) return 'base-arm';
        if (child.classList.contains('tm-rest-group')) return 'rest';
        if (child.classList.contains('tm-head-group')) return 'head';
        if (child.classList.contains('tm-capesabove-group')) return 'capes-above';
        if (child.classList.contains('tm-arm-group')) return 'arm';
        return null;
      }).filter(Boolean);
    }

    const order = [];
    Array.from(contentEl.children).forEach(child => {
      if (child.classList.contains('tm-char-wrapper')) {
        Array.from(child.children).forEach(subChild => {
          if (subChild.classList.contains('tm-base-arm-group')) order.push('base-arm');
          else if (subChild.classList.contains('tm-rest-group')) order.push('rest');
          else if (subChild.classList.contains('tm-head-group')) order.push('head');
          else if (subChild.classList.contains('tm-capesabove-group')) order.push('capes-above');
          else if (subChild.classList.contains('tm-arm-group')) order.push('arm');
        });
      } else if (child.classList.contains('tm-object') && child.dataset.id) {
        order.push(child.dataset.id);
      }
    });
    return order;
  }

  window.tmPushHistoryState = function () {
    const snapshot = tmCaptureStateSnapshot();
    tmUndoStack.push(snapshot);
    if (tmUndoStack.length > TM_MAX_HISTORY) {
      tmUndoStack.shift();
    }
    tmRedoStack.length = 0; // Clear redo on action
    updateUndoRedoUI();
    tmAutoSaveWorkspace();
  };

  window.tmUndo = function () {
    if (tmUndoStack.length === 0) return;
    const current = tmCaptureStateSnapshot();
    tmRedoStack.push(current);
    const prev = tmUndoStack.pop();
    tmRestoreStateFromSnapshot(prev);
    tmAutoSaveWorkspace();
  };

  window.tmRedo = function () {
    if (tmRedoStack.length === 0) return;
    const current = tmCaptureStateSnapshot();
    tmUndoStack.push(current);
    const next = tmRedoStack.pop();
    tmRestoreStateFromSnapshot(next);
    tmAutoSaveWorkspace();
  };

  function updateUndoRedoUI() {
    const undoBtn = document.getElementById('tm-undo-btn');
    const redoBtn = document.getElementById('tm-redo-btn');
    if (undoBtn) undoBtn.disabled = tmUndoStack.length === 0;
    if (redoBtn) redoBtn.disabled = tmRedoStack.length === 0;
  }

  function tmRestoreStateFromSnapshot(snapshot) {
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;

    let objectsData = [];
    if (snapshot && !Array.isArray(snapshot)) {
      objectsData = snapshot.objects || [];
      tmState.vignetteEnabled = !!snapshot.vignetteEnabled;
      tmState.vignetteIntensity = snapshot.vignetteIntensity !== undefined ? snapshot.vignetteIntensity : 0.55;
    } else {
      objectsData = snapshot || [];
    }

    // Deselect current
    tmDeselect();

    // Remove old elements
    tmState.objects.forEach(obj => {
      if (obj.el) obj.el.remove();
    });

    tmState.objects = [];
    tmState.selectedId = null;

    // 1. Rebuild every DOM element flat first
    objectsData.forEach(objData => {
      const el = tmRebuildObjectDOM(objData);
      objData.el = el;
      tmState.objects.push(objData);
    });

    // 2. Establish parent-child DOM hierarchy
    tmState.objects.forEach(obj => {
      if (obj.parentId) {
        const parent = getObj(obj.parentId);
        if (parent && parent.el) {
          const targetParent = tmGetContentParent(parent.el);
          if (targetParent) {
            targetParent.appendChild(obj.el);
          } else {
            parent.el.appendChild(obj.el);
          }
        } else {
          obj.parentId = null;
          ws.appendChild(obj.el);
        }
      } else {
        ws.appendChild(obj.el);
      }
    });

    // 2.5 Reorder character children according to stored childOrder snapshots
    tmState.objects.forEach(obj => {
      if (obj.type === 'character') {
        tmEnforceCharacterDOM(obj);
        tmEnforceCharacterChildrenZIndex(obj.el);
      }
    });

    // Toggle active theme class on workspace
    const hasTheme = tmState.objects.some(o => o.isTheme);
    if (hasTheme) {
      ws.classList.add('tm-theme-active');
    } else {
      ws.classList.remove('tm-theme-active');
    }

    // 3. Apply transforms and setup dragging for all
    tmState.objects.forEach(obj => {
      applyTransform(obj);
      setupDrag(obj.el, obj);
      if (obj.type === 'character') {
        tmEnforceCharacterChildrenZIndex(obj.el);
      }
    });

    tmRenderLayersPanel();
    updateUndoRedoUI();
    if (window.tmUpdateVignetteUI) window.tmUpdateVignetteUI();
  }

  function tmRebuildObjectDOM(obj) {
    const root = document.createElement('div');
    root.className = 'tm-object';
    if (obj.isTheme) {
      root.className = 'tm-object tm-theme-layer';
      root.style.pointerEvents = 'auto';
    } else if (obj.type === 'image') {
      root.className = 'tm-object';
    }
    if (obj.isLocked) {
      root.classList.add('tm-locked');
    }
    root.dataset.id = obj.id;
    root.dataset.type = obj.type;

    if (obj.type === 'character') {
      tmBuildCharacterDOM(root, obj.data, obj.width, obj.height);

      if (obj.expression) {
        setTimeout(() => {
          if (window.tmApplyExpression) window.tmApplyExpression(obj, obj.expression);
        }, 0);
      }
    } else if (obj.type === 'text') {
      const content = document.createElement('div');
      content.className = 'tm-text-content';
      content.style.fontWeight = obj.italic ? 'bold' : 'bold';
      content.style.fontStyle = obj.italic ? 'italic' : 'normal';
      root.appendChild(content);
      obj.contentEl = content;
    } else {
      const img = document.createElement('img');
      img.src = obj.data.src;
      img.draggable = false;
      img.style.width = '100%'; img.style.height = '100%';
      img.style.objectFit = obj.isTheme ? 'cover' : 'contain';
      img.style.imageRendering = obj.isTheme ? 'auto' : 'pixelated';
      img.style.pointerEvents = 'none';
      root.appendChild(img);
    }
    return root;
  }

  function tmGetContentParent(el) {
    if (!el) return null;
    // For characters, return .tm-object-content so nested items are placed
    // outside .tm-char-wrapper and don't inherit the character's CSS filter
    const contentEl = el.querySelector(':scope > .tm-object-content');
    if (contentEl) return contentEl;
    const charWrap = el.querySelector('.tm-char-wrapper');
    if (charWrap) return charWrap;
    return el;
  }

  function tmEnforceCharacterChildrenZIndex(charEl) {
    if (!charEl) return;
    const contentEl = charEl.querySelector(':scope > .tm-object-content');
    if (!contentEl) return;
    let zIdx = 1;
    Array.from(contentEl.children).forEach((child) => {
      child.style.zIndex = zIdx++;
      if (!child.style.position) child.style.position = 'absolute';
      if (child.classList.contains('tm-char-wrapper')) {
        Array.from(child.children).forEach((subChild) => {
          if (!subChild.style.position) subChild.style.position = 'absolute';
        });
      }
    });
  }

  function tmEnforceCharacterDOM(obj) {
    const el = obj.el;
    if (!el || obj.type !== 'character') return;

    let contentEl = el.querySelector(':scope > .tm-object-content');
    if (!contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'tm-object-content';
      contentEl.style.position = 'absolute';
      contentEl.style.left = '0';
      contentEl.style.top = '0';
      contentEl.style.width = '100%';
      contentEl.style.height = '100%';
      el.appendChild(contentEl);
    }

    const baseArm = el.querySelector('.tm-base-arm-group');
    const rest = el.querySelector('.tm-rest-group');
    const head = el.querySelector('.tm-head-group');
    const capesabove = el.querySelector('.tm-capesabove-group');
    const arm = el.querySelector('.tm-arm-group');

    const bodyParts = {
      'base-arm': baseArm,
      'rest': rest,
      'head': head,
      'capes-above': capesabove,
      'arm': arm
    };

    const nestedItems = {};
    el.querySelectorAll('.tm-object').forEach(item => {
      const itemId = item.dataset.id;
      if (itemId) {
        nestedItems[itemId] = item;
      }
    });

    if (!obj.childOrder) {
      obj.childOrder = ['base-arm', 'rest', 'head', 'capes-above', 'arm'];
    }

    let isMatching = true;
    let childOrderIdx = 0;
    const contentChildren = Array.from(contentEl.children);

    for (let i = 0; i < contentChildren.length; i++) {
      const child = contentChildren[i];
      if (child.classList.contains('tm-char-wrapper')) {
        const segmentChildren = Array.from(child.children);
        for (let j = 0; j < segmentChildren.length; j++) {
          const expectedPartKey = obj.childOrder[childOrderIdx++];
          const partEl = bodyParts[expectedPartKey];
          if (segmentChildren[j] !== partEl) {
            isMatching = false;
            break;
          }
        }
      } else if (child.classList.contains('tm-object')) {
        const expectedItemKey = obj.childOrder[childOrderIdx++];
        const itemEl = nestedItems[expectedItemKey];
        if (child !== itemEl) {
          isMatching = false;
        }
      } else {
        isMatching = false;
      }
      if (!isMatching) break;
    }
    if (childOrderIdx !== obj.childOrder.length) {
      isMatching = false;
    }

    if (isMatching) {
      return;
    }

    Object.values(bodyParts).forEach(p => p && p.remove());
    Object.values(nestedItems).forEach(item => item && item.remove());
    contentEl.querySelectorAll('.tm-char-wrapper').forEach(w => w.remove());

    let currentSegment = [];
    const flushSegment = () => {
      if (currentSegment.length === 0) return;
      const segmentWrapper = document.createElement('div');
      segmentWrapper.className = 'tm-char-wrapper';
      segmentWrapper.style.position = 'absolute';
      segmentWrapper.style.left = '0';
      segmentWrapper.style.top = '0';
      segmentWrapper.style.width = '100%';
      segmentWrapper.style.height = '100%';
      segmentWrapper.style.pointerEvents = 'none';

      currentSegment.forEach(p => segmentWrapper.appendChild(p));
      contentEl.appendChild(segmentWrapper);
      currentSegment = [];
    };

    obj.childOrder.forEach(key => {
      if (bodyParts[key]) {
        currentSegment.push(bodyParts[key]);
      } else if (nestedItems[key]) {
        flushSegment();
        contentEl.appendChild(nestedItems[key]);
      }
    });
    flushSegment();
  }

  function tmAutoSaveWorkspace() {
    const snapshot = tmCaptureStateSnapshot();
    try {
      localStorage.setItem('tmWorkspaceAutoSave', JSON.stringify({
        objects: snapshot.objects,
        nextId: tmState.nextId,
        vignetteEnabled: snapshot.vignetteEnabled,
        vignetteIntensity: snapshot.vignetteIntensity
      }));
    } catch (error) {
      console.warn('Silent auto-save failed due to storage limit:', error);
    }
  }

  window.tmLoadAutoSavedWorkspace = function () {
    try {
      const saved = localStorage.getItem('tmWorkspaceAutoSave');
      if (saved) {
        const data = JSON.parse(saved);
        if (data) {
          let objects = [];
          let vEnabled = false;
          let vIntensity = 0.55;

          if (Array.isArray(data.objects)) {
            objects = data.objects;
            vEnabled = !!data.vignetteEnabled;
            vIntensity = data.vignetteIntensity !== undefined ? data.vignetteIntensity : 0.55;
          } else if (data.objects && Array.isArray(data.objects.objects)) {
            objects = data.objects.objects;
            vEnabled = !!data.objects.vignetteEnabled;
            vIntensity = data.objects.vignetteIntensity !== undefined ? data.objects.vignetteIntensity : 0.55;
          } else {
            return;
          }

          tmState.nextId = data.nextId || tmState.nextId;
          tmState.vignetteEnabled = vEnabled;
          tmState.vignetteIntensity = vIntensity;
          tmRestoreStateFromSnapshot(objects);
          if (window.tmUpdateVignetteUI) window.tmUpdateVignetteUI();
        }
      }
    } catch (e) {
      console.error("Failed to load auto-saved workspace:", e);
    }
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function getObj(id) { return tmState.objects.find(o => o.id === id); }
  function selected() { return getObj(tmState.selectedId); }

  function tmTintImage(img, color) {
    if (!color || color === 'rainbow' || color === 'none') return img.src;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 237;
    canvas.height = img.naturalHeight || img.height || 118;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  INIT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  window.tmResizeWorkspace = function () {
    const ws = document.getElementById('tm-workspace');
    const container = document.querySelector('.tm-workspace-container');
    const tmRoot = document.getElementById('thumbnail-maker-container');
    if (!ws || !container || !tmRoot) return;

    const wsWidth = parseInt(ws.style.width) || 1280;
    const wsHeight = parseInt(ws.style.height) || 720;

    const wrapper = tmRoot.querySelector('.tm-workspace-wrapper');

    if (wrapper) {
      if (window.innerWidth <= 1024 || window.innerHeight <= 600) {
        wrapper.style.paddingLeft = '4px';
        wrapper.style.paddingRight = '4px';
        wrapper.style.paddingTop = '4px';
        wrapper.style.paddingBottom = '4px';
      } else {
        // Restore desktop paddings
        wrapper.style.paddingLeft = '';
        wrapper.style.paddingRight = '';
        wrapper.style.paddingTop = '';
        wrapper.style.paddingBottom = '';
      }
    }

    // Calculate true available space by subtracting fixed siblings from
    // the root container height, avoiding the circular dependency where
    // the workspace inflates the container before being scaled.
    const rootRect = tmRoot.getBoundingClientRect();
    let fixedH = 0;
    const topBar = tmRoot.querySelector('.tm-top-toolbar');
    const resBar = tmRoot.querySelector('.tm-resolution-bar');
    const bottomBar = tmRoot.querySelector('.tm-bottom-toolbar');
    if (topBar) fixedH += topBar.getBoundingClientRect().height;
    if (resBar) fixedH += resBar.getBoundingClientRect().height;
    if (bottomBar) fixedH += bottomBar.getBoundingClientRect().height;

    // Dynamically calculate and set custom properties for active/expanded states
    // so absolute toggle buttons transition precisely based on actual height
    if (topBar) {
      if (!tmRoot.classList.contains('tm-top-collapsed')) {
        const topHeight = topBar.offsetHeight + (resBar ? resBar.offsetHeight : 0);
        if (topHeight > 0) {
          tmRoot.style.setProperty('--tm-top-bars-height', `${topHeight}px`);
        }
      }
    }

    let wrapperPadY = 0;
    let wrapperPadX = 0;
    if (wrapper) {
      const compStyle = window.getComputedStyle(wrapper);
      wrapperPadY = parseFloat(compStyle.paddingTop) + parseFloat(compStyle.paddingBottom) || 0;
      wrapperPadX = parseFloat(compStyle.paddingLeft) + parseFloat(compStyle.paddingRight) || 0;
    }

    let maxPanelWidth = 0;

    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
    const isMobile = window.innerWidth <= 1024 || window.innerHeight <= 600;

    if (!isPortrait) {
      if (isMobile) {
        maxPanelWidth = 180 + 20;  // 180px panel + 20px gap/margin
      } else {
        maxPanelWidth = 220 + 20;  // 220px panel + 20px gap/margin
      }
    }

    const leftPanelWidth = maxPanelWidth;
    const rightPanelWidth = maxPanelWidth;
    const panelReservedWidth = leftPanelWidth + rightPanelWidth;
    const shift = 0;

    const availW = rootRect.width - wrapperPadX - panelReservedWidth - 8; // small padding
    const availH = rootRect.height - fixedH - wrapperPadY - 8;

    if (availW <= 0 || availH <= 0) return;

    // Use a small safety pad (e.g. 4px) to ensure it doesn't touch the borders
    const safetyPad = 4;
    const scaleX = (availW - safetyPad) / wsWidth;
    const scaleY = (availH - safetyPad) / wsHeight;
    let scale = Math.min(scaleX, scaleY);
    // Allow scaling up beyond 1.0 to fully utilize empty workspace space on large/collapsed layouts!

    ws.style.transform = `scale(${scale})`;
    ws.style.transformOrigin = 'center center';
    ws.style.setProperty('--tm-workspace-scale', scale * TM_QUALITY);

    // Compensate layout size: transform:scale() doesn't adjust the actual layout box size,
    // so apply margin adjustments to match the visual footprint of the scaled element.
    // This perfectly centers and keeps spacing correct for both scale < 1 and scale > 1!
    const deadW = wsWidth * (1 - scale);
    const deadH = wsHeight * (1 - scale);
    ws.style.marginLeft = `${-deadW / 2 + shift}px`;
    ws.style.marginRight = `${-deadW / 2 - shift}px`;
    ws.style.marginTop = `${-deadH / 2}px`;
    ws.style.marginBottom = `${-deadH / 2}px`;
  };

  window.tmToggleTopBars = function () {
    const tmRoot = document.getElementById('thumbnail-maker-container');
    if (!tmRoot) return;

    const isCollapsed = tmRoot.classList.toggle('tm-top-collapsed');

    // Smooth workspace scaling during the 300ms CSS height transition
    let count = 0;
    const interval = setInterval(() => {
      if (window.tmResizeWorkspace) window.tmResizeWorkspace();
      count++;
      if (count >= 20) clearInterval(interval);
    }, 16);
  };

  window.tmToggleToolbars = function () {
    window.tmToggleTopBars();
  };

  window.initThumbnailMaker = function () {
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;

    // Set workspace to high-quality internal resolution
    ws.style.width = (1280 * TM_QUALITY) + 'px';
    ws.style.height = (720 * TM_QUALITY) + 'px';
    ws.style.backgroundSize = (20 * TM_QUALITY) + 'px ' + (20 * TM_QUALITY) + 'px';
    ws.style.backgroundPosition = '0 0, 0 ' + (10 * TM_QUALITY) + 'px, ' + (10 * TM_QUALITY) + 'px -' + (10 * TM_QUALITY) + 'px, -' + (10 * TM_QUALITY) + 'px 0px';

    if (window.tmResizeWorkspace) {
      window.tmResizeWorkspace();
      requestAnimationFrame(() => window.tmResizeWorkspace());
      setTimeout(() => window.tmResizeWorkspace(), 50);
      setTimeout(() => window.tmResizeWorkspace(), 150);
    }

    if (tmState.initialized) return;
    tmState.initialized = true;

    // Global pointerdown listener to handle dragging outside element outlines to perform multi-selection (lasso select)
    let isWsDragging = false;
    let wsStartX = 0, wsStartY = 0;
    let wsLasso = null;
    let wsHoveredIds = new Set();

    document.addEventListener('pointerdown', (e) => {
      // Only run in thumbnail editor mode
      if (window.activePlannerType !== 'thumbnail') return;

      const clickedObjEl = e.target.closest('.tm-object');
      let isThemeClick = false;
      let isLockedClick = false;
      if (clickedObjEl) {
        const oid = clickedObjEl.dataset.id;
        const obj = tmState.objects.find(o => o.id === oid);
        if (obj && obj.isTheme) {
          isThemeClick = true;
        }
        if (obj && obj.isLocked) {
          isLockedClick = true;
        }
      }

      // Do NOT deselect or lasso if clicking inside an object (except the background theme layer or locked layers), selection handles, property panel, sidebar, dock, or catalog/modal buttons
      if ((clickedObjEl && !isThemeClick && !isLockedClick) ||
        e.target.closest('.tm-layers-dock') ||
        e.target.closest('.tm-property-panel') ||
        e.target.closest('.wp-catalogue') ||
        e.target.closest('.wp-popup') ||
        e.target.closest('.tm-toolbar') ||
        e.target.closest('button') ||
        e.target.closest('.tm-btn-primary') ||
        e.target.closest('.tm-btn-secondary') ||
        e.target.closest('input') ||
        e.target.closest('select')) {
        return;
      }

      // Ensure we are clicking on the workspace or its children (excluding checked UI components above)
      if (!e.target.closest('#tm-workspace')) {
        tmDeselect();
        return;
      }

      e.preventDefault();

      document.body.classList.add('tm-dragging');
      isWsDragging = false;
      wsStartX = e.clientX;
      wsStartY = e.clientY;
      wsHoveredIds.clear();

      const onPointerMove = (moveEv) => {
        const dx = moveEv.clientX - wsStartX;
        const dy = moveEv.clientY - wsStartY;
        // Require dragging more than 4px to trigger selection lasso
        if (!isWsDragging && Math.sqrt(dx * dx + dy * dy) > 4) {
          isWsDragging = true;
          if (!wsLasso) {
            wsLasso = document.createElement('div');
            wsLasso.className = 'tm-selection-lasso';
            wsLasso.style.position = 'fixed';
            wsLasso.style.border = '2px dashed #457b9d';
            wsLasso.style.backgroundColor = 'rgba(69, 123, 157, 0.15)';
            wsLasso.style.pointerEvents = 'none';
            wsLasso.style.zIndex = '99999';
            wsLasso.style.borderRadius = '4px';
            document.body.appendChild(wsLasso);
          }
        }

        if (isWsDragging && wsLasso) {
          const left = Math.min(wsStartX, moveEv.clientX);
          const top = Math.min(wsStartY, moveEv.clientY);
          const width = Math.abs(wsStartX - moveEv.clientX);
          const height = Math.abs(wsStartY - moveEv.clientY);

          wsLasso.style.left = left + 'px';
          wsLasso.style.top = top + 'px';
          wsLasso.style.width = width + 'px';
          wsLasso.style.height = height + 'px';

          wsHoveredIds.clear();
          tmState.objects.forEach(obj => {
            if (obj.isTheme || obj.isLocked || !obj.el) return; // Exclude theme and locked layers from selection group!

            const rect = obj.el.getBoundingClientRect();
            // Check intersection of element's bounding rect with lasso
            const intersects = !(rect.left > left + width ||
              rect.right < left ||
              rect.top > top + height ||
              rect.bottom < top);

            // Check if pointer itself is hovering over the element
            const pointerHover = (moveEv.clientX >= rect.left && moveEv.clientX <= rect.right &&
              moveEv.clientY >= rect.top && moveEv.clientY <= rect.bottom);

            if (intersects || pointerHover) {
              wsHoveredIds.add(obj.id);
              obj.el.classList.add('tm-selected');
              obj.el.classList.add('selected');
            } else {
              obj.el.classList.remove('tm-selected');
              obj.el.classList.remove('selected');
            }
          });
        }
      };

      const onPointerUp = (upEv) => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        document.body.classList.remove('tm-dragging');

        if (wsLasso) {
          wsLasso.remove();
          wsLasso = null;
        }

        if (isWsDragging) {
          if (wsHoveredIds.size > 0) {
            tmSelectMultipleObjects(Array.from(wsHoveredIds));
          } else {
            tmDeselect();
          }
        } else {
          // Simple click in empty space without dragging, just deselect
          tmDeselect();
        }
        isWsDragging = false;
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    const propPanel = document.getElementById('tm-property-panel');
    if (propPanel) {
      propPanel.addEventListener('change', () => {
        if (window.tmPushHistoryState) window.tmPushHistoryState();
      });
    }

    const imgUp = document.getElementById('tm-image-upload');
    if (imgUp) imgUp.value = '';

    // Automatically load the auto-saved workspace!
    if (window.tmLoadAutoSavedWorkspace) window.tmLoadAutoSavedWorkspace();

    // Ensure the theme and workspace are correctly sized upon initialization
    const activeResBtn = document.querySelector('.tm-res-btn.active');
    if (activeResBtn && window.tmSetResolution) {
      window.tmSetResolution(activeResBtn.getAttribute('data-res'));
    }

    tmRenderLayersPanel();
    if (window.tmUpdateVignetteUI) window.tmUpdateVignetteUI();
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Scale workspace to fit container on init + listen for resize
    requestAnimationFrame(() => window.tmResizeWorkspace());
    window.addEventListener('resize', () => {
      if (window.activePlannerType === 'thumbnail') {
        window.tmResizeWorkspace();
      }
    });
    window.addEventListener('orientationchange', () => {
      if (window.activePlannerType === 'thumbnail') {
        setTimeout(() => window.tmResizeWorkspace(), 200);
      }
    });

    // Auto-show onboarding guide if not completed yet
    const tutorialCompleted = localStorage.getItem('tm-tutorial-completed');
    if (!tutorialCompleted) {
      setTimeout(() => {
        window.tmOpenTutorial();
      }, 600);
    }

    // Mobile/touch pinch-to-scale gesture handling for selected layers/objects
    let pinchStartDist = 0;
    let pinchStartScales = [];

    document.addEventListener('touchstart', (e) => {
      if (window.activePlannerType !== 'thumbnail') return;
      if (e.touches.length === 2) {
        const selectedIds = tmState.selectedIds || [];
        const targets = selectedIds.length > 0 ? selectedIds.map(id => getObj(id)).filter(Boolean) : [selected()].filter(Boolean);
        if (targets.length > 0) {
          const inWorkspace = e.target.closest('#tm-workspace') || e.target.closest('.tm-workspace-container');
          if (inWorkspace) {
            e.preventDefault();
            tmState.isPinchScaling = true;
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            pinchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            pinchStartScales = targets.map(obj => ({
              obj,
              startScale: obj.scale || 1
            }));
          }
        }
      }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (window.activePlannerType !== 'thumbnail') return;
      if (e.touches.length === 2 && pinchStartDist > 0 && pinchStartScales.length > 0) {
        const inWorkspace = e.target.closest('#tm-workspace') || e.target.closest('.tm-workspace-container');
        if (inWorkspace) {
          e.preventDefault();
          const t1 = e.touches[0];
          const t2 = e.touches[1];
          const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
          if (currentDist > 5) {
            const ratio = currentDist / pinchStartDist;
            pinchStartScales.forEach(({ obj, startScale }) => {
              let newScale = startScale * ratio;
              newScale = Math.max(0.1, Math.min(5.0, newScale));
              obj.scale = parseFloat(newScale.toFixed(2));
              applyTransform(obj);
            });

            // Sync properties panel scale slider if active
            const primaryObj = selected();
            if (primaryObj) {
              const slider = document.getElementById('tm-prop-scale');
              if (slider) slider.value = primaryObj.scale;
            }
          }
        }
      }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
      if (window.activePlannerType !== 'thumbnail') return;
      if (e.touches.length < 2) {
        if (pinchStartDist > 0) {
          if (window.tmPushHistoryState) window.tmPushHistoryState();
          tmAutoSaveWorkspace();
        }
        pinchStartDist = 0;
        pinchStartScales = [];
        tmState.isPinchScaling = false;
      }
    });

    document.addEventListener('touchcancel', (e) => {
      if (window.activePlannerType !== 'thumbnail') return;
      pinchStartDist = 0;
      pinchStartScales = [];
      tmState.isPinchScaling = false;
    });
  };

  window.tmOpenTutorial = function () {
    const overlay = document.getElementById('tm-tutorial-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  };

  window.tmCloseTutorial = function (completed) {
    const overlay = document.getElementById('tm-tutorial-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      if (completed) {
        localStorage.setItem('tm-tutorial-completed', 'true');
      }
    }
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  CHARACTER SLOTS MODAL  (unchanged)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  window.tmOpenCharacterSlotsModal = function () {
    const slots = JSON.parse(localStorage.getItem('saveSlotsList') || '[]');
    if (slots.length === 0) {
      document.getElementById('tm-no-character-slots-modal')?.classList.remove('hidden');
      return;
    }
    renderSlotCards(slots);
    document.getElementById('tm-character-slots-modal')?.classList.remove('hidden');
  };

  window.tmCloseCharacterSlotsModal = function () {
    document.getElementById('tm-character-slots-modal')?.classList.add('hidden');
  };

  window.tmCloseNoCharacterSlotsModal = function () {
    document.getElementById('tm-no-character-slots-modal')?.classList.add('hidden');
  };

  function renderSlotCards(slots) {
    const grid = document.getElementById('tm-character-slots-grid');
    if (!grid) return;
    grid.innerHTML = '';
    slots.forEach(num => {
      const raw = localStorage.getItem('saveSlot' + num);
      if (!raw) return;
      let data;
      try { data = JSON.parse(raw); } catch { return; }

      const card = document.createElement('div');
      card.className = 'tm-save-slot-card';

      if (data.previewImage) {
        const preview = document.createElement('div');
        preview.className = 'tm-save-slot-preview';
        preview.style.backgroundImage = `url("${data.previewImage}")`;
        preview.style.backgroundRepeat = 'no-repeat';
        preview.style.backgroundSize = 'contain';
        preview.style.backgroundPosition = 'center';
        preview.style.imageRendering = 'pixelated';
        card.appendChild(preview);
      }

      const lbl = document.createElement('div');
      lbl.className = 'tm-save-slot-label';
      lbl.textContent = data.title || 'Slot ' + num;
      card.appendChild(lbl);

      card.addEventListener('click', () => {
        const selObj = selected();
        if (selObj && selObj.type === 'character') {
          if (window.tmPushHistoryState) window.tmPushHistoryState();

          selObj.data = data;
          if (data.pivots) selObj.pivots = data.pivots;

          // Re-determine special skin and skinColor
          selObj.skinType = (function () {
            let type = data.skinType || 'normal';
            if (data.overlayState) {
              try {
                const stateObj = JSON.parse(data.overlayState);
                if (stateObj.darkJesterActive || stateObj.normalJesterActive) return 'jester';
                if (stateObj.equippedItems) {
                  for (const key in stateObj.equippedItems) {
                    const item = stateObj.equippedItems[key];
                    if (item && item.src) {
                      if (item.src.includes('gsc/head.png')) return 'golden_skeleton';
                      if (item.src.includes('sc/head.png')) return 'skeleton';
                      if (key === 'head' && (item.src.includes('invisibleskin') || item.src.includes('pupil.png'))) return 'invisible';
                    }
                  }
                }
              } catch (e) { }
            }
            return type;
          })();
          selObj.skinColor = (function () {
            let color = data.skinColor || '#d49e7a';
            if (data.overlayState) {
              try {
                const stateObj = JSON.parse(data.overlayState);
                if (stateObj.skinColor) color = stateObj.skinColor;
                if (stateObj.draculaActive) color = '#e2dbd5';
              } catch (e) { }
            }
            return color;
          })();

          // Asynchronously load the new slot's image to retrieve its natural dimensions
          (async () => {
            const firstImgSrc = data.layers ? (data.layers.rest || data.layers.head || data.previewImage) : data.previewImage;
            const loadedImg = await new Promise(res => {
              const i = new Image();
              i.onload = () => res(i);
              i.src = firstImgSrc;
            });
            const w = loadedImg.width;
            const h = loadedImg.height;
            selObj.width = w;
            selObj.height = h;

            // Delete all nested children objects first to prevent them from becoming orphans!
            const childrenToDelete = tmState.objects.filter(o => o.parentId === selObj.id);
            childrenToDelete.forEach(child => {
              if (child.el) child.el.remove();
              tmState.objects = tmState.objects.filter(o => o.id !== child.id);
            });

            // Rebuild DOM inside existing element
            tmBuildCharacterDOM(selObj.el, data, w, h);

            // Reset visual wrapping and apply transformations/filters
            applyTransform(selObj);

            // If the slot has an expression, apply it
            if (data.expression) {
              selObj.expression = data.expression;
              if (window.tmApplyExpression) window.tmApplyExpression(selObj, data.expression);
            } else {
              selObj.expression = null;
            }

            tmSelectObject(selObj.id);
            tmRenderLayersPanel();
            tmAutoSaveWorkspace();
          })();
        } else {
          buildCharacter(data);
        }
        tmCloseCharacterSlotsModal();
      });
      grid.appendChild(card);
    });
  }

  // ── THUMBNAIL SAVE SLOTS SYSTEM ──
  function tmGetThumbnailSaves() {
    return JSON.parse(localStorage.getItem('tmThumbnailSaves') || '[]');
  }

  function tmSaveThumbnailSaves(saves) {
    try {
      localStorage.setItem('tmThumbnailSaves', JSON.stringify(saves));
      return true;
    } catch (error) {
      console.error('Failed to save thumbnail saves:', error);
      alert('Storage cache is full! Please delete some other slots (character/world/thumbnails) to free up space.');
      return false;
    }
  }

  window.tmOpenThumbnailSlotsModal = function () {
    tmRenderThumbnailSlots();
    const modal = document.getElementById('tm-thumbnail-slots-modal');
    if (modal) modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  };

  window.tmCloseThumbnailSlotsModal = function () {
    const modal = document.getElementById('tm-thumbnail-slots-modal');
    if (modal) modal.classList.add('hidden');
  };

  window.tmRenderThumbnailSlots = function () {
    const grid = document.getElementById('tm-thumbnail-slots-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const saves = tmGetThumbnailSaves();
    saves.forEach(slot => {
      const card = document.createElement('div');
      card.className = 'tm-save-slot-card';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';
      card.style.height = 'auto';
      card.style.padding = '0';
      card.style.overflow = 'hidden';

      const preview = document.createElement('div');
      preview.className = 'tm-save-slot-preview';
      preview.style.height = '120px';
      preview.style.backgroundSize = 'contain';
      preview.style.backgroundRepeat = 'no-repeat';
      preview.style.backgroundPosition = 'center';
      preview.style.imageRendering = 'pixelated';
      preview.style.backgroundColor = 'rgba(0,0,0,0.3)';
      if (slot.previewImage) {
        preview.style.backgroundImage = `url("${slot.previewImage}")`;
      }
      card.appendChild(preview);

      const label = document.createElement('div');
      label.className = 'tm-save-slot-label';
      label.style.display = 'flex';
      label.style.flexDirection = 'column';
      label.style.gap = '4px';
      label.style.padding = '10px';

      const title = document.createElement('span');
      title.textContent = slot.title;
      title.style.fontWeight = 'bold';
      title.style.fontSize = '13px';
      title.style.color = '#fff';
      label.appendChild(title);

      const date = document.createElement('span');
      const d = new Date(slot.timestamp);
      date.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      date.style.fontSize = '10px';
      date.style.color = 'rgba(255,255,255,0.4)';
      label.appendChild(date);

      card.appendChild(label);

      // Buttons container
      const btns = document.createElement('div');
      btns.style.display = 'flex';
      btns.style.gap = '6px';
      btns.style.padding = '0 10px 10px';
      btns.style.justifyContent = 'space-between';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'tm-btn-primary';
      loadBtn.style.flex = '1';
      loadBtn.style.padding = '6px 0';
      loadBtn.style.fontSize = '11px';
      loadBtn.style.borderRadius = '4px';
      loadBtn.style.cursor = 'pointer';
      loadBtn.style.border = 'none';
      loadBtn.style.fontFamily = 'inherit';
      loadBtn.style.color = 'white';
      loadBtn.innerHTML = 'Load';
      loadBtn.onclick = (e) => {
        e.stopPropagation();
        tmLoadThumbnailSave(slot.id);
      };

      const overwriteBtn = document.createElement('button');
      overwriteBtn.style.flex = '1';
      overwriteBtn.style.background = 'rgba(168, 218, 220, 0.1)';
      overwriteBtn.style.border = '1px solid rgba(168, 218, 220, 0.3)';
      overwriteBtn.style.color = '#a8dadc';
      overwriteBtn.style.padding = '6px 0';
      overwriteBtn.style.fontSize = '11px';
      overwriteBtn.style.borderRadius = '4px';
      overwriteBtn.style.cursor = 'pointer';
      overwriteBtn.style.fontFamily = 'inherit';
      overwriteBtn.innerHTML = 'Overwrite';
      overwriteBtn.onclick = (e) => {
        e.stopPropagation();
        tmOverwriteThumbnailSave(slot.id);
      };

      const delBtn = document.createElement('button');
      delBtn.style.background = 'rgba(230, 57, 70, 0.1)';
      delBtn.style.border = '1px solid rgba(230, 57, 70, 0.3)';
      delBtn.style.color = '#e63946';
      delBtn.style.padding = '6px 8px';
      delBtn.style.fontSize = '11px';
      delBtn.style.borderRadius = '4px';
      delBtn.style.cursor = 'pointer';
      delBtn.style.fontFamily = 'inherit';
      delBtn.innerHTML = '✕';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        tmDeleteThumbnailSave(slot.id);
      };

      btns.appendChild(loadBtn);
      btns.appendChild(overwriteBtn);
      btns.appendChild(delBtn);

      card.appendChild(btns);
      grid.appendChild(card);
    });
  };

  window.tmCreateNewThumbnailSave = async function () {
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;

    const name = prompt("Enter a name for this thumbnail save:", "My Thumbnail " + (tmGetThumbnailSaves().length + 1));
    if (!name) return;

    const wasSelected = tmState.selectedId;
    tmDeselect();

    let previewUrl = '';
    try {
      if (typeof html2canvas === 'function') {
        const canvas = await tmGenerateBakedCanvas(0.15);
        if (canvas) {
          previewUrl = canvas.toDataURL('image/png');
        }
      }
    } catch (e) {
      console.error("Preview screenshot failed:", e);
    }

    if (wasSelected) tmSelectObject(wasSelected);

    const snapshot = tmCaptureStateSnapshot();
    const newSave = {
      id: 'tm-save-' + Date.now(),
      title: name,
      timestamp: Date.now(),
      previewImage: previewUrl,
      objects: snapshot.objects,
      nextId: tmState.nextId,
      vignetteEnabled: snapshot.vignetteEnabled,
      vignetteIntensity: snapshot.vignetteIntensity
    };

    const saves = tmGetThumbnailSaves();
    saves.push(newSave);
    tmSaveThumbnailSaves(saves);

    tmRenderThumbnailSlots();
  };

  window.tmLoadThumbnailSave = function (id) {
    const saves = tmGetThumbnailSaves();
    const save = saves.find(s => s.id === id);
    if (!save) return;

    if (confirm(`Are you sure you want to load "${save.title}"? Your current work will be replaced.`)) {
      if (window.tmPushHistoryState) window.tmPushHistoryState();
      tmState.nextId = save.nextId || tmState.nextId;
      tmState.vignetteEnabled = !!save.vignetteEnabled;
      tmState.vignetteIntensity = save.vignetteIntensity !== undefined ? save.vignetteIntensity : 0.55;
      tmRestoreStateFromSnapshot(save.objects);
      tmCloseThumbnailSlotsModal();
    }
  };

  window.tmOverwriteThumbnailSave = async function (id) {
    const saves = tmGetThumbnailSaves();
    const saveIdx = saves.findIndex(s => s.id === id);
    if (saveIdx === -1) return;

    if (confirm(`Are you sure you want to overwrite "${saves[saveIdx].title}" with your current workspace?`)) {
      const ws = document.getElementById('tm-workspace');
      if (!ws) return;

      const wasSelected = tmState.selectedId;
      tmDeselect();

      let previewUrl = '';
      try {
        if (typeof html2canvas === 'function') {
          const canvas = await tmGenerateBakedCanvas(0.15);
          if (canvas) {
            previewUrl = canvas.toDataURL('image/png');
          }
        }
      } catch (e) {
        console.error("Preview screenshot failed:", e);
      }

      if (wasSelected) tmSelectObject(wasSelected);

      const snapshot = tmCaptureStateSnapshot();
      saves[saveIdx].timestamp = Date.now();
      saves[saveIdx].previewImage = previewUrl;
      saves[saveIdx].objects = snapshot.objects;
      saves[saveIdx].nextId = tmState.nextId;
      saves[saveIdx].vignetteEnabled = snapshot.vignetteEnabled;
      saves[saveIdx].vignetteIntensity = snapshot.vignetteIntensity;

      tmSaveThumbnailSaves(saves);
      tmRenderThumbnailSlots();
    }
  };

  window.tmDeleteThumbnailSave = function (id) {
    let saves = tmGetThumbnailSaves();
    const save = saves.find(s => s.id === id);
    if (!save) return;

    if (confirm(`Are you sure you want to delete "${save.title}"?`)) {
      saves = saves.filter(s => s.id !== id);
      tmSaveThumbnailSaves(saves);
      tmRenderThumbnailSlots();
    }
  };

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  BUILD CHARACTER FROM SAVE DATA  (unchanged)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  function tmBuildCharacterDOM(root, saveData, w, h) {
    root.innerHTML = '';
    if (w && h) {
      root.style.width = w + 'px';
      root.style.height = h + 'px';
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'tm-char-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    root.appendChild(wrapper);

    if (saveData.layers) {
      const createLayerGroup = (className) => {
        const group = document.createElement('div');
        group.className = className;
        group.style.position = 'absolute';
        group.style.left = '0'; group.style.top = '0';
        group.style.width = '100%'; group.style.height = '100%';
        group.style.pointerEvents = 'none';
        wrapper.appendChild(group);
        return group;
      };

      const baseArmGrp = createLayerGroup('tm-base-arm-group');
      const restGrp = createLayerGroup('tm-rest-group');
      const headGrp = createLayerGroup('tm-head-group');
      const capesAboveGrp = createLayerGroup('tm-capesabove-group');
      const armGrp = createLayerGroup('tm-arm-group');

      const createLayerImg = (imgSrc, className, parent) => {
        if (!imgSrc) return;
        const img = document.createElement('img');
        img.className = 'tm-char-layer ' + className;
        img.src = imgSrc;
        img.style.position = 'absolute';
        img.style.width = '100%'; img.style.height = '100%';
        img.style.objectFit = 'contain'; img.style.imageRendering = 'auto';
        img.draggable = false;
        parent.appendChild(img);
      };

      const layers = saveData.layers;
      if (layers.baseArm) createLayerImg(layers.baseArm, 'tm-body-base-arm', baseArmGrp);
      if (layers.rest) createLayerImg(layers.rest, 'tm-body-rest', restGrp);

      if (layers.headBase) createLayerImg(layers.headBase, 'tm-head-base', headGrp);
      if (layers.headAccessories) createLayerImg(layers.headAccessories, 'tm-head-accessories', headGrp);
      if (layers.head) createLayerImg(layers.head, 'tm-head-main', headGrp);

      if (layers.capesAbove) createLayerImg(layers.capesAbove, 'tm-body-capesabove', capesAboveGrp);

      if (layers.arm) createLayerImg(layers.arm, 'tm-arm-main', armGrp);
    } else {
      const img = document.createElement('img');
      img.src = saveData.previewImage;
      img.draggable = false;
      img.style.width = '100%'; img.style.height = '100%';
      img.style.objectFit = 'contain'; img.style.imageRendering = 'auto';
      wrapper.appendChild(img);
    }
    tmEnforceCharacterChildrenZIndex(root);
  }

  async function buildCharacter(saveData) {
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;
    if (!saveData.layers && !saveData.previewImage) return;

    if (window.tmPushHistoryState) window.tmPushHistoryState();

    const charId = 'tm-char-' + tmState.nextId++;
    const root = document.createElement('div');
    root.className = 'tm-object tm-character';
    root.dataset.id = charId;
    root.dataset.type = 'character';
    root.style.pointerEvents = 'auto';

    const firstImgSrc = saveData.layers ? (saveData.layers.rest || saveData.layers.head || saveData.previewImage) : saveData.previewImage;
    const loadedImg = await new Promise(res => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = firstImgSrc;
    });

    const w = loadedImg.width;
    const h = loadedImg.height;

    tmBuildCharacterDOM(root, saveData, w, h);

    let pivots = { armX: 59.5, armY: 129.5, baseArmX: 59.5, baseArmY: 129.5, headX: 118.5, headY: 110 };
    if (saveData.layers && saveData.pivots) pivots = saveData.pivots;

    const center = tmGetLogicalWorkspaceCenter(0, 0);
    const startX = center.x;
    const startY = center.y;

    ws.appendChild(root);

    const obj = {
      id: charId, type: 'character', el: root,
      data: saveData,
      x: startX, y: startY, width: w, height: h,
      scale: 0.33, stretchX: 1, stretchY: 1, rotation: 0,
      headRotation: 0, armRotation: 0, baseArmRotation: 0,
      opacity: 1, inverted: false,
      headInverted: false, armInverted: false, baseArmInverted: false,
      blur: 0, glow: 0, glowColor: '#ffffff', enableShadow: false,
      pivots: pivots,
      vignetteEnabled: false,
      vignetteIntensity: 0.55,
      skinType: (function () {
        let type = saveData.skinType || 'normal';
        if (saveData.overlayState) {
          try {
            const stateObj = JSON.parse(saveData.overlayState);
            if (stateObj.darkJesterActive || stateObj.normalJesterActive) return 'jester';
            if (stateObj.equippedItems) {
              for (const key in stateObj.equippedItems) {
                const item = stateObj.equippedItems[key];
                if (item && item.src) {
                  if (item.src.includes('gsc/head.png')) return 'golden_skeleton';
                  if (item.src.includes('sc/head.png')) return 'skeleton';
                  if (key === 'head' && (item.src.includes('invisibleskin') || item.src.includes('pupil.png'))) return 'invisible';
                }
              }
            }
          } catch (e) { }
        }
        return type;
      })(),
      skinColor: (function () {
        let color = saveData.skinColor || '#d49e7a';
        if (saveData.overlayState) {
          try {
            const stateObj = JSON.parse(saveData.overlayState);
            if (stateObj.skinColor) color = stateObj.skinColor;
            if (stateObj.draculaActive) color = '#e2dbd5';
          } catch (e) { }
        }
        return color;
      })()
    };

    if (saveData.expression) {
      obj.expression = saveData.expression;
      setTimeout(() => {
        if (window.tmApplyExpression) window.tmApplyExpression(obj, saveData.expression);
      }, 0);
    }

    tmState.objects.push(obj);
    applyTransform(obj);
    setupDrag(root, obj);
    tmSelectObject(charId);
    tmRenderLayersPanel();
  }
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  TRANSFORM & RENDERING
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  function applyTransform(obj, q) {
    if (q === undefined) q = TM_QUALITY;
    const el = obj.el;
    if (!el) return;

    // Enforce parent-child DOM hierarchy dynamically based on parentId
    const ws = document.getElementById('tm-workspace');
    if (obj.parentId) {
      const parent = getObj(obj.parentId);
      if (parent && parent.el) {
        const targetParent = tmGetContentParent(parent.el);
        if (targetParent) {
          if (el.parentNode !== targetParent) {
            targetParent.appendChild(el);
          }
        } else {
          if (el.parentNode !== parent.el) {
            parent.el.appendChild(el);
          }
        }
      } else {
        obj.parentId = null;
        if (ws && el.parentNode !== ws) {
          ws.appendChild(el);
        }
      }
    } else {
      if (ws && el.parentNode !== ws && !obj.isTheme) {
        ws.appendChild(el);
      }
    }

    if (obj.type === 'character') {
      tmEnforceCharacterDOM(obj);
      tmEnforceCharacterChildrenZIndex(el);
    }

    // Dynamically wrap visual content inside a .tm-object-content wrapper if it doesn't exist
    let contentEl = el.querySelector(':scope > .tm-object-content');
    if (!contentEl && !obj.isTheme) {
      contentEl = document.createElement('div');
      contentEl.className = 'tm-object-content';
      contentEl.style.position = 'absolute';
      contentEl.style.left = '0';
      contentEl.style.top = '0';
      contentEl.style.width = '100%';
      contentEl.style.height = '100%';


      // Move all children except handles/outline/contentEl itself into contentEl
      const children = Array.from(el.children);
      children.forEach(c => {
        if (!c.classList.contains('tm-handle') &&
          !c.classList.contains('tm-rotate-handle') &&
          !c.classList.contains('tm-delete-handle') &&
          !c.classList.contains('tm-duplicate-handle') &&
          !c.classList.contains('tm-object-content')) {
          contentEl.appendChild(c);
        }
      });
      el.appendChild(contentEl);
    }

    // Set safe defaults to prevent NaN/invalid CSS transforms
    const x = obj.x !== undefined ? obj.x : 0;
    const y = obj.y !== undefined ? obj.y : 0;
    const width = obj.width !== undefined ? obj.width : 100;
    const height = obj.height !== undefined ? obj.height : 100;
    const scale = obj.scale !== undefined ? obj.scale : 1;
    const rotation = obj.rotation !== undefined ? obj.rotation : 0;
    const stretchX = obj.stretchX !== undefined ? obj.stretchX : 1;
    const stretchY = obj.stretchY !== undefined ? obj.stretchY : 1;

    // Characters use center-based positioning
    if (obj.type === 'character') {
      let t = 'translate(' + (x * q) + 'px,' + (y * q) + 'px)';
      t += ' rotate(' + rotation + 'deg)';
      t += ' scale(' + (scale * stretchX * q) + ',' + (scale * stretchY * q) + ')';
      if (obj.inverted) t += ' scaleX(-1)';
      t += ' translate(-50%,-50%)';
      el.style.position = 'absolute';
      el.style.left = '0'; el.style.top = '0';
      el.style.transform = t;
    } else {
      // Non-characters: top-left based (but center-based if nested in character)
      let t = '';
      let visualScale = scale * Math.max(stretchX, stretchY);
      if (obj.parentId) {
        const p = getObj(obj.parentId);
        const pScale = p && p.scale !== undefined ? p.scale : 1;
        const pStretchX = p && p.stretchX !== undefined ? p.stretchX : 1;
        const pStretchY = p && p.stretchY !== undefined ? p.stretchY : 1;
        visualScale = scale * pScale * Math.max(stretchX, stretchY);
        const centerX = p ? p.width / 2 : 118.5;
        const centerY = p ? p.height / 2 : 141;
        // Nested objects: parent's scale(ps*q) already handles magnification.
        // Divide by parent's stretch factors to prevent inheriting stretching distortion.
        t = 'translate(' + (centerX + x) + 'px, ' + (centerY + y) + 'px)';
        t += ' rotate(' + rotation + 'deg)';
        t += ' scale(' + ((scale * stretchX) / pStretchX) + ',' + ((scale * stretchY) / pStretchY) + ')';
        if (obj.inverted) t += ' scaleX(-1)';
        t += ' translate(-50%,-50%)';
      } else {
        let centerX = (x + width / 2) * q;
        let centerY = (y + height / 2) * q;
        t = 'translate(' + centerX + 'px,' + centerY + 'px)';
        t += ' rotate(' + rotation + 'deg)';
        if (obj.isTheme) {
          t += ' scale(' + (scale * stretchX) + ',' + (scale * stretchY) + ')';
        } else {
          t += ' scale(' + (scale * stretchX * q) + ',' + (scale * stretchY * q) + ')';
        }
        if (obj.inverted) t += ' scaleX(-1)';
        t += ' translate(-50%,-50%)';
      }
      el.style.position = 'absolute';
      el.style.left = '0'; el.style.top = '0';
      if (obj.isTheme) {
        el.style.width = (width * q) + 'px';
        el.style.height = (height * q) + 'px';
      } else {
        el.style.width = width + 'px';
        el.style.height = height + 'px';
      }
      el.style.transform = t;
    }

    // Counter-scale outline and handles to keep them constant size across all scale levels
    const finalVisualScale = (typeof visualScale === 'number') ? visualScale : scale * Math.max(stretchX, stretchY);
    if (finalVisualScale && finalVisualScale !== 1) {
      const scaleFactor = 1 / finalVisualScale;
      el.style.outlineWidth = (2 * scaleFactor) + 'px';
      el.style.outlineOffset = (2 * scaleFactor) + 'px';

      const handles = el.querySelectorAll('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle');
      handles.forEach(h => {
        if (h.classList.contains('tm-rotate-handle')) {
          h.style.transform = `translateX(-50%) scale(${scaleFactor})`;
          h.style.top = (-30 * scaleFactor) + 'px';
        } else if (h.classList.contains('tm-delete-handle') || h.classList.contains('tm-duplicate-handle')) {
          h.style.transform = `scale(${scaleFactor})`;
          h.style.top = (-40 * scaleFactor) + 'px';
        } else {
          h.style.transform = `scale(${scaleFactor})`;
        }
      });
    } else {
      el.style.outlineWidth = '';
      el.style.outlineOffset = '';
      const handles = el.querySelectorAll('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle');
      handles.forEach(h => {
        h.style.transform = '';
        if (h.classList.contains('tm-rotate-handle') || h.classList.contains('tm-delete-handle') || h.classList.contains('tm-duplicate-handle')) {
          h.style.top = '';
        }
      });
    }

    el.style.pointerEvents = 'auto';

    const targetEl = contentEl || el;
    targetEl.style.opacity = obj.opacity;

    // Render/update per-layer vignette (text vignette handled in text fill layer below)
    let vig = el.querySelector('.tm-object-vignette');
    if (obj.type === 'text') {
      // Text vignette is integrated into the text fill layer via background-clip:text
      if (vig) { vig.style.display = 'none'; vig.style.webkitMaskImage = ''; vig.style.maskImage = ''; }
    } else if (obj.vignetteEnabled) {
      if (!vig) {
        vig = document.createElement('div');
        vig.className = 'tm-object-vignette';
        vig.style.position = 'absolute';
        vig.style.left = '0';
        vig.style.top = '0';
        vig.style.width = '100%';
        vig.style.height = '100%';
        vig.style.pointerEvents = 'none';
        vig.style.zIndex = '9999';
        targetEl.appendChild(vig);
      }
      vig.style.display = '';
      const intensity = obj.vignetteIntensity !== undefined ? obj.vignetteIntensity : 0.55;
      const opMiddle = 0;
      const opOuter1 = 0.45 * intensity;
      const opOuter2 = 0.95 * intensity;
      vig.style.background = `radial-gradient(circle, rgba(0,0,0,${opMiddle}) 28%, rgba(0,0,0,${opMiddle}) 50%, rgba(0,0,0,${opOuter1}) 80%, rgba(0,0,0,${opOuter2}) 100%)`;

      // Clip vignette to the content's pixel shape using the image as a CSS mask
      if (obj.type === 'item' || obj.type === 'block' || obj.type === 'image') {
        const contentImg = targetEl.querySelector('img');
        if (contentImg && contentImg.src) {
          const maskUrl = `url("${contentImg.src}")`;
          vig.style.webkitMaskImage = maskUrl;
          vig.style.maskImage = maskUrl;
          vig.style.webkitMaskSize = 'contain';
          vig.style.maskSize = 'contain';
          vig.style.webkitMaskPosition = 'center';
          vig.style.maskPosition = 'center';
          vig.style.webkitMaskRepeat = 'no-repeat';
          vig.style.maskRepeat = 'no-repeat';
        }
      } else {
        // Character: no pixel-mask available — use rectangular vignette
        vig.style.webkitMaskImage = '';
        vig.style.maskImage = '';
      }
    } else {
      if (vig) {
        vig.style.display = 'none';
        vig.style.webkitMaskImage = '';
        vig.style.maskImage = '';
      }
    }
    if (contentEl) {
      el.style.opacity = '1';
      el.style.filter = '';
    }

    const filters = [];

    const applySharedFilters = (arr) => {
      if (obj.blur > 0) arr.push('blur(' + obj.blur + 'px)');
      if (obj.hue) arr.push('hue-rotate(' + obj.hue + 'deg)');
      if (obj.brightness !== undefined && obj.brightness !== 100) arr.push(`brightness(${obj.brightness}%)`);
      if (obj.contrast !== undefined && obj.contrast !== 100) arr.push(`contrast(${obj.contrast}%)`);
      if (obj.saturation !== undefined && obj.saturation !== 100) arr.push(`saturate(${obj.saturation}%)`);
      if (obj.grayscale > 0) arr.push(`grayscale(${obj.grayscale}%)`);
      if (obj.sepia > 0) arr.push(`sepia(${obj.sepia}%)`);
    };

    if (obj.isTheme) {
      const themeFilters = [];
      applySharedFilters(themeFilters);
      const themeImg = el.querySelector('img');
      if (themeImg) themeImg.style.filter = themeFilters.length ? themeFilters.join(' ') : '';
    } else if (obj.type === 'character') {
      // For characters, apply filters to all .tm-char-wrapper segments so body parts
      // in each segment are treated as one visual unit, while nested items stay unfiltered.
      applySharedFilters(filters);
      if (obj.enableShadow) {
        filters.push('drop-shadow(8px 8px 0px rgba(0, 0, 0, 0.45))');
      }
      if (obj.glow > 0) filters.push('drop-shadow(0 0 ' + obj.glow + 'px ' + (obj.glowColor || '#ffffff') + ')');
      const charWrappers = el.querySelectorAll('.tm-char-wrapper');
      charWrappers.forEach(charWrapper => {
        charWrapper.style.filter = filters.length ? filters.join(' ') : '';
      });
      // Clear the content-wrapper-level filter so it doesn't cascade to nested items
      targetEl.style.filter = '';
    } else {
      applySharedFilters(filters);
      if (obj.enableShadow) {
        filters.push('drop-shadow(8px 8px 0px rgba(0, 0, 0, 0.45))');
      }
      if (obj.glow > 0) filters.push('drop-shadow(0 0 ' + obj.glow + 'px ' + (obj.glowColor || '#ffffff') + ')');
      targetEl.style.filter = filters.length ? filters.join(' ') : '';
    }

    // Character pivot rotations (unchanged)
    if (obj.type === 'character' && obj.pivots) {
      const hg = el.querySelector('.tm-head-group');
      const ag = el.querySelector('.tm-arm-group');
      const bag = el.querySelector('.tm-base-arm-group');
      if (hg) {
        hg.style.transformOrigin = obj.pivots.headX + 'px ' + obj.pivots.headY + 'px';
        let ht = 'rotate(' + obj.headRotation + 'deg)';
        if (obj.headInverted) ht += ' scaleX(-1)';
        hg.style.transform = ht;
      }
      if (ag) {
        ag.style.transformOrigin = obj.pivots.armX + 'px ' + obj.pivots.armY + 'px';
        let at = 'rotate(' + obj.armRotation + 'deg)';
        if (obj.armInverted) at += ' scaleX(-1)';
        ag.style.transform = at;
      }
      if (bag) {
        const bx = obj.pivots.baseArmX !== undefined ? obj.pivots.baseArmX : obj.pivots.armX;
        const by = obj.pivots.baseArmY !== undefined ? obj.pivots.baseArmY : obj.pivots.armY;
        bag.style.transformOrigin = bx + 'px ' + by + 'px';
        let bat = 'rotate(' + (obj.baseArmRotation || 0) + 'deg)';
        if (obj.baseArmInverted) bat += ' scaleX(-1)';
        bag.style.transform = bat;
      }
    }

    // Text styling — dual-layer approach with 100% layout parity:
    //   Shadow layer (z1): transparent text + text-shadow + stroke (renders behind)
    //   Fill layer (z2): gradient/solid text + vignette, NO shadows (renders on top)
    if (obj.type === 'text' && obj.contentEl) {
      const ce = obj.contentEl;
      // Make ce fill its parent so text centers properly in the bounding box
      ce.style.position = 'absolute';
      ce.style.top = '0';
      ce.style.left = '0';
      ce.style.width = '100%';
      ce.style.height = '100%';
      ce.style.padding = '0';
      ce.style.boxSizing = 'border-box';
      // Clear any direct styles that might conflict
      ce.style.background = '';
      ce.style.webkitBackgroundClip = '';
      ce.style.backgroundClip = '';
      ce.style.webkitTextFillColor = '';
      ce.style.textShadow = 'none';
      ce.style.webkitTextStroke = '';
      ce.style.filter = '';

      let shadowEl = ce.querySelector('.tm-text-shadows');
      let fillEl = ce.querySelector('.tm-text-fill');

      if (!shadowEl || !fillEl) {
        // Clear ALL parent content (text nodes + any stale children)
        ce.innerHTML = '';

        // Shadow layer — behind fill, renders outline/emboss/glow/drop-shadow
        shadowEl = document.createElement('div');
        shadowEl.className = 'tm-text-shadows';
        shadowEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;padding:10px;box-sizing:border-box;z-index:1;pointer-events:none;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-wrap;word-wrap:break-word;line-height:1.2;';
        ce.appendChild(shadowEl);

        // Fill layer — on top, renders visible text color/gradient
        fillEl = document.createElement('div');
        fillEl.className = 'tm-text-fill';
        fillEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;padding:10px;box-sizing:border-box;z-index:2;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-wrap;word-wrap:break-word;line-height:1.2;';
        ce.appendChild(fillEl);
      }

      // Ensure inner spans exist on both layers to enforce 100% identical layout and wrapping
      let shadowInner = shadowEl.querySelector('.tm-text-shadows-inner');
      if (!shadowInner) {
        shadowEl.textContent = '';
        shadowInner = document.createElement('span');
        shadowInner.className = 'tm-text-shadows-inner';
        shadowInner.style.cssText = '-webkit-box-decoration-break:clone;box-decoration-break:clone;';
        shadowEl.appendChild(shadowInner);
      }

      let fillInner = fillEl.querySelector('.tm-text-fill-inner');
      if (!fillInner) {
        fillEl.textContent = '';
        fillInner = document.createElement('span');
        fillInner.className = 'tm-text-fill-inner';
        fillInner.style.cssText = '-webkit-box-decoration-break:clone;box-decoration-break:clone;';
        fillEl.appendChild(fillInner);
      }

      // Sync text content to both inner spans
      const txt = obj.text || '';
      if (fillInner.textContent !== txt) fillInner.textContent = txt;
      if (shadowInner.textContent !== txt) shadowInner.textContent = txt;

      // Sync typography and layout styles on both inner spans and their parent containers
      const fontSize = (obj.fontSize || 56) + 'px';
      const fontFamily = obj.fontFamily || "'Century Gothic', sans-serif";
      const letterSpacing = (obj.letterSpacing || 0) + 'px';
      const fontStyle = obj.italic ? 'italic' : 'normal';
      const textTransform = obj.textTransform || 'none';

      [fillEl, shadowEl].forEach(layer => {
        layer.style.fontSize = fontSize;
        layer.style.fontFamily = fontFamily;
        layer.style.letterSpacing = letterSpacing;
        layer.style.fontStyle = fontStyle;
        layer.style.textTransform = textTransform;
        layer.style.fontWeight = 'bold';
      });

      [fillInner, shadowInner].forEach(span => {
        span.style.fontSize = 'inherit';
        span.style.fontFamily = 'inherit';
        span.style.letterSpacing = 'inherit';
        span.style.fontStyle = 'inherit';
        span.style.textTransform = 'inherit';
        span.style.fontWeight = 'inherit';
        span.style.lineHeight = 'inherit';
      });

      // ── Fill Layer: gradient or solid color, with optional vignette ──
      fillInner.style.textShadow = 'none';
      fillInner.style.webkitTextStroke = '';
      fillInner.style.filter = '';
      fillEl.style.color = '';
      fillEl.style.webkitTextFillColor = '';

      // Build backgrounds
      let fillBg = '';
      if (obj.gradient) {
        const angle = obj.gradientAngle || 135;
        const c1 = obj.gradientColor1 || '#ffffff';
        const c2 = obj.gradientColor2 || '#00b4d8';
        fillBg = 'linear-gradient(' + angle + 'deg, ' + c1 + ', ' + c2 + ')';
      } else {
        const color = obj.color || '#ffffff';
        fillBg = 'linear-gradient(to right, ' + color + ', ' + color + ')';
      }

      if (obj.vignetteEnabled) {
        const vigI = obj.vignetteIntensity !== undefined ? obj.vignetteIntensity : 0.55;
        const vM = 0, v1 = 0.45 * vigI, v2 = 0.95 * vigI;
        const vigBg = 'radial-gradient(circle, rgba(0,0,0,' + vM + ') 28%, rgba(0,0,0,' + vM + ') 50%, rgba(0,0,0,' + v1 + ') 80%, rgba(0,0,0,' + v2 + ') 100%)';
        
        fillInner.style.background = vigBg + ', ' + fillBg;
        fillInner.classList.add('tm-text-fill-gradient');
      } else {
        if (obj.gradient) {
          fillInner.style.background = fillBg;
          fillInner.classList.add('tm-text-fill-gradient');
        } else {
          fillInner.style.background = '';
          fillInner.classList.remove('tm-text-fill-gradient');
          fillInner.style.color = obj.color || '#ffffff';
          fillInner.style.webkitTextFillColor = obj.color || '#ffffff';
        }
      }

      // Hide legacy vignette overlays if any exist
      let textVigOverlay = ce.querySelector('.tm-text-vignette-overlay');
      if (textVigOverlay) textVigOverlay.style.display = 'none';

      // ── Shadow Layer: transparent text, only renders shadows + stroke on the inner span ──
      shadowEl.style.color = 'transparent';
      shadowEl.style.webkitTextFillColor = 'transparent';
      shadowEl.style.background = '';
      shadowEl.style.textShadow = 'none';
      shadowEl.style.webkitTextStroke = '';

      shadowInner.style.color = 'transparent';
      shadowInner.style.webkitTextFillColor = 'transparent';

      // CSS text stroke on shadowInner
      if (obj.textStroke > 0) {
        shadowInner.style.webkitTextStroke = obj.textStroke + 'px ' + (obj.textStrokeColor || '#000000');
      } else {
        shadowInner.style.webkitTextStroke = '';
      }

      // Build text-shadow effects
      const shadows = [];
      if (obj.outlineSize > 0) {
        const s = obj.outlineSize, c = obj.outlineColor || '#000000';
        shadows.push(s + 'px ' + s + 'px 0 ' + c, '-' + s + 'px ' + s + 'px 0 ' + c, s + 'px -' + s + 'px 0 ' + c, '-' + s + 'px -' + s + 'px 0 ' + c);
      }
      if (obj.shadowSize > 0) {
        shadows.push((obj.shadowX || 4) + 'px ' + (obj.shadowY || 4) + 'px ' + obj.shadowSize + 'px rgba(0,0,0,0.45)');
      }
      if (obj.emboss) {
        const ec = obj.outlineColor || '#000000';
        for (let i = 1; i <= 6; i++) {
          shadows.push(i + 'px ' + i + 'px 0 ' + ec);
        }
      }
      if (obj.neonGlow > 0) {
        const nc = obj.glowColor || obj.color || '#ffffff';
        shadows.push('0 0 ' + (obj.neonGlow * 0.5) + 'px ' + nc);
        shadows.push('0 0 ' + obj.neonGlow + 'px ' + nc);
        shadows.push('0 0 ' + (obj.neonGlow * 2) + 'px ' + nc);
      }
      shadowInner.style.textShadow = shadows.length > 0 ? shadows.join(', ') : 'none';
    }

    // Item/block halo and fade (and we intentionally do NOT double-flip the img here because the root element is already flipped by scaleX(-1) above)
    if (obj.type === 'item' || obj.type === 'block' || obj.type === 'image') {
      const targetParent = el.querySelector(':scope > .tm-object-content') || el;
      let halo = targetParent.querySelector('.tm-media-halo');
      if (!halo) {
        halo = document.createElement('div');
        halo.className = 'tm-media-halo';
        targetParent.insertBefore(halo, targetParent.firstChild);
      }
      let fade = targetParent.querySelector('.tm-media-fade');
      if (!fade) {
        fade = document.createElement('div');
        fade.className = 'tm-media-fade';
        // insert after halo, before img
        targetParent.insertBefore(fade, targetParent.firstChild.nextSibling);
      }

      const px = obj.halo || 0;
      halo.style.opacity = px > 0 ? Math.min(1, px / 40) : 0;
      halo.style.boxShadow = `0 0 ${px * 1.2}px 6px rgba(255,255,255,0.55)`;
      halo.style.filter = px > 0 ? `blur(${Math.min(24, px * 0.5)}px)` : 'none';

      const f = obj.backFade || 0;
      fade.style.opacity = String(Math.max(0, Math.min(1, f)));
    }

    // Update all child elements parented to this object to cancel out parent scale/stretch distortion dynamically
    if (obj.id && typeof tmState !== 'undefined' && tmState.objects) {
      tmState.objects.forEach(child => {
        if (child.parentId === obj.id) {
          applyTransform(child, q);
        }
      });
    }
  }

  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  DRAG INTERACTION
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  function setupDrag(el, obj) {
    let dragging = false, sx, sy;
    let dragTargetObj = obj;
    let initialPositions = [];
    el.addEventListener('pointerdown', (e) => {
      if (tmState.isPinchScaling) return;
      if (e.target.closest('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle')) return;

      // Check if another object is currently selected and the click lies inside its bounding rect
      const sel = selected();
      dragTargetObj = obj; // Reset drag target to clicked object

      if (sel && sel.id !== obj.id && sel.el) {
        const selRect = sel.el.getBoundingClientRect();
        if (e.clientX >= selRect.left && e.clientX <= selRect.right &&
          e.clientY >= selRect.top && e.clientY <= selRect.bottom) {
          // Redirect selection and drag to the currently selected object!
          dragTargetObj = sel;
        }
      }

      if (dragTargetObj.isLocked) {
        // Let it bubble up to the global document pointerdown listener to allow starting a selection lasso
        tmDeselect();
        return;
      }
      if (dragTargetObj.isTheme) {
        // Let it bubble up to the global document pointerdown listener to allow starting a selection lasso
        return;
      }

      // Transparent click check for characters to allow clicking beside them to deselect
      if (dragTargetObj.type === 'character') {
        const targetEl = dragTargetObj.el;
        const rect = targetEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const clickX = (e.clientX - rect.left) * (dragTargetObj.width / rect.width);
          if (dragTargetObj.width >= 200) {
            const center = dragTargetObj.width / 2;
            const diffX = Math.abs(clickX - center);
            if (diffX > 220) {
              tmDeselect();
              return;
            }
          }
        }
      }

      e.stopPropagation();

      // If clicked item is already part of the multi-selection, preserve the multi-selection!
      const isAlreadySelected = tmState.selectedIds && tmState.selectedIds.includes(dragTargetObj.id);
      if (!isAlreadySelected) {
        tmSelectObject(dragTargetObj.id);
      }

      dragging = true;
      document.body.classList.add('tm-dragging');
      sx = e.clientX; sy = e.clientY;

      // Gather all objects that should be dragged together
      const dragGroup = (tmState.selectedIds && tmState.selectedIds.length > 0)
        ? tmState.selectedIds.map(id => getObj(id)).filter(Boolean)
        : [dragTargetObj];

      initialPositions = dragGroup.map(o => ({
        obj: o,
        ox: o.x,
        oy: o.y
      }));

      el.style.cursor = 'grabbing';
      try { el.setPointerCapture(e.pointerId); } catch (err) { }
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (tmState.isPinchScaling) {
        endDrag(e);
        return;
      }

      let wsScale = 1;
      const ws = document.getElementById('tm-workspace');
      if (ws && ws.style.transform) {
        const match = ws.style.transform.match(/scale\(([^)]+)\)/);
        if (match && match[1]) {
          wsScale = parseFloat(match[1]) || 1;
        }
      }

      let dx = (e.clientX - sx) / wsScale / TM_QUALITY;
      let dy = (e.clientY - sy) / wsScale / TM_QUALITY;

      initialPositions.forEach(pos => {
        const targetObj = pos.obj;
        let odx = dx;
        let ody = dy;

        // If nested, account for parent scale, rotation, and inversion (horizontal flip)
        if (targetObj.parentId) {
          const p = getObj(targetObj.parentId);
          if (p) {
            if (p.rotation) {
              const rad = -p.rotation * Math.PI / 180;
              const ndx = odx * Math.cos(rad) - ody * Math.sin(rad);
              const ndy = odx * Math.sin(rad) + ody * Math.cos(rad);
              odx = ndx; ody = ndy;
            }
            if (p.scale) {
              odx /= p.scale;
              ody /= p.scale;
            }
            if (p.inverted) {
              odx = -odx;
            }
          }
        }

        let targetX = pos.ox + odx;
        let targetY = pos.oy + ody;

        // Apply snapping ONLY when dragging a single block to keep it predictable
        if (initialPositions.length === 1 && targetObj.type === 'block' && !targetObj.parentId) {
          const snapThreshold = 12; // Snap radius in logical pixels
          const myW = targetObj.width;
          const myH = targetObj.height;

          // Loop over other blocks to find a snapping partner
          for (const other of tmState.objects) {
            if (other.type === 'block' && other.id !== targetObj.id && !other.parentId) {
              const otherW = other.width;
              const otherH = other.height;

              // Check potential horizontal snaps:
              if (Math.abs(targetX - (other.x + otherW)) < snapThreshold) {
                targetX = other.x + otherW;
                if (Math.abs(targetY - other.y) < snapThreshold) {
                  targetY = other.y;
                }
              }
              else if (Math.abs((targetX + myW) - other.x) < snapThreshold) {
                targetX = other.x - myW;
                if (Math.abs(targetY - other.y) < snapThreshold) {
                  targetY = other.y;
                }
              }

              // Check potential vertical snaps:
              if (Math.abs(targetY - (other.y + otherH)) < snapThreshold) {
                targetY = other.y + otherH;
                if (Math.abs(targetX - other.x) < snapThreshold) {
                  targetX = other.x;
                }
              }
              else if (Math.abs((targetY + myH) - other.y) < snapThreshold) {
                targetY = other.y - myH;
                if (Math.abs(targetX - other.x) < snapThreshold) {
                  targetX = other.x;
                }
              }

              // Also check pure alignment snaps:
              if (Math.abs(targetX - other.x) < snapThreshold) {
                targetX = other.x;
              }
              if (Math.abs(targetY - other.y) < snapThreshold) {
                targetY = other.y;
              }
            }
          }
        }

        targetObj.x = targetX;
        targetObj.y = targetY;
        applyTransform(targetObj);
      });
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('tm-dragging');
      el.style.cursor = 'grab';
      try { el.releasePointerCapture(e.pointerId); } catch { }

      // Push history if any object's position changed
      let hasMoved = initialPositions.some(pos => pos.obj.x !== pos.ox || pos.obj.y !== pos.oy);
      if (hasMoved) {
        if (window.tmPushHistoryState) window.tmPushHistoryState();
      }
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  }

  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  HANDLE SYSTEM (resize, rotate, delete, duplicate)
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  function addHandles(el, obj) {
    if (el.querySelector('.tm-handle')) return;

    // Corner resize handles (for all objects now)
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const h = document.createElement('div');
      h.className = 'tm-handle tm-handle-' + pos;
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        startResizing(e, obj, pos);
      });
      el.appendChild(h);
    });

    // Rotate handle
    const hRot = document.createElement('div');
    hRot.className = 'tm-rotate-handle';
    hRot.innerHTML = '<i data-lucide="rotate-cw"></i>';
    hRot.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      startRotating(e, obj);
    });
    el.appendChild(hRot);

    // Delete handle
    const hDel = document.createElement('div');
    hDel.className = 'tm-delete-handle';
    hDel.innerHTML = '<i data-lucide="trash-2"></i>';
    hDel.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tmDeleteSelected();
    });
    el.appendChild(hDel);

    // Duplicate handle
    const hDup = document.createElement('div');
    hDup.className = 'tm-duplicate-handle';
    hDup.innerHTML = '<i data-lucide="copy"></i>';
    hDup.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tmDuplicateSelected();
    });
    el.appendChild(hDup);

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  function removeHandles(el) {
    el.querySelectorAll('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle').forEach(h => h.remove());
  }

  // â”€â”€ Resize via corner handles â”€â”€
  let resizeData = null;
  function startResizing(e, obj, corner) {
    const dragGroup = (tmState.selectedIds && tmState.selectedIds.includes(obj.id))
      ? tmState.selectedIds.map(id => getObj(id)).filter(Boolean)
      : [obj];

    resizeData = {
      obj, corner,
      startX: e.clientX, startY: e.clientY,
      startW: obj.width, startH: obj.height,
      startObjX: obj.x, startObjY: obj.y,
      ratio: obj.width / obj.height,
      startScale: obj.scale || 1,
      startStretchX: obj.stretchX !== undefined ? obj.stretchX : 1,
      startStretchY: obj.stretchY !== undefined ? obj.stretchY : 1,
      selectedObjects: dragGroup.map(o => ({
        obj: o,
        startW: o.width, startH: o.height,
        startObjX: o.x, startObjY: o.y,
        ratio: o.width / o.height,
        startScale: o.scale || 1,
        startStretchX: o.stretchX !== undefined ? o.stretchX : 1,
        startStretchY: o.stretchY !== undefined ? o.stretchY : 1
      }))
    };
    document.body.classList.add('tm-dragging');
    window.addEventListener('pointermove', onResizing);
    window.addEventListener('pointerup', stopResizing);
  }

  function onResizing(e) {
    if (!resizeData) return;
    const { obj, corner, startX, startY, startW, startH, startObjX, startObjY, ratio, selectedObjects } = resizeData;

    let wsScale = 1;
    const ws = document.getElementById('tm-workspace');
    if (ws && ws.style.transform) {
      const match = ws.style.transform.match(/scale\(([^)]+)\)/);
      if (match && match[1]) {
        wsScale = parseFloat(match[1]) || 1;
      }
    }

    let dx = (e.clientX - startX) / wsScale / TM_QUALITY;
    let dy = (e.clientY - startY) / wsScale / TM_QUALITY;

    // Lock dragMode if not already locked
    if (!resizeData.dragMode) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 8) {
        const rad = Math.atan2(dy, dx);
        const deg = Math.abs(rad * 180 / Math.PI);
        let qDeg = deg;
        if (qDeg > 90) qDeg = 180 - qDeg;

        if (qDeg < 22.5) {
          resizeData.dragMode = 'stretchX';
        } else if (qDeg > 67.5) {
          resizeData.dragMode = 'stretchY';
        } else {
          resizeData.dragMode = 'scale';
        }
      } else {
        return; // Wait for distance threshold
      }
    }

    const mode = resizeData.dragMode;

    selectedObjects.forEach(info => {
      const targetObj = info.obj;

      // Swap logical corners for horizontal resizing if flipped horizontally
      let effCorner = corner;
      if (targetObj.inverted) {
        if (corner === 'br') effCorner = 'bl';
        else if (corner === 'bl') effCorner = 'br';
        else if (corner === 'tr') effCorner = 'tl';
        else if (corner === 'tl') effCorner = 'tr';
      }

      if (mode === 'scale') {
        // Uniform Scale
        let scaleRatio = 1;
        if (targetObj.type === 'character') {
          let dist = (effCorner === 'br' || effCorner === 'tl') ? (dx + dy) : (dx - dy);
          if (effCorner === 'bl') dist = -dx + dy;
          if (effCorner === 'tr') dist = dx - dy;
          if (effCorner === 'tl') dist = -dx - dy;
          if (effCorner === 'br') dist = dx + dy;

          // Divide by 2 to align sensitivity with single-axis stretchX/stretchY modes
          let scaleChange = (dist / 2) * 0.005;
          let newScale = info.startScale + scaleChange;
          if (newScale < 0.1) newScale = 0.1;
          targetObj.scale = newScale;
        } else {
          let nw = info.startW;
          // Dampen horizontal delta to balance quadratic area growth and match stretch feel
          const dampenedDx = dx * 0.6;
          if (effCorner === 'br') nw = info.startW + dampenedDx;
          else if (effCorner === 'bl') nw = info.startW - dampenedDx;
          else if (effCorner === 'tr') nw = info.startW + dampenedDx;
          else if (effCorner === 'tl') nw = info.startW - dampenedDx;

          if (nw < 20) nw = 20;
          scaleRatio = nw / info.startW;
          
          let newW = info.startW * scaleRatio;
          let newH = info.startH * scaleRatio;
          if (newW < 20) newW = 20;
          if (newH < 20) newH = 20;

          targetObj.width = Math.round(newW);
          targetObj.height = Math.round(newH);
        }
      } else if (mode === 'stretchX') {
        // Stretch X
        let scaleRatioX = 1;
        if (targetObj.type === 'character') {
          let distX = (effCorner === 'br' || effCorner === 'tr') ? dx : -dx;
          let scaleChangeX = distX * 0.005;
          let newStretchX = info.startStretchX + scaleChangeX;
          if (newStretchX < 0.1) newStretchX = 0.1;
          targetObj.stretchX = newStretchX;
        } else {
          let nw = info.startW;
          if (effCorner === 'br' || effCorner === 'tr') nw = info.startW + dx;
          else if (effCorner === 'bl' || effCorner === 'tl') nw = info.startW - dx;

          if (nw < 20) nw = 20;
          scaleRatioX = nw / info.startW;
          let newStretchX = info.startStretchX * scaleRatioX;
          if (newStretchX < 0.1) newStretchX = 0.1;
          targetObj.stretchX = newStretchX;
        }
      } else if (mode === 'stretchY') {
        // Stretch Y
        let scaleRatioY = 1;
        if (targetObj.type === 'character') {
          let distY = (effCorner === 'br' || effCorner === 'bl') ? dy : -dy;
          let scaleChangeY = distY * 0.005;
          let newStretchY = info.startStretchY + scaleChangeY;
          if (newStretchY < 0.1) newStretchY = 0.1;
          targetObj.stretchY = newStretchY;
        } else {
          let nh = info.startH;
          if (effCorner === 'br' || effCorner === 'bl') nh = info.startH + dy;
          else if (effCorner === 'tr' || effCorner === 'tl') nh = info.startH - dy;

          if (nh < 20) nh = 20;
          scaleRatioY = nh / info.startH;
          let newStretchY = info.startStretchY * scaleRatioY;
          if (newStretchY < 0.1) newStretchY = 0.1;
          targetObj.stretchY = newStretchY;
        }
      }

      applyTransform(targetObj);
    });

    const sliderScale = document.getElementById('tm-prop-scale');
    if (sliderScale) sliderScale.value = obj.scale;
    const sliderStretchX = document.getElementById('tm-prop-stretch-x');
    if (sliderStretchX) sliderStretchX.value = obj.stretchX !== undefined ? obj.stretchX : 1;
    const sliderStretchY = document.getElementById('tm-prop-stretch-y');
    if (sliderStretchY) sliderStretchY.value = obj.stretchY !== undefined ? obj.stretchY : 1;
  }

  function stopResizing() {
    document.body.classList.remove('tm-dragging');
    if (resizeData) {
      if (window.tmPushHistoryState) window.tmPushHistoryState();
    }
    resizeData = null;
    window.removeEventListener('pointermove', onResizing);
    window.removeEventListener('pointerup', stopResizing);
  }

  // â”€â”€ Rotate via handle â”€â”€
  let rotateData = null;
  function startRotating(e, obj) {
    const rect = obj.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dragGroup = (tmState.selectedIds && tmState.selectedIds.includes(obj.id))
      ? tmState.selectedIds.map(id => getObj(id)).filter(Boolean)
      : [obj];

    rotateData = {
      obj, cx, cy,
      startAngle: obj.rotation,
      startMouse: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI,
      selectedObjects: dragGroup.map(o => ({
        obj: o,
        startAngle: o.rotation
      }))
    };
    document.body.classList.add('tm-dragging');
    window.addEventListener('pointermove', onRotating);
    window.addEventListener('pointerup', stopRotating);
  }

  function onRotating(e) {
    if (!rotateData) return;
    const { obj, cx, cy, startAngle, startMouse, selectedObjects } = rotateData;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const diff = angle - startMouse;

    selectedObjects.forEach(info => {
      const targetObj = info.obj;
      targetObj.rotation = Math.round((info.startAngle + diff) % 360);
      applyTransform(targetObj);
    });

    const slider = document.getElementById('tm-prop-rotation');
    if (slider) slider.value = obj.rotation;
  }

  function stopRotating() {
    document.body.classList.remove('tm-dragging');
    if (rotateData) {
      if (window.tmPushHistoryState) window.tmPushHistoryState();
    }
    rotateData = null;
    window.removeEventListener('pointermove', onRotating);
    window.removeEventListener('pointerup', stopRotating);
  }
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  SELECTION & PROPERTY PANEL
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  function tmSelectMultipleObjects(ids) {
    // Clear selection classes and handles from previously selected items
    const prevIds = tmState.selectedIds || [];
    prevIds.forEach(pid => {
      const p = getObj(pid);
      if (p) {
        p.el.classList.remove('tm-selected');
        p.el.classList.remove('selected');
        removeHandles(p.el);
      }
    });

    tmState.selectedIds = ids;
    if (ids.length > 0) {
      tmState.selectedId = ids[ids.length - 1]; // Set primary to the last selected item
    } else {
      tmState.selectedId = null;
    }

    if (ids.length === 0) {
      if (window.tmShowGlobalSettings) window.tmShowGlobalSettings();
      if (window.tmResizeWorkspace) window.tmResizeWorkspace();
      tmRenderLayersPanel();
      return;
    }

    ids.forEach(id => {
      const obj = getObj(id);
      if (!obj) return;
      obj.el.classList.add('tm-selected');
      obj.el.classList.add('selected');

      // Add handles to the primary one, so they can drag/scale/rotate using its handles
      if (id === tmState.selectedId && !obj.isLocked && !obj.isTheme) {
        addHandles(obj.el, obj);
      }
      applyTransform(obj);
    });

    const obj = getObj(tmState.selectedId);
    if (!obj) return;

    // Show panel
    const panel = document.getElementById('tm-property-panel');
    if (panel) panel.classList.remove('hidden');
    if (window.tmResizeWorkspace) window.tmResizeWorkspace();

    // Hide global settings section and show object settings
    const globalSec = document.getElementById('tm-global-settings');
    if (globalSec) globalSec.classList.add('hidden');

    const transformSec = document.getElementById('tm-transform-controls');
    if (transformSec) transformSec.classList.remove('hidden');

    const visualsSec = document.getElementById('tm-visuals-controls');
    if (visualsSec) visualsSec.classList.remove('hidden');

    const removeBtn = document.getElementById('tm-remove-object-btn');
    if (removeBtn) removeBtn.style.display = '';

    const duplicateBtn = document.getElementById('tm-duplicate-object-btn');
    if (duplicateBtn) duplicateBtn.style.display = obj.isTheme ? 'none' : '';

    // Sync sliders
    const s = (sel, v) => { const e = document.getElementById(sel); if (e) e.value = v; };
    s('tm-prop-scale', obj.scale);
    s('tm-prop-stretch-x', obj.stretchX !== undefined ? obj.stretchX : 1);
    s('tm-prop-stretch-y', obj.stretchY !== undefined ? obj.stretchY : 1);
    s('tm-prop-rotation', obj.rotation);
    s('tm-prop-opacity', obj.opacity);
    s('tm-prop-blur', obj.blur || 0);
    s('tm-prop-glow', obj.glow || 0);
    s('tm-prop-hue', obj.hue || 0);
    s('tm-prop-brightness', obj.brightness !== undefined ? obj.brightness : 100);
    s('tm-prop-contrast', obj.contrast !== undefined ? obj.contrast : 100);
    s('tm-prop-saturation', obj.saturation !== undefined ? obj.saturation : 100);
    s('tm-prop-grayscale', obj.grayscale || 0);
    s('tm-prop-sepia', obj.sepia || 0);

    const cb = document.getElementById('tm-prop-vignette-enabled');
    if (cb) cb.checked = !!obj.vignetteEnabled;
    const slider = document.getElementById('tm-prop-vignette-intensity');
    if (slider) slider.value = obj.vignetteIntensity !== undefined ? obj.vignetteIntensity : 0.55;
    const intensityGroup = document.getElementById('tm-prop-vignette-intensity-group');
    if (intensityGroup) {
      intensityGroup.style.display = obj.vignetteEnabled ? '' : 'none';
    }

    // Toggle UI visibility
    const hueGrp = document.getElementById('tm-prop-group-hue');
    if (hueGrp) hueGrp.style.display = (obj.type === 'character') ? 'none' : '';

    const flipCb = document.getElementById('tm-prop-flip');
    if (flipCb) flipCb.checked = !!obj.inverted;
    const gc = document.getElementById('tm-prop-glow-color');
    if (gc) gc.value = obj.glowColor || '#ffffff';

    const shadowCb = document.getElementById('tm-prop-enable-shadow');
    if (shadowCb) shadowCb.checked = !!obj.enableShadow;

    // Hide Scale, Rotation, and Flip controls for theme layers
    const scaleSlider = document.getElementById('tm-prop-scale');
    const stretchXSlider = document.getElementById('tm-prop-stretch-x');
    const stretchYSlider = document.getElementById('tm-prop-stretch-y');
    const rotSlider = document.getElementById('tm-prop-rotation');
    const flipCheckbox = document.getElementById('tm-prop-flip');
    const scaleGroup = scaleSlider ? scaleSlider.closest('.tm-prop-group') : null;
    const stretchXGroup = stretchXSlider ? stretchXSlider.closest('.tm-prop-group') : null;
    const stretchYGroup = stretchYSlider ? stretchYSlider.closest('.tm-prop-group') : null;
    const rotGroup = rotSlider ? rotSlider.closest('.tm-prop-group') : null;
    const flipGroup = flipCheckbox ? flipCheckbox.closest('.tm-prop-group') : null;

    if (scaleGroup) scaleGroup.style.display = '';
    if (stretchXGroup) stretchXGroup.style.display = '';
    if (stretchYGroup) stretchYGroup.style.display = '';
    if (rotGroup) rotGroup.style.display = obj.isTheme ? 'none' : '';
    if (flipGroup) flipGroup.style.display = obj.isTheme ? 'none' : '';

    const shadowGroup = shadowCb ? shadowCb.closest('.tm-prop-group') : null;
    if (shadowGroup) shadowGroup.style.display = obj.isTheme ? 'none' : '';



    // Character-specific controls
    const charTools = document.getElementById('tm-character-tools');
    const poseCtrl = document.getElementById('tm-pose-controls');

    if (obj.type === 'character') {
      if (charTools) charTools.classList.remove('hidden');
      const remExprBtn = document.getElementById('tm-remove-expr-btn');
      if (remExprBtn) {
        remExprBtn.style.display = obj.expression ? 'flex' : 'none';
      }

      const exprRow = document.querySelector('.tm-expression-row');
      if (exprRow) {
        const skinType = tmGetSkinType(obj);
        if (['jester', 'skeleton', 'golden_skeleton', 'invisible'].includes(skinType) || obj.skinColor === 'rainbow') {
          exprRow.style.display = 'none';
        } else {
          exprRow.style.display = 'flex';
        }
      }
      if (poseCtrl) {
        poseCtrl.classList.remove('hidden');
        s('tm-prop-head-rot', obj.headRotation);
        s('tm-prop-arm-rot', obj.armRotation);
        s('tm-prop-base-arm-rot', obj.baseArmRotation || 0);
        const hInv = document.getElementById('tm-prop-head-invert');
        if (hInv) hInv.checked = !!obj.headInverted;
        const aInv = document.getElementById('tm-prop-arm-invert');
        if (aInv) aInv.checked = !!obj.armInverted;
        const baInv = document.getElementById('tm-prop-base-arm-invert');
        if (baInv) baInv.checked = !!obj.baseArmInverted;
      }
    } else {
      if (charTools) charTools.classList.add('hidden');
      if (poseCtrl) poseCtrl.classList.add('hidden');
    }

    // Block/Image/Item FX section
    const blockFx = document.getElementById('tm-block-fx');
    if (blockFx) {
      blockFx.classList.toggle('hidden', !['block', 'image', 'item'].includes(obj.type));
      if (['block', 'image', 'item'].includes(obj.type)) {
        s('tm-prop-halo', obj.halo || 0);
        s('tm-prop-backfade', obj.backFade || 0);
      }
    }

    // Text controls
    const textSec = document.getElementById('tm-text-controls');
    if (textSec) {
      textSec.classList.toggle('hidden', obj.type !== 'text');
      if (obj.type === 'text') {
        s('tm-prop-font-size', obj.fontSize || 56);
        s('tm-prop-outline-size', obj.outlineSize || 0);
        s('tm-prop-shadow-size', obj.shadowSize || 0);
        const ta = document.getElementById('tm-prop-text-content');
        if (ta) ta.value = obj.text || '';
        const col = document.getElementById('tm-prop-text-color');
        if (col) col.value = obj.color || '#ffffff';
        const ocol = document.getElementById('tm-prop-outline-color');
        if (ocol) ocol.value = obj.outlineColor || '#000000';
        const ff = document.getElementById('tm-prop-font-family');
        if (ff) ff.value = obj.fontFamily || "'Century Gothic', sans-serif";

        // New text effect controls
        s('tm-prop-letter-spacing', obj.letterSpacing || 0);
        s('tm-prop-text-stroke', obj.textStroke || 0);
        s('tm-prop-neon-glow', obj.neonGlow || 0);
        s('tm-prop-gradient-angle', obj.gradientAngle || 135);
        const tsc = document.getElementById('tm-prop-text-stroke-color');
        if (tsc) tsc.value = obj.textStrokeColor || '#000000';
        const gc1 = document.getElementById('tm-prop-gradient-color1');
        if (gc1) gc1.value = obj.gradientColor1 || '#ffffff';
        const gc2 = document.getElementById('tm-prop-gradient-color2');
        if (gc2) gc2.value = obj.gradientColor2 || '#00b4d8';
        const emb = document.getElementById('tm-prop-emboss');
        if (emb) emb.checked = !!obj.emboss;
        const ital = document.getElementById('tm-prop-italic');
        if (ital) ital.checked = !!obj.italic;
        const grad = document.getElementById('tm-prop-gradient');
        if (grad) grad.checked = !!obj.gradient;
        const gcolors = document.getElementById('tm-gradient-colors');
        if (gcolors) gcolors.style.display = obj.gradient ? 'grid' : 'none';
        const gangle = document.getElementById('tm-gradient-angle-group');
        if (gangle) gangle.style.display = obj.gradient ? '' : 'none';
        const tt = document.getElementById('tm-prop-text-transform');
        if (tt) tt.value = obj.textTransform || 'none';
      }
    }

    // Label
    const lbl = document.getElementById('tm-selected-type');
    if (lbl) {
      if (ids.length > 1) {
        lbl.textContent = 'Selected Group (' + ids.length + ' items)';
      } else {
        if (obj.type === 'character') lbl.textContent = 'Character';
        else if (obj.type === 'block') lbl.textContent = 'Block';
        else if (obj.type === 'item') lbl.textContent = 'Item';
        else if (obj.type === 'text') lbl.textContent = 'Text';
        else if (obj.type === 'image') lbl.textContent = 'Image';
        else lbl.textContent = 'Object Properties';
      }
    }

    tmRenderLayersPanel();
  }

  function tmSelectObject(id) {
    tmSelectMultipleObjects([id]);
  }

  window.tmDeselect = function () {
    const ids = tmState.selectedIds || [];
    ids.forEach(id => {
      const obj = getObj(id);
      if (obj) {
        obj.el.classList.remove('tm-selected');
        obj.el.classList.remove('selected');
        removeHandles(obj.el);
      }
    });
    const prev = selected();
    if (prev) {
      prev.el.classList.remove('tm-selected');
      prev.el.classList.remove('selected');
      removeHandles(prev.el);
    }
    tmState.selectedId = null;
    tmState.selectedIds = [];
    if (window.tmShowGlobalSettings) window.tmShowGlobalSettings();
    if (window.tmResizeWorkspace) window.tmResizeWorkspace();
    tmRenderLayersPanel();
  };

  window.tmDeleteSelected = function () {
    const obj = selected();
    if (!obj) return;
    if (window.tmPushHistoryState) window.tmPushHistoryState();

    function deleteObjectRecursive(targetObj) {
      const children = tmState.objects.filter(o => o.parentId === targetObj.id);
      children.forEach(child => deleteObjectRecursive(child));

      if (targetObj.el) targetObj.el.remove();
      tmState.objects = tmState.objects.filter(o => o.id !== targetObj.id);
    }

    deleteObjectRecursive(obj);

    tmDeselect();

    // Toggle active theme class on workspace if theme was deleted
    const wsElement = document.getElementById('tm-workspace');
    if (wsElement) {
      const hasTheme = tmState.objects.some(o => o.isTheme);
      if (hasTheme) {
        wsElement.classList.add('tm-theme-active');
      } else {
        wsElement.classList.remove('tm-theme-active');
        window.tmCurrentWorkspaceThemeId = null;
      }
    }

    tmRenderLayersPanel();
    tmAutoSaveWorkspace();
  };

  window.tmDuplicateSelected = function () {
    const obj = selected();
    if (!obj || obj.isTheme) return;
    if (window.tmPushHistoryState) window.tmPushHistoryState();
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;

    // Clone the DOM element
    const newEl = obj.el.cloneNode(true);
    newEl.classList.remove('tm-selected', 'selected');
    newEl.querySelectorAll('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle').forEach(h => h.remove());

    const newId = 'tm-' + obj.type + '-' + tmState.nextId++;
    newEl.dataset.id = newId;

    const newObj = {
      ...JSON.parse(JSON.stringify(obj)),  // deep copy data
      id: newId,
      el: newEl,
      x: obj.x + 30,
      y: obj.y + 30
    };

    // Restore contentEl reference for text
    if (newObj.type === 'text') {
      newObj.contentEl = newEl.querySelector('.tm-text-content');
    }

    ws.appendChild(newEl);
    tmState.objects.push(newObj);

    // If duplicating a character, handle nested child objects properly
    if (obj.type === 'character') {
      const children = tmState.objects.filter(o => o.parentId === obj.id);

      // Clear the cloned DOM wrapper children representing nested tm-objects
      const charWrap = newEl.querySelector('.tm-char-wrapper');
      if (charWrap) {
        charWrap.querySelectorAll('.tm-object').forEach(el => el.remove());
      }

      children.forEach(child => {
        const childNewId = 'tm-' + child.type + '-' + tmState.nextId++;
        const childNewObj = {
          ...JSON.parse(JSON.stringify(child)),
          id: childNewId,
          parentId: newId, // Parented to the new duplicated character
          x: child.x,
          y: child.y
        };

        const childNewEl = tmRebuildObjectDOM(childNewObj);
        childNewObj.el = childNewEl;

        const parent = tmGetContentParent(newEl);
        if (parent) {
          parent.appendChild(childNewEl);
        }

        tmState.objects.push(childNewObj);
        applyTransform(childNewObj);
        setupDrag(childNewEl, childNewObj);
      });
    }

    applyTransform(newObj);
    setupDrag(newEl, newObj);
    tmSelectObject(newId);
    tmRenderLayersPanel();
    tmAutoSaveWorkspace();
  };

  window.tmHidePropertyPanel = function () {
    const panel = document.getElementById('tm-property-panel');
    if (panel) panel.classList.add('hidden');
    if (window.tmResizeWorkspace) window.tmResizeWorkspace();
  };

  window.tmUpdateVignetteUI = function () {
    // Obsolete - vignette is now a per-layer property
  };

  window.tmToggleGlobalVignette = function (enabled) {
    // Obsolete - vignette is now a per-layer property
  };

  window.tmUpdateGlobalVignetteIntensity = function (val) {
    // Obsolete - vignette is now a per-layer property
  };

  window.tmShowGlobalSettings = function () {
    if (window.tmHidePropertyPanel) window.tmHidePropertyPanel();
  };

  // ── Property handlers ──
  window.tmUpdateProperty = function (prop, value) {
    const selectedIds = tmState.selectedIds || [];
    const targets = selectedIds.length > 0 ? selectedIds.map(id => getObj(id)).filter(Boolean) : [selected()].filter(Boolean);
    if (targets.length === 0) return;

    targets.forEach(obj => {
      if (['scale', 'stretchX', 'stretchY', 'rotation', 'opacity', 'blur', 'glow', 'halo', 'backFade', 'hue', 'brightness', 'contrast', 'saturation', 'grayscale', 'sepia'].includes(prop)) {
        obj[prop] = parseFloat(value);
      } else if (prop === 'inverted') {
        obj.inverted = !!value;
      } else if (prop === 'glowColor') {
        obj.glowColor = value;
      } else if (prop === 'enableShadow') {
        obj.enableShadow = !!value;
      } else if (prop === 'vignetteEnabled') {
        obj.vignetteEnabled = !!value;
        const intensityGroup = document.getElementById('tm-prop-vignette-intensity-group');
        if (intensityGroup) intensityGroup.style.display = obj.vignetteEnabled ? '' : 'none';
      } else if (prop === 'vignetteIntensity') {
        obj.vignetteIntensity = parseFloat(value);
      }
      applyTransform(obj);
    });
  };

  window.tmUpdatePose = function (prop, value, isCheckbox) {
    const selectedIds = tmState.selectedIds || [];
    const targets = selectedIds.length > 0 ? selectedIds.map(id => getObj(id)).filter(Boolean) : [selected()].filter(Boolean);
    targets.forEach(obj => {
      if (obj.type !== 'character') return;
      obj[prop] = isCheckbox ? !!value : parseFloat(value);
      applyTransform(obj);
    });
  };
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  BLOCKS
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  function tmAddBlock(block) {
    if (window.tmPushHistoryState) window.tmPushHistoryState();
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;
    const src = block.src || 'worldplanner/Blocks/' + block.id + '/' + block.id + '_0.png';
    const id = 'tm-block-' + tmState.nextId++;

    const root = document.createElement('div');
    root.className = 'tm-object';
    root.dataset.id = id;
    root.dataset.type = 'block';

    const img = document.createElement('img');
    img.src = src;
    img.draggable = false;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.imageRendering = 'pixelated';
    img.style.pointerEvents = 'none';
    root.appendChild(img);

    const center = tmGetLogicalWorkspaceCenter(120, 120);
    const obj = {
      id, type: 'block', el: root,
      x: center.x, y: center.y, width: 120, height: 120,
      scale: 1, stretchX: 1, stretchY: 1, rotation: 0, opacity: 1,
      blur: 0, glow: 0, glowColor: '#ffffff',
      inverted: false, halo: 0, backFade: 0,
      data: { src, blockId: block.id },
      vignetteEnabled: false,
      vignetteIntensity: 0.55
    };

    ws.appendChild(root);
    tmState.objects.push(obj);
    applyTransform(obj);
    setupDrag(root, obj);
    tmSelectObject(id);
    tmRenderLayersPanel();
  }

  window.tmOpenWPCatalogueForThumbnail = async function () {
    if (typeof loadWPManifest === 'function' && (typeof wpBlocks === 'undefined' || !wpBlocks.length)) {
      await loadWPManifest();
    }
    window.wpCatalogueThumbPick = function (block) {
      tmAddBlock(block);
    };
    const cat = document.getElementById('blockCatalogue');
    if (!cat) return;
    if (cat.parentElement !== document.body) {
      document.body.appendChild(cat);
    }
    cat.style.zIndex = '100060';
    cat.classList.remove('hidden');
    if (typeof renderWPCollection === 'function') renderWPCollection();
  };

  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  ITEMS (uses img src from index.html menus)
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  function tmResolveLiStaticSrc(li) {
    if (li.dataset.src) return li.dataset.src;
    if (li.dataset.hat) return li.dataset.hat;
    if (li.dataset.animated === 'true' && li.dataset.frames) {
      return li.dataset.frames.replace(/\/$/, '') + '/1.png';
    }
    return null;
  }

  function tmItemLabelFromLi(li) {
    const t = li.querySelector('.roadmap-item-text') || li.querySelector('.item-name');
    return (t && t.textContent.trim()) || tmResolveLiStaticSrc(li) || 'Item';
  }

  window.tmCloseItemsCatalogModal = function () {
    const m = document.getElementById('tm-items-catalog-modal');
    if (m) m.classList.add('hidden');
  };

  window.tmOpenItemsCatalogModal = function () {
    const m = document.getElementById('tm-items-catalog-modal');
    if (m) {
      m.classList.remove('hidden');
      const inp = document.getElementById('tm-items-search');
      if (inp) inp.value = '';
      tmRenderItemsCatalog();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  };

  window.tmRenderItemsCatalog = function () {
    const body = document.getElementById('tm-items-catalog-body');
    if (!body) return;
    const q = (document.getElementById('tm-items-search')?.value || '').trim().toLowerCase();
    body.innerHTML = '';

    TM_ITEM_SUBMENU_IDS.forEach(subId => {
      const ul = document.getElementById(subId);
      if (!ul) return;
      const sectionItems = [];
      ul.querySelectorAll(':scope > li').forEach(li => {
        const spriteSrc = tmResolveLiStaticSrc(li);
        // Use the same img src as displayed in index
        const iconSrc = li.querySelector('img')?.src;
        if (!iconSrc && !spriteSrc) return;
        const label = tmItemLabelFromLi(li);
        if (q && !label.toLowerCase().includes(q) && !(spriteSrc || '').toLowerCase().includes(q)) return;
        sectionItems.push({ li, label, iconSrc: iconSrc || spriteSrc, spriteSrc: spriteSrc || iconSrc });
      });
      if (sectionItems.length === 0) return;

      const header = document.createElement('div');
      header.className = 'tm-items-section-header';
      header.textContent = TM_ITEM_SUBMENU_TITLES[subId] || subId;
      body.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'tm-items-section-grid';

      sectionItems.forEach(({ li, label, iconSrc, spriteSrc }) => {
        const cell = document.createElement('div');
        cell.className = 'wp-cat-item tm-item-catalog-cell';
        cell.title = label;
        const img = document.createElement('img');
        img.src = iconSrc;  // Use the index.html menu icon
        img.alt = label;
        img.style.objectFit = 'contain';
        img.style.maxHeight = '48px';
        img.style.imageRendering = 'pixelated';
        cell.appendChild(img);
        const cap = document.createElement('span');
        cap.className = 'wp-cat-name';
        cap.textContent = label.length > 28 ? label.slice(0, 26) + '\u2026' : label;
        cell.appendChild(cap);
        cell.onclick = () => {
          // If icon and sprite differ, show choice modal
          if (iconSrc && spriteSrc && iconSrc !== spriteSrc) {
            tmShowItemChoice(label, iconSrc, spriteSrc);
          } else {
            tmAddItemToWorkspace(iconSrc || spriteSrc, label);
            tmCloseItemsCatalogModal();
          }
        };
        grid.appendChild(cell);
      });
      body.appendChild(grid);
    });

    if (!body.children.length) {
      body.innerHTML = '<p class="tm-items-empty">No items match your search.</p>';
    }
  };

  function tmShowItemChoice(label, iconSrc, spriteSrc) {
    const modal = document.getElementById('tm-item-choice-modal');
    if (!modal) { tmAddItemToWorkspace(iconSrc, label); tmCloseItemsCatalogModal(); return; }
    const iconImg = document.getElementById('tm-choice-icon')?.querySelector('img');
    const spriteImg = document.getElementById('tm-choice-sprite')?.querySelector('img');
    if (iconImg) iconImg.src = iconSrc;
    if (spriteImg) spriteImg.src = spriteSrc;
    modal.classList.remove('hidden');
    document.getElementById('tm-choice-icon').onclick = () => {
      tmAddItemToWorkspace(iconSrc, label);
      modal.classList.add('hidden');
      tmCloseItemsCatalogModal();
    };
    document.getElementById('tm-choice-sprite').onclick = () => {
      tmAddItemToWorkspace(spriteSrc, label);
      modal.classList.add('hidden');
      tmCloseItemsCatalogModal();
    };
  }

  window.tmCloseItemChoiceModal = function () {
    const m = document.getElementById('tm-item-choice-modal');
    if (m) m.classList.add('hidden');
  };

  function tmAddItemToWorkspace(src, label) {
    if (window.tmPushHistoryState) window.tmPushHistoryState();
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;
    const id = 'tm-item-' + tmState.nextId++;

    const root = document.createElement('div');
    root.className = 'tm-object';
    root.dataset.id = id;
    root.dataset.type = 'item';

    const img = document.createElement('img');
    img.src = src;
    img.draggable = false;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.imageRendering = 'pixelated';
    img.style.pointerEvents = 'none';
    root.appendChild(img);

    const center = tmGetLogicalWorkspaceCenter(200, 200);
    const obj = {
      id, type: 'item', el: root,
      x: center.x, y: center.y, width: 200, height: 200,
      scale: 1, stretchX: 1, stretchY: 1, rotation: 0, opacity: 1,
      blur: 0, glow: 0, glowColor: '#ffffff',
      inverted: false, halo: 0, backFade: 0,
      data: { src, label },
      vignetteEnabled: false,
      vignetteIntensity: 0.55
    };

    ws.appendChild(root);
    tmState.objects.push(obj);
    applyTransform(obj);
    setupDrag(root, obj);
    tmSelectObject(id);
    tmRenderLayersPanel();
  }

  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  CONSUMABLES
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  window.tmCloseConsumablesCatalogModal = function () {
    const m = document.getElementById('tm-consumables-catalog-modal');
    if (m) m.classList.add('hidden');
  };

  window.tmOpenConsumablesCatalogModal = async function () {
    const m = document.getElementById('tm-consumables-catalog-modal');
    if (m) {
      m.classList.remove('hidden');
      const inp = document.getElementById('tm-consumables-search');
      if (inp) inp.value = '';
      
      // Load blocks/themes manifest if not already loaded so we can filter duplicates accurately
      if (typeof loadWPManifest === 'function' && (typeof wpBlocks === 'undefined' || !wpBlocks.length)) {
        await loadWPManifest();
      }
      
      tmRenderConsumablesCatalog();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  };

  window.tmRenderConsumablesCatalog = function () {
    const body = document.getElementById('tm-consumables-catalog-body');
    if (!body) return;
    const q = (document.getElementById('tm-consumables-search')?.value || '').trim().toLowerCase();
    body.innerHTML = '';

    // ── Badges Section ──
    const badgeFiles = [
      { src: 'badges/spr_badge_staff.png', label: 'Staff Badge' },
      { src: 'badges/spr_role_1.png', label: 'Role Badge 1' },
      { src: 'badges/spr_role_3.png', label: 'Role Badge 3' },
      { src: 'badges/spr_role_4.png', label: 'Role Badge 4' },
      { src: 'badges/spr_role_5.png', label: 'Role Badge 5' },
      { src: 'badges/spr_role_6.png', label: 'Role Badge 6' },
      { src: 'badges/spr_role_7.png', label: 'Role Badge 7' },
      { src: 'badges/spr_role_8.png', label: 'Role Badge 8' }
    ];
    const filteredBadges = badgeFiles.filter(b => !q || b.label.toLowerCase().includes(q) || b.src.toLowerCase().includes(q));
    if (filteredBadges.length > 0) {
      const badgeHeader = document.createElement('h3');
      badgeHeader.className = 'tm-items-section-header';
      badgeHeader.textContent = 'Badges';
      badgeHeader.style.cssText = 'color: #a8dadc; font-size: 14px; margin: 12px 16px 8px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700;';
      body.appendChild(badgeHeader);
      const badgeGrid = document.createElement('div');
      badgeGrid.className = 'tm-items-section-grid';
      filteredBadges.forEach(badge => {
        const cell = document.createElement('div');
        cell.className = 'wp-cat-item tm-item-catalog-cell';
        cell.title = badge.label;
        const img = document.createElement('img');
        img.src = badge.src;
        img.alt = badge.label;
        img.style.imageRendering = 'pixelated';
        cell.appendChild(img);
        const cap = document.createElement('span');
        cap.className = 'wp-cat-name';
        cap.textContent = badge.label;
        cell.appendChild(cap);
        cell.onclick = () => {
          tmAddItemToWorkspace(badge.src, badge.label);
          tmCloseConsumablesCatalogModal();
        };
        badgeGrid.appendChild(cell);
      });
      body.appendChild(badgeGrid);
    }

    const extraItems = [
      "worldplanner/new/spr_ca_fish_bottle/spr_ca_fish_bottle_0.png",
      "worldplanner/Blocks/spr_ca_fish_clown/spr_ca_fish_clown_0.png",
      "worldplanner/Blocks/spr_ca_fish_crab/spr_ca_fish_crab_0.png",
      "worldplanner/Blocks/spr_ca_love_fish/spr_ca_love_fish_0.png",
      "worldplanner/Blocks/spr_ca_fish_marlin/spr_ca_fish_marlin_0.png",
      "worldplanner/Blocks/spr_ca_fish_shark/spr_ca_fish_shark_0.png",
      "worldplanner/Blocks/spr_ca_fishing_stingray/spr_ca_fishing_stingray_0.png",
      "worldplanner/Blocks/spr_ca_fish_lobster/spr_ca_fish_lobster_0.png",
      "worldplanner/Blocks/spr_ca_fish_tuna_small/spr_ca_fish_tuna_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_tuna/spr_ca_fish_tuna_0.png",
      "worldplanner/Blocks/spr_ca_fish_tuna_big/spr_ca_fish_tuna_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_squid_small/spr_ca_fish_squid_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_squid/spr_ca_fish_squid_0.png",
      "worldplanner/Blocks/spr_ca_fish_squid_big/spr_ca_fish_squid_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_piranha_small/spr_ca_fish_piranha_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_piranha/spr_ca_fish_piranha_0.png",
      "worldplanner/Blocks/spr_ca_fish_piranha_big/spr_ca_fish_piranha_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_tropical_small/spr_ca_fish_tropical_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_tropical/spr_ca_fish_tropical_0.png",
      "worldplanner/Blocks/spr_ca_fish_tropical_big/spr_ca_fish_tropical_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_goldfish_small/spr_ca_fish_goldfish_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_goldfish/spr_ca_fish_goldfish_0.png",
      "worldplanner/Blocks/spr_ca_fish_goldfish_big/spr_ca_fish_goldfish_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_salmon_small/spr_ca_fish_salmon_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_salmon/spr_ca_fish_salmon_0.png",
      "worldplanner/Blocks/spr_ca_fish_salmon_big/spr_ca_fish_salmon_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_catfish_small/spr_ca_fish_catfish_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_catfish/spr_ca_fish_catfish_0.png",
      "worldplanner/Blocks/spr_ca_fish_catfish_big/spr_ca_fish_catfish_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_trout_small/spr_ca_fish_trout_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_trout/spr_ca_fish_trout_0.png",
      "worldplanner/Blocks/spr_ca_fish_trout_big/spr_ca_fish_trout_big_0.png",
      "worldplanner/Blocks/spr_ca_fish_carp_small/spr_ca_fish_carp_small_0.png",
      "worldplanner/Blocks/spr_ca_fish_carp/spr_ca_fish_carp_0.png",
      "worldplanner/Blocks/spr_ca_fish_carp_big/spr_ca_fish_carp_big_0.png"
    ];

    let manifestList = window.TM_CONSUMABLES_MANIFEST || [];
    let combinedList = [...extraItems, ...manifestList];

    if (combinedList.length > 0) {
      // Gather existing items from Set Planner menus
      const existingItemSrcs = new Set();
      const existingItemLabels = new Set();
      if (typeof TM_ITEM_SUBMENU_IDS !== 'undefined') {
        TM_ITEM_SUBMENU_IDS.forEach(subId => {
          const ul = document.getElementById(subId);
          if (!ul) return;
          ul.querySelectorAll(':scope > li').forEach(li => {
            const spriteSrc = tmResolveLiStaticSrc(li);
            const iconSrc = li.querySelector('img')?.src;
            const label = tmItemLabelFromLi(li);

            if (spriteSrc) {
              const cleanSprite = spriteSrc.toLowerCase();
              existingItemSrcs.add(cleanSprite);
              const fname = cleanSprite.split('/').pop().replace('.png', '').replace(/_\d+$/, '');
              existingItemSrcs.add(fname);
            }
            if (iconSrc) {
              const cleanIcon = iconSrc.toLowerCase();
              existingItemSrcs.add(cleanIcon);
              const fname = cleanIcon.split('/').pop().replace('.png', '').replace(/_\d+$/, '');
              existingItemSrcs.add(fname);
            }
            if (label) {
              existingItemLabels.add(label.trim().toLowerCase());
              existingItemLabels.add(label.trim().toLowerCase().replace(/\s+/g, '_'));
            }
          });
        });
      }

      // Gather existing blocks and themes from World Planner
      const blockIds = new Set((window.wpBlocks || []).map(b => b.id.toLowerCase()));
      const blockNames = new Set((window.wpBlocks || []).map(b => b.name.toLowerCase().trim()));
      const themeIds = new Set((window.wpManifestThemes || []).map(t => t.id.toLowerCase()));
      const themeNames = new Set((window.wpManifestThemes || []).map(t => t.name.toLowerCase().trim()));

      const duplicatePrefixes = [
        'spr_hat_', 'hat_', 'spr_mask_', 'mask_',
        'spr_hair_', 'hair_',
        'spr_face_', 'face_',
        'spr_eye_', 'eye_',
        'spr_wing_', 'wing_',
        'spr_cape_', 'cape_',
        'spr_shirt_', 'shirt_',
        'spr_pant_', 'pant_',
        'spr_shoe_', 'shoe_',
        'spr_pet_', 'pet_',
        'spr_car_', 'car_',
        'spr_float_', 'float_',
        'spr_scarf_', 'scarf_',
        'spr_wa_'
      ];

      const consumables = combinedList.filter(path => {
        // 1. Hardcoded extra items (fish) always stay
        if (extraItems.includes(path)) return true;

        const pathLower = path.toLowerCase();
        const filename = pathLower.split('/').pop();
        const foldername = path.split('/').slice(-2, -1)[0].toLowerCase();
        const cleanName = filename.replace(/_\d+\.png$/, '').replace(/\.png$/, '');

        // 0. EXPLICIT DUPLICATES EXCLUSION REQUESTED BY USER
        const fLower = foldername.toLowerCase();
        const cLower = cleanName.toLowerCase();
        if (fLower.includes('jester') || cLower.includes('jester')) return false;
        if (fLower.includes('portal') || cLower.includes('portal')) return false;
        if (fLower.includes('brick') || cLower.includes('brick')) return false;
        if (fLower.includes('bg_') || cLower.includes('bg_') || fLower.includes('background') || cLower.includes('background') || fLower.includes('wall') || cLower.includes('wall')) return false;
        if (fLower.includes('window') || cLower.includes('window')) return false;
        if (fLower.includes('curtain') || cLower.includes('curtain')) return false;
        if (fLower.includes('character_') || cLower.includes('character_')) return false;
        if (fLower.includes('diaper') || cLower.includes('diaper')) return false;
        if (fLower.includes('display') || cLower.includes('display')) return false;
        if (fLower.includes('death') || cLower.includes('death')) return false;

        // Exclude seeds (tiling parts) or helper assets
        if (foldername.includes('seed') || cleanName.includes('seed') || foldername === 'spr_') return false;

        // Exclude background themes / backgrounds
        if (foldername.startsWith('bg_') || cleanName.startsWith('bg_') || foldername.includes('background') || cleanName.includes('background')) {
          return false;
        }
        if (themeIds.has(foldername) || themeIds.has(cleanName)) return false;

        // Exclude doors
        if (foldername.includes('door') || cleanName.includes('door')) return false;

        // Exclude wearable / character parts (e.g. spr_wa_...)
        if (foldername.startsWith('spr_wa_') || cleanName.startsWith('spr_wa_')) return false;

        // Exclude items matching Set Planner submenus prefixes
        for (const prefix of duplicatePrefixes) {
          if (foldername.startsWith(prefix) || cleanName.startsWith(prefix)) return false;
        }

        // Exclude matches in existing Set Planner items
        if (existingItemSrcs.has(foldername) || existingItemSrcs.has(cleanName) || existingItemSrcs.has(pathLower)) return false;

        // Exclude if cleanName matches an existing item label
        const cleanNameNoSpr = cleanName.replace(/^spr_/, '').replace(/_/g, ' ').trim();
        if (existingItemLabels.has(cleanNameNoSpr)) return false;

        // Exclude if foldername matches an existing block ID or block name
        if (blockIds.has(foldername) || blockIds.has(cleanName) || blockIds.has(cleanName.replace(/^spr_/, ''))) return false;
        const cleanNameNoSprBlock = cleanName.replace(/^spr_fg_/, '').replace(/^spr_bg_/, '').replace(/^spr_/, '').replace(/_/g, ' ').trim();
        if (blockNames.has(cleanNameNoSprBlock)) return false;

        // Include NPCs, Consumables (NPCs and ca always stay if not already filtered)
        const isNPC = foldername.includes('npc') || cleanName.includes('npc');
        const isConsumable = foldername.startsWith('spr_ca_') || cleanName.startsWith('spr_ca_');
        if (isNPC || isConsumable) return true;

        // Filter out general blocks (anything containing "block" or "tile")
        if (foldername.includes('block') || cleanName.includes('block') || foldername.includes('tile') || cleanName.includes('tile')) return false;

        // Default include for anything else (UI elements, miscellaneous)
        return true;
      }).filter(path => {
        if (!q) return true;
        const cleanName = path.split('/').pop().toLowerCase().replace('_0.png', '')
          .replace(/^spr_/, '').replace(/^fg_/, '').replace(/^ca_/, '').replace(/^wa_/, '').replace(/_/g, ' ');
        return cleanName.includes(q) || path.toLowerCase().includes(q);
      });

      if (consumables.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'tm-items-section-grid';
        consumables.forEach(path => {
          let label = path.split('/').pop().replace('_0.png', '');
          // Remove messy prefixes and clean up underscores
          label = label.replace(/^spr_/, '').replace(/^fg_/, '').replace(/^ca_/, '').replace(/^wa_/, '');
          label = label.replace(/_/g, ' ').trim();

          const cell = document.createElement('div');
          cell.className = 'wp-cat-item tm-item-catalog-cell';
          cell.title = path;
          const img = document.createElement('img');
          img.src = path;
          img.alt = label;
          img.style.imageRendering = 'pixelated';
          cell.appendChild(img);
          const cap = document.createElement('span');
          cap.className = 'wp-cat-name';
          cap.textContent = label.length > 28 ? label.slice(0, 26) + '…' : label;
          cap.style.textTransform = 'capitalize';
          cell.appendChild(cap);
          cell.onclick = () => {
            tmAddItemToWorkspace(path, label);
            tmCloseConsumablesCatalogModal();
          };
          grid.appendChild(cell);
        });
        body.appendChild(grid);
      } else {
        body.innerHTML = '<p class="tm-items-empty">No items match your search.</p>';
      }
    }
  };

  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  IMAGE UPLOAD
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  window.tmHandleImageUpload = function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const ws = document.getElementById('tm-workspace');
      if (!ws) return;
      const id = 'tm-img-' + tmState.nextId++;

      const root = document.createElement('div');
      root.className = 'tm-object';
      root.dataset.id = id;
      root.dataset.type = 'image';

      const img = document.createElement('img');
      img.src = e.target.result;
      img.draggable = false;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.pointerEvents = 'none';
      root.appendChild(img);

      const center = tmGetLogicalWorkspaceCenter(360, 360);
      const obj = {
        id, type: 'image', el: root,
        x: center.x, y: center.y, width: 360, height: 360,
        scale: 1, stretchX: 1, stretchY: 1, rotation: 0, opacity: 1,
        blur: 0, glow: 0, glowColor: '#ffffff',
        inverted: false, halo: 0, backFade: 0,
        data: { src: e.target.result },
        vignetteEnabled: false,
        vignetteIntensity: 0.55
      };

      ws.appendChild(root);
      tmState.objects.push(obj);
      applyTransform(obj);
      setupDrag(root, obj);
      tmSelectObject(id);
      tmRenderLayersPanel();
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  TEXT
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  window.tmAddText = function () {
    if (window.tmPushHistoryState) window.tmPushHistoryState();
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;
    const id = 'tm-text-' + tmState.nextId++;

    const root = document.createElement('div');
    root.className = 'tm-object tm-text';
    root.dataset.id = id;
    root.dataset.type = 'text';

    const content = document.createElement('div');
    content.className = 'tm-text-content';
    content.textContent = 'Your title';
    content.style.fontSize = '56px';
    content.style.color = '#ffffff';
    content.style.fontFamily = "'Century Gothic', sans-serif";
    content.style.fontWeight = 'bold';
    root.appendChild(content);

    const center = tmGetLogicalWorkspaceCenter(520, 120);
    const obj = {
      id, type: 'text', el: root, contentEl: content,
      text: 'Your title',
      x: center.x, y: center.y, width: 520, height: 120,
      scale: 1, stretchX: 1, stretchY: 1, rotation: 0, opacity: 1,
      blur: 0, glow: 0, glowColor: '#ffffff',
      inverted: false,
      fontSize: 56, color: '#ffffff',
      outlineColor: '#000000', outlineSize: 0,
      shadowSize: 0, shadowX: 4, shadowY: 4,
      fontFamily: "'Century Gothic', sans-serif",
      letterSpacing: 0,
      textStroke: 0, textStrokeColor: '#000000',
      gradient: false, gradientColor1: '#ffffff', gradientColor2: '#00b4d8', gradientAngle: 135,
      emboss: false, neonGlow: 0, italic: false, textTransform: 'none',
      vignetteEnabled: false,
      vignetteIntensity: 0.55
    };

    ws.appendChild(root);
    tmState.objects.push(obj);
    applyTransform(obj);
    setupDrag(root, obj);
    tmSelectObject(id);
    tmRenderLayersPanel();

    root.addEventListener('dblclick', () => {
      const newText = prompt('Enter text:', obj.text);
      if (newText !== null) {
        obj.text = newText;
        applyTransform(obj);
        const ta = document.getElementById('tm-prop-text-content');
        if (ta) ta.value = newText;
      }
    });
  };

  window.tmUpdateTextFromInputs = function () {
    const obj = selected();
    if (!obj || obj.type !== 'text') return;
    const text = document.getElementById('tm-prop-text-content')?.value;
    const color = document.getElementById('tm-prop-text-color')?.value;
    const outline = document.getElementById('tm-prop-outline-color')?.value;
    const font = document.getElementById('tm-prop-font-family')?.value;
    const strokeColor = document.getElementById('tm-prop-text-stroke-color')?.value;
    const gc1 = document.getElementById('tm-prop-gradient-color1')?.value;
    const gc2 = document.getElementById('tm-prop-gradient-color2')?.value;
    const tt = document.getElementById('tm-prop-text-transform')?.value;
    if (text !== undefined) obj.text = text;
    if (color) obj.color = color;
    if (outline) obj.outlineColor = outline;
    if (font) obj.fontFamily = font;
    if (strokeColor) obj.textStrokeColor = strokeColor;
    if (gc1) obj.gradientColor1 = gc1;
    if (gc2) obj.gradientColor2 = gc2;
    if (tt) obj.textTransform = tt;
    applyTransform(obj);
  };

  window.tmUpdateTextProp = function (prop, value) {
    const obj = selected();
    if (!obj || obj.type !== 'text') return;
    if (prop === 'emboss' || prop === 'italic' || prop === 'gradient') {
      obj[prop] = !!value;
      if (prop === 'gradient') {
        const gcolors = document.getElementById('tm-gradient-colors');
        if (gcolors) gcolors.style.display = value ? 'grid' : 'none';
        const gangle = document.getElementById('tm-gradient-angle-group');
        if (gangle) gangle.style.display = value ? '' : 'none';
      }
    } else {
      const v = parseFloat(value);
      if (prop === 'fontSize') obj.fontSize = v;
      else if (prop === 'outlineSize') obj.outlineSize = v;
      else if (prop === 'shadowSize') obj.shadowSize = v;
      else if (prop === 'letterSpacing') obj.letterSpacing = v;
      else if (prop === 'textStroke') obj.textStroke = v;
      else if (prop === 'neonGlow') obj.neonGlow = v;
      else if (prop === 'gradientAngle') obj.gradientAngle = v;
    }
    applyTransform(obj);
  };

  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  THEMES
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  window.tmCurrentWorkspaceThemeId = null;

  function tmPopulateThemeListForTM() {
    const list = document.getElementById('tm-theme-list');
    if (!list || typeof wpManifestThemes === 'undefined') return;
    list.innerHTML = '';

    // Add "Remove Theme" option first
    const removeBtn = document.createElement('div');
    removeBtn.className = 'wp-bg-item';
    removeBtn.style.cssText = 'border: 2px dashed #e63946; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; background: rgba(230, 57, 70, 0.08); color: #e63946;';
    removeBtn.innerHTML = '<span style="font-size: 24px; margin-bottom: 4px;">✕</span><span class="wp-cat-name" style="font-weight: bold; color: #e63946;">Remove Theme</span>';
    removeBtn.onclick = () => {
      window.tmRemoveWorkspaceTheme();
      tmCloseThemeModal();
    };
    list.appendChild(removeBtn);

    (wpManifestThemes || []).forEach(bg => {
      const item = document.createElement('div');
      item.className = 'wp-bg-item';
      if (window.tmCurrentWorkspaceThemeId === bg.id) item.classList.add('active');
      const img = document.createElement('img');
      img.src = bg.src; img.alt = bg.name || bg.id;
      item.appendChild(img);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'wp-cat-name';
      nameSpan.textContent = bg.name || bg.id;
      item.appendChild(nameSpan);
      item.onclick = () => {
        list.querySelectorAll('.wp-bg-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        window.tmApplyWorkspaceTheme(bg.id);
      };
      list.appendChild(item);
    });
  }

  window.tmApplyWorkspaceTheme = function (themeId) {
    try {
      if (window.tmPushHistoryState) window.tmPushHistoryState();
      const theme = wpManifestThemes && wpManifestThemes.find(t => t.id === themeId);
      if (!theme) return;

      const ws = document.getElementById('tm-workspace');
      if (!ws) return;

      // Check if theme layer already exists
      let existing = tmState.objects.find(o => o.isTheme);

      if (existing) {
        existing.data.src = theme.src;
        existing.data.label = (theme.name || theme.id) + ' Theme';
        existing.el.querySelector('img').src = theme.src;
        window.tmCurrentWorkspaceThemeId = themeId;
        tmRenderLayersPanel();
        tmCloseThemeModal();
        return;
      }

      // Add as layer
      const id = 'tm-theme-' + tmState.nextId++;

      const root = document.createElement('div');
      root.className = 'tm-object tm-theme-layer';
      root.dataset.id = id;
      root.dataset.type = 'image';
      root.style.pointerEvents = 'auto';

      const img = document.createElement('img');
      img.src = theme.src;
      img.draggable = false;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.pointerEvents = 'none';
      root.appendChild(img);

      // Get current logical workspace dimensions based on resolution buttons
      const activeBtn = document.querySelector('.tm-res-btn.active');
      let resType = activeBtn ? activeBtn.getAttribute('data-res') : 'youtube';
      let w = 1280;
      let h = 720;
      if (resType === 'instagram') { w = 720; h = 720; }
      else if (resType === 'tiktok') { w = 405; h = 720; }
      else if (resType === 'insta-portrait') { w = 576; h = 720; }

      const obj = {
        id, type: 'image', el: root,
        x: 0, y: 0, width: w, height: h,
        scale: 1.05, stretchX: 1, stretchY: 1, rotation: 0, opacity: 1,
        blur: 0, glow: 0, glowColor: '#ffffff',
        inverted: false, halo: 0, backFade: 0,
        data: { src: theme.src, label: (theme.name || theme.id) + ' Theme' },
        isTheme: true
      };

      // Insert at bottom of stack
      ws.insertBefore(root, ws.firstChild);
      tmState.objects.unshift(obj);
      ws.classList.add('tm-theme-active');
      applyTransform(obj);
      setupDrag(root, obj);

      window.tmCurrentWorkspaceThemeId = themeId;
      tmSelectObject(id);
      tmRenderLayersPanel();
      tmCloseThemeModal();
    } catch (err) {
      console.error("Error in tmApplyWorkspaceTheme:", err);
    }
  };

  window.tmRemoveWorkspaceTheme = function () {
    const existingIdx = tmState.objects.findIndex(o => o.isTheme);
    if (existingIdx !== -1) {
      if (window.tmPushHistoryState) window.tmPushHistoryState();
      const obj = tmState.objects[existingIdx];
      if (obj.el && obj.el.parentNode) {
        obj.el.parentNode.removeChild(obj.el);
      }
      tmState.objects.splice(existingIdx, 1);
      if (tmState.selectedId === obj.id) {
        tmState.selectedId = null;
        tmUpdatePropertiesPanel();
      }
      tmRenderLayersPanel();
    }
    const ws = document.getElementById('tm-workspace');
    if (ws) ws.classList.remove('tm-theme-active');
    window.tmCurrentWorkspaceThemeId = null;
  }

  window.tmOpenThemeModal = async function () {
    if (typeof loadWPManifest === 'function' && (typeof wpManifestThemes === 'undefined' || !wpManifestThemes.length)) {
      await loadWPManifest();
    }
    const popup = document.getElementById('tm-theme-popup');
    if (!popup) return;
    tmPopulateThemeListForTM();
    popup.classList.remove('hidden');
  };

  function tmCloseThemeModal() {
    const popup = document.getElementById('tm-theme-popup');
    if (popup) popup.classList.add('hidden');
  }
  window.tmCloseThemeModal = tmCloseThemeModal;

  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  //  LAYERS PANEL (global, with collapsible character groups)
  // â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
  function tmRenderLayersPanel() {
    const dock = document.getElementById('tm-layers-dock');
    const list = document.getElementById('tm-layers-list');
    if (!dock || !list) return;

    dock.classList.toggle('hidden', tmState.objects.length === 0);
    if (window.tmResizeWorkspace) window.tmResizeWorkspace();
    list.innerHTML = '';

    if (tmState.objects.length === 0) {
      list.innerHTML = '<p class="tm-layers-empty">No layers yet.</p>';
      return;
    }

    // Filter root objects (no parent)
    const rootObjects = tmState.objects.filter(o => !o.parentId);
    // Show layers top-to-front (reversed)
    const ordered = [...rootObjects].reverse();

    ordered.forEach((obj, visualIdx) => {
      renderLayerItem(obj, list, 0);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();

    function setupPointerDrag(row) {
      row.style.touchAction = 'pan-y';
      let isPointerDragging = false;
      let startY = 0;
      let draggedId = null;
      let hoverTarget = null;
      let hoverAction = '';
      let longPressTimeout = null;
      let startX = 0;

      row.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;

        const isGrip = !!e.target.closest('.tm-layer-grip');
        startX = e.clientX;
        startY = e.clientY;
        draggedId = row.dataset.layerId;

        const startDrag = () => {
          isPointerDragging = true;
          row.classList.add('dragging');

          // Temporarily lock layers list scroll while dragging to prevent any double scrolling
          const listContainer = document.getElementById('tm-layers-list');
          if (listContainer) {
            listContainer.style.overflowY = 'hidden';
            listContainer.style.touchAction = 'none';
          }

          row.setPointerCapture(e.pointerId);
        };

        if (isGrip) {
          startDrag();
        } else {
          // Wait for a 250ms long-press before starting the drag on the row itself
          longPressTimeout = setTimeout(() => {
            startDrag();
            longPressTimeout = null;
          }, 250);
        }
      });

      row.addEventListener('pointermove', (e) => {
        if (longPressTimeout) {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          // If moved more than 8px, cancel long-press so user can scroll naturally
          if (Math.sqrt(dx * dx + dy * dy) > 8) {
            clearTimeout(longPressTimeout);
            longPressTimeout = null;
          }
          return;
        }

        if (!isPointerDragging) return;
        const dy = e.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        row.style.zIndex = '1000';

        document.querySelectorAll('.tm-layer-row, .tm-layer-subrow').forEach(el => {
          el.classList.remove('drop-before', 'drop-after', 'drop-into');
        });

        const origPE = row.style.pointerEvents;
        row.style.pointerEvents = 'none';
        const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
        row.style.pointerEvents = origPE;
        if (!elementUnder) return;
        const targetRow = elementUnder.closest('.tm-layer-row, .tm-layer-subrow');
        if (targetRow && targetRow !== row) {
          if (row.classList.contains('tm-layer-subrow')) {
            if (!targetRow.classList.contains('tm-layer-subrow')) return;
            const charIdSrc = draggedId.split(':')[0];
            const charIdDst = targetRow.dataset.layerId.split(':')[0];
            if (charIdSrc !== charIdDst) return;
          }

          hoverTarget = targetRow;
          const rect = targetRow.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (e.clientY < mid) {
            targetRow.classList.add('drop-before');
            hoverAction = 'before';
          } else {
            targetRow.classList.add('drop-after');
            hoverAction = 'after';
          }
        } else {
          hoverTarget = null;
          hoverAction = '';
        }
      });

      row.addEventListener('pointerup', (e) => {
        if (longPressTimeout) {
          clearTimeout(longPressTimeout);
          longPressTimeout = null;
        }

        if (!isPointerDragging) return;
        isPointerDragging = false;
        row.releasePointerCapture(e.pointerId);
        row.classList.remove('dragging');
        row.style.transform = '';
        row.style.zIndex = '';

        // Restore standard layers list scrolling
        const listContainer = document.getElementById('tm-layers-list');
        if (listContainer) {
          listContainer.style.overflowY = '';
          listContainer.style.touchAction = '';
        }

        document.querySelectorAll('.tm-layer-row, .tm-layer-subrow').forEach(el => {
          el.classList.remove('drop-before', 'drop-after', 'drop-into');
        });

        if (hoverTarget && hoverAction) {
          const targetId = hoverTarget.dataset.layerId;
          tmMoveLayer(draggedId, targetId, hoverAction);
        }

        hoverTarget = null;
        hoverAction = '';
      });

      row.addEventListener('pointercancel', (e) => {
        if (longPressTimeout) {
          clearTimeout(longPressTimeout);
          longPressTimeout = null;
        }

        if (!isPointerDragging) return;
        isPointerDragging = false;
        row.releasePointerCapture(e.pointerId);
        row.classList.remove('dragging');
        row.style.transform = '';
        row.style.zIndex = '';

        // Restore standard layers list scrolling
        const listContainer = document.getElementById('tm-layers-list');
        if (listContainer) {
          listContainer.style.overflowY = '';
          listContainer.style.touchAction = '';
        }

        document.querySelectorAll('.tm-layer-row, .tm-layer-subrow').forEach(el => {
          el.classList.remove('drop-before', 'drop-after', 'drop-into');
        });
        hoverTarget = null;
        hoverAction = '';
      });
    }

    function renderLayerItem(obj, container, level) {
      const row = document.createElement('div');
      row.className = 'tm-layer-row' + (obj.id === tmState.selectedId ? ' selected' : '');
      row.dataset.layerId = obj.id;
      row.draggable = false;
      setupPointerDrag(row);
      if (level > 0) row.style.marginLeft = (level * 20) + 'px';

      // Drag Events
      row.addEventListener('dragstart', (e) => {
        if (!e.target.closest('.tm-layer-grip')) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('text/plain', obj.id);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          row.classList.add('drop-before');
          row.classList.remove('drop-after', 'drop-into');
        } else {
          row.classList.add('drop-after');
          row.classList.remove('drop-before', 'drop-into');
        }
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('drop-before', 'drop-after', 'drop-into');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId === obj.id) return;

        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const action = e.clientY < mid ? 'before' : 'after';

        tmMoveLayer(draggedId, obj.id, action);
        row.classList.remove('drop-before', 'drop-after', 'drop-into');
      });

      // Helper to format raw ID strings beautifully
      function formatLayerName(rawName) {
        if (!rawName) return '';
        let clean = rawName.replace(/^(spr_fg_|spr_bg_|item_|spr_)/i, '');
        clean = clean.replace(/_/g, ' ');
        clean = clean.replace(/\b\w/g, c => c.toUpperCase());
        return clean.trim();
      }

      // Determine label
      let label = 'Layer';
      if (obj.type === 'character') label = 'Character ' + obj.id.split('-').pop();
      else if (obj.type === 'block') label = formatLayerName(obj.data?.blockId) || 'Block';
      else if (obj.type === 'item') label = formatLayerName(obj.data?.label) || 'Item';
      else if (obj.type === 'text') label = 'Text' + (obj.text ? ' \u00B7 ' + obj.text.slice(0, 16) : '');
      else if (obj.type === 'image') label = obj.data?.label || 'Image';

      // Left side: grip + arrow (for characters) + name
      const leftSide = document.createElement('div');
      leftSide.style.display = 'flex';
      leftSide.style.alignItems = 'center';
      leftSide.style.gap = '6px';
      leftSide.style.flex = '1';
      leftSide.style.minWidth = '0';

      const grip = document.createElement('span');
      grip.className = 'tm-layer-grip';
      grip.textContent = '⠿';
      grip.style.cursor = 'grab';
      grip.style.color = '#555';
      grip.style.marginRight = '4px';
      grip.style.touchAction = 'none';
      leftSide.appendChild(grip);

      // Only enable HTML5 drag on grip handle hover
      grip.addEventListener('mouseenter', () => { row.draggable = true; });
      grip.addEventListener('mouseleave', () => { row.draggable = false; });

      if (obj.type === 'character') {
        const arrow = document.createElement('span');
        arrow.className = 'tm-layer-arrow';
        arrow.style.cursor = 'pointer';
        arrow.style.display = 'inline-flex';
        arrow.style.alignItems = 'center';
        arrow.style.justifyContent = 'center';
        arrow.style.width = '14px';
        arrow.style.height = '14px';
        arrow.style.userSelect = 'none';
        arrow.innerHTML = tmState.expandedGroups[obj.id]
          ? '<i data-lucide="chevron-down" style="width: 12px; height: 12px; color: #a8dadc;"></i>'
          : '<i data-lucide="chevron-right" style="width: 12px; height: 12px; color: #a8dadc;"></i>';
        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          tmState.expandedGroups[obj.id] = !tmState.expandedGroups[obj.id];
          tmRenderLayersPanel();
        });
        leftSide.appendChild(arrow);
      } else {
        const dash = document.createElement('span');
        dash.textContent = '\u2500';
        dash.fontSize = '10px';
        dash.style.color = '#555';
        dash.style.width = '14px';
        dash.style.textAlign = 'center';
        leftSide.appendChild(dash);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tm-layer-name';
      nameSpan.textContent = label;
      nameSpan.style.overflow = 'hidden';
      nameSpan.style.textOverflow = 'ellipsis';
      nameSpan.style.whiteSpace = 'nowrap';
      leftSide.appendChild(nameSpan);

      row.appendChild(leftSide);

      // Lock button
      const rightSide = document.createElement('div');
      rightSide.style.display = 'flex';
      rightSide.style.alignItems = 'center';

      const lockBtn = document.createElement('button');
      lockBtn.className = 'tm-layer-lock-btn';
      lockBtn.style.background = 'transparent';
      lockBtn.style.border = 'none';
      lockBtn.style.cursor = 'pointer';
      lockBtn.style.padding = '4px';
      lockBtn.style.display = 'flex';
      lockBtn.style.color = obj.isLocked ? '#e63946' : '#555';
      lockBtn.title = obj.isLocked ? 'Unlock Layer' : 'Lock Layer';
      lockBtn.innerHTML = obj.isLocked ? '<i data-lucide="lock" style="width: 14px; height: 14px;"></i>' : '<i data-lucide="unlock" style="width: 14px; height: 14px;"></i>';
      lockBtn.onclick = (e) => {
        e.stopPropagation();
        obj.isLocked = !obj.isLocked;
        // applyTransform moved below
        if (obj.isLocked && tmState.selectedId === obj.id) {
          // Remove handles if locked while selected
          removeHandles(obj.el);
        } else if (!obj.isLocked && tmState.selectedId === obj.id) {
          addHandles(obj.el, obj);
        }
        applyTransform(obj);
        tmRenderLayersPanel();
      };
      rightSide.appendChild(lockBtn);
      row.appendChild(rightSide);

      // Click to select
      row.addEventListener('click', () => tmSelectObject(obj.id));
      list.appendChild(row);

      // Expanded character sub-layers
      if (obj.type === 'character' && tmState.expandedGroups[obj.id]) {
        if (!obj.childOrder) {
          obj.childOrder = ['base-arm', 'rest', 'head', 'capes-above', 'arm'];
        }

        const reversedKeys = [...obj.childOrder].reverse();

        reversedKeys.forEach(key => {
          // If this child is a nested object, render it properly via renderLayerItem
          if (key !== 'base-arm' && key !== 'rest' && key !== 'head' && key !== 'capes-above' && key !== 'arm') {
            const childObj = getObj(key);
            if (childObj) {
              renderLayerItem(childObj, container, level + 1);
            }
            return;
          }

          let subName = 'Unknown';
          if (key === 'head') subName = 'Head';
          else if (key === 'arm') subName = 'Left Arm';
          else if (key === 'base-arm') subName = 'Right Arm';
          else if (key === 'rest') subName = 'Body (Rest)';
          else if (key === 'capes-above') subName = 'Cape (Above)';

          if (subName === 'Unknown') return;

          const subRow = document.createElement('div');
          subRow.className = 'tm-layer-subrow';
          subRow.dataset.layerId = obj.id + ':' + subName;
          subRow.draggable = true;
          setupPointerDrag(subRow);

          subRow.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', subRow.dataset.layerId);
            subRow.classList.add('dragging');
          });
          subRow.addEventListener('dragend', () => subRow.classList.remove('dragging'));
          subRow.addEventListener('dragover', (e) => {
            e.preventDefault();
            const rect = subRow.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (e.clientY < mid) {
              subRow.classList.add('drop-before');
              subRow.classList.remove('drop-after');
            } else {
              subRow.classList.add('drop-after');
              subRow.classList.remove('drop-before');
            }
          });
          subRow.addEventListener('dragleave', () => {
            subRow.classList.remove('drop-before', 'drop-after');
          });
          subRow.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId === subRow.dataset.layerId) return;

            const draggedObj = getObj(draggedId);
            const isInternalLimb = draggedId.includes(':');

            if (isInternalLimb) {
              const charId = draggedId.split(':')[0];
              if (charId !== obj.id) {
                subRow.classList.remove('drop-before', 'drop-after');
                return;
              }
            } else {
              // Dragging standard workspace object (either root or nested)
              // Allow as long as it's not the character itself!
              if (!draggedObj || draggedObj.id === obj.id) {
                subRow.classList.remove('drop-before', 'drop-after');
                return;
              }
            }

            const action = subRow.classList.contains('drop-before') ? 'before' : 'after';
            tmMoveLayer(draggedId, subRow.dataset.layerId, action);
            subRow.classList.remove('drop-before', 'drop-after');
          });

          const grip = document.createElement('span');
          grip.className = 'tm-layer-grip';
          grip.textContent = '⠿';
          grip.style.cursor = 'grab';
          grip.style.color = '#555';
          grip.style.marginRight = '6px';
          grip.style.touchAction = 'none';
          subRow.appendChild(grip);

          const subLabel = document.createElement('span');
          subLabel.textContent = '  \u2514 ' + subName;
          subLabel.style.color = '#8ab4b8';
          subLabel.style.fontSize = '11px';
          subLabel.style.flex = '1';
          subRow.appendChild(subLabel);

          list.appendChild(subRow);
        });
      }
    }
  }

  window.tmMoveLayer = function (draggedId, targetId, action) {
    if (window.tmPushHistoryState) window.tmPushHistoryState();
    const isInternal = (id) => id.includes(':');
    const getInternalInfo = (id) => {
      const [charId, subName] = id.split(':');
      const char = getObj(charId);
      if (!char) return null;
      const child = char.el.querySelector(
        subName === 'Head' ? '.tm-head-group' :
          subName === 'Left Arm' ? '.tm-arm-group' :
            subName === 'Right Arm' ? '.tm-base-arm-group' :
              subName === 'Body (Rest)' ? '.tm-rest-group' :
                subName === 'Cape (Above)' ? '.tm-capesabove-group' : 'none'
      );
      return { char, child };
    };

    const getKeyFromId = (id) => {
      if (id.includes(':')) {
        const subName = id.split(':')[1];
        if (subName === 'Head') return 'head';
        if (subName === 'Left Arm') return 'arm';
        if (subName === 'Right Arm') return 'base-arm';
        if (subName === 'Body (Rest)') return 'rest';
        if (subName === 'Cape (Above)') return 'capes-above';
        return '';
      }
      return id; // standard object ID
    };

    if (isInternal(draggedId)) {
      // Moving an internal body part
      const dragInfo = getInternalInfo(draggedId);
      if (!dragInfo) return;
      const { char: dragChar } = dragInfo;
      const dragKey = getKeyFromId(draggedId);

      if (isInternal(targetId)) {
        // Dragging internal body part relative to another internal body part
        const targetInfo = getInternalInfo(targetId);
        if (!targetInfo || targetInfo.char !== dragChar) return;
        const targetKey = getKeyFromId(targetId);

        if (!dragChar.childOrder) {
          dragChar.childOrder = ['base-arm', 'rest', 'head', 'capes-above', 'arm'];
        }

        const dragIdx = dragChar.childOrder.indexOf(dragKey);
        if (dragIdx > -1) {
          dragChar.childOrder.splice(dragIdx, 1);
          const targetIdx = dragChar.childOrder.indexOf(targetKey);
          if (targetIdx > -1) {
            if (action === 'before') {
              dragChar.childOrder.splice(targetIdx, 0, dragKey);
            } else {
              dragChar.childOrder.splice(targetIdx + 1, 0, dragKey);
            }
          }
        }

        applyTransform(dragChar);
      } else {
        // Dragging internal part relative to a nested object inside the character
        const targetObj = getObj(targetId);
        if (!targetObj || targetObj.parentId !== dragChar.id) return;
        const targetKey = getKeyFromId(targetId);

        if (!dragChar.childOrder) {
          dragChar.childOrder = ['base-arm', 'rest', 'head', 'capes-above', 'arm'];
        }

        const dragIdx = dragChar.childOrder.indexOf(dragKey);
        if (dragIdx > -1) {
          dragChar.childOrder.splice(dragIdx, 1);
          const targetIdx = dragChar.childOrder.indexOf(targetKey);
          if (targetIdx > -1) {
            if (action === 'before') {
              dragChar.childOrder.splice(targetIdx, 0, dragKey);
            } else {
              dragChar.childOrder.splice(targetIdx + 1, 0, dragKey);
            }
          }
        }

        applyTransform(dragChar);
      }
    } else {
      // Moving a standard object (e.g. an item, text, image, etc.)
      const draggedObj = getObj(draggedId);
      if (!draggedObj) return;

      const oldParentId = draggedObj.parentId;
      const dragKey = getKeyFromId(draggedId);

      if (action === 'into') {
        const targetObj = getObj(targetId);
        if (!targetObj || targetObj.type !== 'character') return;
        draggedObj.parentId = targetId;

        let absX, absY;
        if (oldParentId) {
          const p = getObj(oldParentId);
          absX = p.x + draggedObj.x * p.scale;
          absY = p.y + draggedObj.y * p.scale;
        } else {
          absX = draggedObj.x + draggedObj.width / 2;
          absY = draggedObj.y + draggedObj.height / 2;
        }

        draggedObj.x = (absX - targetObj.x) / targetObj.scale;
        draggedObj.y = (absY - targetObj.y) / targetObj.scale;

        const oldVisualScale = oldParentId ? draggedObj.scale * getObj(oldParentId).scale : draggedObj.scale;
        draggedObj.scale = oldVisualScale / targetObj.scale;

        // Ensure key is in childOrder
        if (!targetObj.childOrder) {
          targetObj.childOrder = ['base-arm', 'rest', 'head', 'capes-above', 'arm'];
        }
        const idx = targetObj.childOrder.indexOf(dragKey);
        if (idx > -1) targetObj.childOrder.splice(idx, 1);
        targetObj.childOrder.push(dragKey);

        applyTransform(targetObj);

        if (oldParentId && oldParentId !== targetId) {
          const oldP = getObj(oldParentId);
          const oldIdx = oldP.childOrder.indexOf(dragKey);
          if (oldIdx > -1) oldP.childOrder.splice(oldIdx, 1);
          applyTransform(oldP);
        }
      } else if (isInternal(targetId)) {
        // Dragging object before/after a body part inside character
        const targetInfo = getInternalInfo(targetId);
        if (!targetInfo) return;
        const { char } = targetInfo;
        const targetKey = getKeyFromId(targetId);

        draggedObj.parentId = char.id;

        let absX, absY;
        if (oldParentId) {
          const p = getObj(oldParentId);
          absX = p.x + draggedObj.x * p.scale;
          absY = p.y + draggedObj.y * p.scale;
        } else {
          absX = draggedObj.x + draggedObj.width / 2;
          absY = draggedObj.y + draggedObj.height / 2;
        }

        draggedObj.x = (absX - char.x) / char.scale;
        draggedObj.y = (absY - char.y) / char.scale;

        const oldVisualScale = oldParentId ? draggedObj.scale * getObj(oldParentId).scale : draggedObj.scale;
        draggedObj.scale = oldVisualScale / char.scale;

        if (!char.childOrder) {
          char.childOrder = ['base-arm', 'rest', 'head', 'capes-above', 'arm'];
        }

        // Remove from old parent childOrder if different
        if (oldParentId && oldParentId !== char.id) {
          const oldP = getObj(oldParentId);
          const oldIdx = oldP.childOrder.indexOf(dragKey);
          if (oldIdx > -1) oldP.childOrder.splice(oldIdx, 1);
          applyTransform(oldP);
        }

        // Insert at the correct relative position in char.childOrder
        const dragIdx = char.childOrder.indexOf(dragKey);
        if (dragIdx > -1) char.childOrder.splice(dragIdx, 1);

        const targetIdx = char.childOrder.indexOf(targetKey);
        if (targetIdx > -1) {
          if (action === 'before') {
            char.childOrder.splice(targetIdx, 0, dragKey);
          } else {
            char.childOrder.splice(targetIdx + 1, 0, dragKey);
          }
        }

        applyTransform(char);
      } else {
        // Reordering root objects or nested objects relative to each other
        let targetObj = getObj(targetId);
        if (!targetObj) return;

        draggedObj.parentId = targetObj.parentId || null;

        const ws = document.getElementById('tm-workspace');
        if (!draggedObj.parentId) {
          ws.appendChild(draggedObj.el);
          if (oldParentId) {
            const p = getObj(oldParentId);
            draggedObj.x = (p.x + draggedObj.x * p.scale) - (draggedObj.width / 2);
            draggedObj.y = (p.y + draggedObj.y * p.scale) - (draggedObj.height / 2);
          }
          const oldVisualScale = oldParentId ? draggedObj.scale * getObj(oldParentId).scale : draggedObj.scale;
          draggedObj.scale = oldVisualScale;
        } else {
          // Dragged into a character sibling
          const p = getObj(draggedObj.parentId);

          if (!p.childOrder) {
            p.childOrder = ['base-arm', 'rest', 'head', 'capes-above', 'arm'];
          }

          // Remove from old parent childOrder if different
          if (oldParentId && oldParentId !== p.id) {
            const oldP = getObj(oldParentId);
            const oldIdx = oldP.childOrder.indexOf(dragKey);
            if (oldIdx > -1) oldP.childOrder.splice(oldIdx, 1);
            applyTransform(oldP);
          }

          // Insert relative to target in p.childOrder
          const targetKey = getKeyFromId(targetId);
          const dragIdx = p.childOrder.indexOf(dragKey);
          if (dragIdx > -1) p.childOrder.splice(dragIdx, 1);

          const targetIdx = p.childOrder.indexOf(targetKey);
          if (targetIdx > -1) {
            if (action === 'before') {
              p.childOrder.splice(targetIdx, 0, dragKey);
            } else {
              p.childOrder.splice(targetIdx + 1, 0, dragKey);
            }
          }

          applyTransform(p);
        }

        // Keep standard workspace objects array sorted to match layer index reordering
        const fromIdx = tmState.objects.indexOf(draggedObj);
        tmState.objects.splice(fromIdx, 1);
        let toIdx = tmState.objects.indexOf(targetObj);
        if (action === 'after') toIdx++;
        tmState.objects.splice(toIdx, 0, draggedObj);

        // Also enforce workspace DOM order for root objects
        if (!draggedObj.parentId) {
          const rootObjects = tmState.objects.filter(o => !o.parentId);
          rootObjects.forEach(s => ws.appendChild(s.el));
        }

        if (oldParentId && oldParentId !== draggedObj.parentId) {
          const oldP = getObj(oldParentId);
          const oldIdx = oldP.childOrder.indexOf(dragKey);
          if (oldIdx > -1) oldP.childOrder.splice(oldIdx, 1);
          applyTransform(oldP);
        }
      }
      applyTransform(draggedObj);
      // Also re-apply transform on the parent character so segment DOM + z-indexes update
      if (draggedObj.parentId) {
        const parentObj = getObj(draggedObj.parentId);
        if (parentObj) applyTransform(parentObj);
      }
    }
    tmRenderLayersPanel();
  };

  window.tmToggleBackground = function () {
    const ws = document.getElementById('tm-workspace');
    if (ws) ws.classList.toggle('no-grid');
  };

  window.tmSetResolution = function (type) {
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;

    let width = 1280;
    let height = 720;

    switch (type) {
      case 'youtube':
        width = 1280;
        height = 720;
        break;
      case 'instagram':
        width = 720;
        height = 720;
        break;
      case 'tiktok':
        width = 405;
        height = 720;
        break;
      case 'insta-portrait':
        width = 576;
        height = 720;
        break;
    }

    const oldW = parseInt(ws.style.width) / TM_QUALITY || 1280;
    const oldH = parseInt(ws.style.height) / TM_QUALITY || 720;

    ws.style.width = (width * TM_QUALITY) + 'px';
    ws.style.height = (height * TM_QUALITY) + 'px';
    ws.style.backgroundSize = (20 * TM_QUALITY) + 'px ' + (20 * TM_QUALITY) + 'px';
    ws.style.backgroundPosition = '0 0, 0 ' + (10 * TM_QUALITY) + 'px, ' + (10 * TM_QUALITY) + 'px -' + (10 * TM_QUALITY) + 'px, -' + (10 * TM_QUALITY) + 'px 0px';

    // Shift all objects to keep them centered relative to the new workspace dimensions
    const dx = (width - oldW) / 2;
    const dy = (height - oldH) / 2;
    if (dx !== 0 || dy !== 0) {
      tmState.objects.forEach(obj => {
        if (obj.isTheme || obj.parentId) return;
        obj.x += dx;
        obj.y += dy;
        applyTransform(obj);
      });
    }

    // Auto-resize theme layer if it exists
    const themeLayer = tmState.objects.find(o => o.isTheme);
    if (themeLayer) {
      themeLayer.width = width;
      themeLayer.height = height;
      themeLayer.x = 0;
      themeLayer.y = 0;
      applyTransform(themeLayer);
    }

    // Update active class on resolution buttons
    document.querySelectorAll('.tm-res-btn').forEach(btn => {
      if (btn.getAttribute('data-res') === type) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (window.tmResizeWorkspace) window.tmResizeWorkspace();
    console.log(`Resolution switched to ${type} (${width}x${height})`);
  };

  async function tmGenerateBakedCanvas(finalScale, onProgress) {
    const ws = document.getElementById('tm-workspace');
    if (!ws) return null;

    // Force sharp pixel-art rendering for all canvas operations during capture
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    const forceSharpContext = () => {
      HTMLCanvasElement.prototype.getContext = function (type, attribs) {
        const ctx = originalGetContext.call(this, type, attribs);
        if (type === '2d' && ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.mozImageSmoothingEnabled = false;
          ctx.webkitImageSmoothingEnabled = false;
          ctx.msImageSmoothingEnabled = false;
        }
        return ctx;
      };
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        this.imageSmoothingEnabled = false;
        this.mozImageSmoothingEnabled = false;
        this.webkitImageSmoothingEnabled = false;
        this.msImageSmoothingEnabled = false;
        return originalDrawImage.apply(this, args);
      };
    };
    const restoreContext = () => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      CanvasRenderingContext2D.prototype.drawImage = originalDrawImage;
    };

    // Synchronously convert an image to a base64 Data URL to bypass iOS Safari rendering limitations
    const getBase64Image = (img) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 100;
        canvas.height = img.naturalHeight || img.height || 100;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/png");
      } catch (e) {
        console.warn("getBase64Image failed:", e);
        return img.src;
      }
    };

    // Temporarily remove selection outline and handles
    const prevSelected = selected();
    if (prevSelected) {
      prevSelected.el.classList.remove('tm-selected');
      prevSelected.el.classList.remove('selected');
      removeHandles(prevSelected.el);
    }

    const hiddenHandles = ws.querySelectorAll('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle');
    hiddenHandles.forEach(h => {
      h.style.setProperty('display', 'none', 'important');
    });

    const vignetteEl = document.getElementById('tm-workspace-vignette');
    let savedVignetteDisplay = '';
    if (vignetteEl) {
      savedVignetteDisplay = vignetteEl.style.display;
      vignetteEl.style.setProperty('display', 'none', 'important');
    }

    // =========================================================================
    //  CRITICAL FIX FOR MOBILE / iOS Safari:
    //  On mobile, tmResizeWorkspace() applies CSS transform:scale(~0.4) and
    //  negative margins to fit the 1280x720 workspace on screen. html2canvas
    //  uses getBoundingClientRect() to measure the element — which returns the
    //  SCALED-DOWN dimensions (e.g. 512x288 instead of 1280x720). This makes
    //  html2canvas create a tiny capture viewport, resulting in a blank export.
    //  We temporarily remove the transform/margin BEFORE html2canvas runs so
    //  it measures the full natural size. We also pass explicit width/height.
    // =========================================================================

    // Temporarily reset workspace to 1x quality for export so all existing
    // baking, DOM-swap and html2canvas code works unchanged.
    const savedQualityWidth = ws.style.width;
    const savedQualityHeight = ws.style.height;
    const savedQualityBgSize = ws.style.backgroundSize;
    const savedQualityBgPos = ws.style.backgroundPosition;
    const activeBtn = document.querySelector('.tm-res-btn.active');
    let resType = activeBtn ? activeBtn.getAttribute('data-res') : 'youtube';
    let logicalWidth = 1280;
    let logicalHeight = 720;
    if (resType === 'instagram') { logicalWidth = 720; logicalHeight = 720; }
    else if (resType === 'tiktok') { logicalWidth = 405; logicalHeight = 720; }
    else if (resType === 'insta-portrait') { logicalWidth = 576; logicalHeight = 720; }

    ws.style.width = logicalWidth + 'px';
    ws.style.height = logicalHeight + 'px';
    ws.style.backgroundSize = '';
    ws.style.backgroundPosition = '';
    tmState.objects.forEach(o => { if (o.el) applyTransform(o, 1); });

    const wsWidth = parseInt(ws.style.width) || 1280;
    const wsHeight = parseInt(ws.style.height) || 720;
    const savedTransform = ws.style.transform;
    const savedMargin = ws.style.margin;
    const savedTransformOrigin = ws.style.transformOrigin;
    ws.style.transform = 'none';
    ws.style.margin = '0';
    ws.style.transformOrigin = 'top left';
    // Force a synchronous reflow so getBoundingClientRect picks up the new values
    void ws.offsetWidth;

    const originalContents = [];

    try {
      if (onProgress) onProgress("Preparing images...", 5);

      // Pre-load and pre-decode ALL images in the workspace
      const allImages = Array.from(ws.querySelectorAll('img'));
      await Promise.all(allImages.map(async (img) => {
        try {
          if (!img.complete) await new Promise(r => { img.onload = r; img.onerror = r; });
          if (typeof img.decode === 'function') await img.decode();
        } catch (e) { /* ignore */ }
      }));

      // =========================================================================
      //  PRE-BAKE EFFECTS
      // =========================================================================
      const BAKE_SCALE = 2;

      function applyCanvasEffects(canvas, obj, scale) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return;

        const blurVal = parseFloat(obj.blur) || 0;
        const hueVal = parseFloat(obj.hue) || 0;
        const brightVal = obj.brightness !== undefined ? parseFloat(obj.brightness) : 100;
        const contrastVal = obj.contrast !== undefined ? parseFloat(obj.contrast) : 100;
        const satVal = obj.saturation !== undefined ? parseFloat(obj.saturation) : 100;
        const grayVal = parseFloat(obj.grayscale) || 0;
        const sepiaVal = parseFloat(obj.sepia) || 0;

        // 1. Box Blur on downscaled canvas (extremely smooth and fast)
        if (blurVal > 0) {
          const blurRadius = blurVal * scale;

          // Determine downscale factor to keep performance optimal
          const maxDim = 250;
          let factor = 1;
          if (w > maxDim || h > maxDim) {
            factor = maxDim / Math.max(w, h);
          }

          const downW = Math.max(1, Math.round(w * factor));
          const downH = Math.max(1, Math.round(h * factor));

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = downW;
          tempCanvas.height = downH;
          const tctx = tempCanvas.getContext('2d');
          tctx.imageSmoothingEnabled = true;
          // Use originalDrawImage to ensure smooth downscaling
          originalDrawImage.call(tctx, canvas, 0, 0, w, h, 0, 0, downW, downH);

          // Apply manual box blur on the small canvas
          const r = Math.round(blurRadius * factor);
          if (r >= 1) {
            const imgData = tctx.getImageData(0, 0, downW, downH);
            const data = imgData.data;
            const temp = new Uint8ClampedArray(data.length);

            // Horizontal pass
            for (let y = 0; y < downH; y++) {
              for (let x = 0; x < downW; x++) {
                let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
                for (let dx = -r; dx <= r; dx++) {
                  const nx = x + dx;
                  if (nx >= 0 && nx < downW) {
                    const idx = (y * downW + nx) * 4;
                    rSum += data[idx];
                    gSum += data[idx + 1];
                    bSum += data[idx + 2];
                    aSum += data[idx + 3];
                    count++;
                  }
                }
                const idx = (y * downW + x) * 4;
                temp[idx] = rSum / count;
                temp[idx + 1] = gSum / count;
                temp[idx + 2] = bSum / count;
                temp[idx + 3] = aSum / count;
              }
            }

            // Vertical pass
            for (let x = 0; x < downW; x++) {
              for (let y = 0; y < downH; y++) {
                let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
                for (let dy = -r; dy <= r; dy++) {
                  const ny = y + dy;
                  if (ny >= 0 && ny < downH) {
                    const idx = (ny * downW + x) * 4;
                    rSum += temp[idx];
                    gSum += temp[idx + 1];
                    bSum += temp[idx + 2];
                    aSum += temp[idx + 3];
                    count++;
                  }
                }
                const idx = (y * downW + x) * 4;
                data[idx] = rSum / count;
                data[idx + 1] = gSum / count;
                data[idx + 2] = bSum / count;
                data[idx + 3] = aSum / count;
              }
            }
            tctx.putImageData(imgData, 0, 0);
          }

          // Draw back onto original canvas with bilinear upscaling
          ctx.clearRect(0, 0, w, h);
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          // Use originalDrawImage to ensure smooth upscaling back
          originalDrawImage.call(ctx, tempCanvas, 0, 0, downW, downH, 0, 0, w, h);
          ctx.restore();
        }

        // 2. Pixel-level color filters
        const hasColorAdjustments = (hueVal !== 0) || (brightVal !== 100) || (contrastVal !== 100) ||
          (satVal !== 100) || (grayVal > 0) || (sepiaVal > 0);

        if (hasColorAdjustments) {
          let imgData;
          try {
            imgData = ctx.getImageData(0, 0, w, h);
          } catch (e) {
            console.error("getImageData failed (CORS taint?):", e);
            return;
          }
          const data = imgData.data;

          const angle = hueVal * Math.PI / 180;
          const u = Math.cos(angle);
          const w_sin = Math.sin(angle);

          const rY = 0.213 + u * 0.787 - w_sin * 0.213;
          const gY = 0.715 - u * 0.715 - w_sin * 0.715;
          const bY = 0.072 - u * 0.072 + w_sin * 0.928;

          const rG = 0.213 - u * 0.213 + w_sin * 0.143;
          const gG = 0.715 + u * 0.285 + w_sin * 0.140;
          const bG = 0.072 - u * 0.072 - w_sin * 0.283;

          const rB = 0.213 - u * 0.213 - w_sin * 0.787;
          const gB = 0.715 - u * 0.715 + w_sin * 0.715;
          const bB = 0.072 + u * 0.928 + w_sin * 0.072;

          const contrast = contrastVal / 100;
          const brightness = brightVal / 100;
          const saturate = satVal / 100;
          const grayscale = grayVal / 100;
          const sepia = sepiaVal / 100;

          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue; // skip transparent pixels

            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Grayscale
            if (grayscale > 0) {
              const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              r = r + (gray - r) * grayscale;
              g = g + (gray - g) * grayscale;
              b = b + (gray - b) * grayscale;
            }

            // Sepia
            if (sepia > 0) {
              const sr = Math.min(255, (r * 0.393 + g * 0.769 + b * 0.189));
              const sg = Math.min(255, (r * 0.349 + g * 0.686 + b * 0.168));
              const sb = Math.min(255, (r * 0.272 + g * 0.534 + b * 0.131));
              r = r + (sr - r) * sepia;
              g = g + (sg - g) * sepia;
              b = b + (sb - b) * sepia;
            }

            // Brightness
            if (brightness !== 1) {
              r = r * brightness;
              g = g * brightness;
              b = b * brightness;
            }

            // Contrast
            if (contrast !== 1) {
              r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
              g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
              b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
            }

            // Saturation
            if (saturate !== 1) {
              const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              r = gray + (r - gray) * saturate;
              g = gray + (g - gray) * saturate;
              b = gray + (b - gray) * saturate;
            }

            // Hue rotation
            if (hueVal !== 0) {
              const currR = r, currG = g, currB = b;
              r = rY * currR + gY * currG + bY * currB;
              g = rG * currR + gG * currG + bG * currB;
              b = rB * currR + gB * currG + bB * currB;
            }

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
          }
          ctx.putImageData(imgData, 0, 0);
        }

        // Apply per-layer vignette to the baked element canvas (text vignette is handled inside the custom text baking loop)
        if (obj.vignetteEnabled && obj.type !== 'text') {
          const intensity = obj.vignetteIntensity !== undefined ? parseFloat(obj.vignetteIntensity) : 0.55;
          const lw = (obj.width || (w / scale)) * scale;
          const lh = (obj.height || (h / scale)) * scale;
          const R = Math.sqrt(lw * lw + lh * lh) / 2;
          const gradient = ctx.createRadialGradient(
            w / 2, h / 2, 0,
            w / 2, h / 2, R
          );
          const opOuter1 = 0.45 * intensity;
          const opOuter2 = 0.95 * intensity;

          gradient.addColorStop(0, 'rgba(0,0,0,0)');
          gradient.addColorStop(0.28, 'rgba(0,0,0,0)');
          gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
          gradient.addColorStop(0.8, `rgba(0,0,0,${opOuter1})`);
          gradient.addColorStop(1, `rgba(0,0,0,${opOuter2})`);

          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      }

      const totalObjects = tmState.objects.length;

      for (let i = 0; i < totalObjects; i++) {
        const obj = tmState.objects[i];

        const blurVal = parseFloat(obj.blur) || 0;
        const glowVal = parseFloat(obj.glow) || 0;
        const hueVal = parseFloat(obj.hue) || 0;
        const brightVal = obj.brightness !== undefined ? parseFloat(obj.brightness) : 100;
        const contrastVal = obj.contrast !== undefined ? parseFloat(obj.contrast) : 100;
        const satVal = obj.saturation !== undefined ? parseFloat(obj.saturation) : 100;
        const grayVal = parseFloat(obj.grayscale) || 0;
        const sepiaVal = parseFloat(obj.sepia) || 0;
        const hasShadow = !!obj.enableShadow;

        const hasEffects = (blurVal > 0) || (glowVal > 0) || (hueVal !== 0) ||
          (brightVal !== 100) || (contrastVal !== 100) ||
          (satVal !== 100) || (grayVal > 0) || (sepiaVal > 0) || hasShadow ||
          !!obj.vignetteEnabled;

        // Skip theme layers that don't have any effects. If a theme layer has effects, it MUST be baked.
        if (obj.isTheme && !hasEffects) continue;

        // Pre-bake all blocks, items and user-inserted images to prevent html2canvas stretching/cropping due to lack of object-fit support,
        // and pre-bake text layers always (due to html2canvas limitations with gradients/outlines/strokes)
        // and characters ONLY if they have active filters/effects.
        const isBlockOrItem = obj.type === 'block' || obj.type === 'item' || obj.type === 'image';
        const shouldBake = isBlockOrItem || hasEffects || obj.isTheme || obj.type === 'text';

        if (!shouldBake) continue;

        if (onProgress) {
          onProgress(`Preparing layers ${i + 1}/${totalObjects}...`, Math.round(5 + (i / totalObjects) * 40));
        }

        const needsPadding = hasShadow || (glowVal > 0) || (blurVal > 0);
        const filterPadding = needsPadding ? Math.ceil(Math.max(blurVal * 2.5, glowVal * 2.5, hasShadow ? 16 : 0)) + 8 : 0;

        let elementCanvas;

        if (obj.type === 'character') {
          // Bake each .tm-char-wrapper segment individually to preserve interleaving with nested items
          const segmentsCount = obj.el.querySelectorAll('.tm-char-wrapper').length;
          obj._bakedSegments = [];

          for (let sIdx = 0; sIdx < segmentsCount; sIdx++) {
            const elClone = obj.el.cloneNode(true);
            elClone.style.transform = 'none';
            elClone.style.position = 'relative';
            elClone.style.left = '0';
            elClone.style.top = '0';

            const cloneContent = elClone.querySelector('.tm-object-content');
            if (cloneContent) {
              cloneContent.style.filter = 'none';
              cloneContent.style.transform = 'none';
              cloneContent.style.willChange = 'auto';

              // Keep ONLY the sIdx-th segment wrapper and remove all other sibling segments
              const cloneWrappers = Array.from(cloneContent.querySelectorAll('.tm-char-wrapper'));
              cloneWrappers.forEach((w, idx) => {
                if (idx !== sIdx) {
                  w.remove();
                }
              });

              // Also remove any nested .tm-object elements from the clone
              cloneContent.querySelectorAll('.tm-object').forEach(nested => nested.remove());
            }

            // Strip 3D transform properties that break html2canvas
            [elClone, cloneContent].forEach(e => {
              if (!e) return;
              e.style.transformStyle = 'flat';
              e.style.backfaceVisibility = 'visible';
              e.style.perspective = 'none';
            });

            // Strip 3D transform properties from sub-groups inside the segment clone
            elClone.querySelectorAll('.tm-head-group, .tm-arm-group, .tm-base-arm-group, .tm-rest-group, .tm-capesabove-group').forEach(e => {
              e.style.transformStyle = 'flat';
              e.style.backfaceVisibility = 'visible';
              e.style.perspective = 'none';
            });

            elClone.querySelectorAll('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle').forEach(h => h.remove());
            elClone.classList.remove('tm-selected', 'selected');
            elClone.style.outline = 'none';

            const baseW = obj.width || 300;
            const baseH = obj.height || 300;
            const extraPad = 600;
            const pad = (filterPadding || 0) + extraPad;

            // Apply explicit widths, heights, and absolute layout offsets to elClone and cloneContent
            elClone.style.width = (baseW + pad * 2) + 'px';
            elClone.style.height = (baseH + pad * 2) + 'px';

            if (cloneContent) {
              cloneContent.style.position = 'absolute';
              cloneContent.style.left = pad + 'px';
              cloneContent.style.top = pad + 'px';
              cloneContent.style.width = baseW + 'px';
              cloneContent.style.height = baseH + 'px';
            }

            const containerW = baseW + pad * 2;
            const containerH = baseH + pad * 2;
            const hiddenContainer = document.createElement('div');
            hiddenContainer.style.cssText = `position:fixed;left:0px;top:0px;overflow:visible;pointer-events:none;z-index:-9999;width:${containerW}px;height:${containerH}px;`;
            document.body.appendChild(hiddenContainer);
            hiddenContainer.appendChild(elClone);

            const cloneImgsToLoad = Array.from(elClone.querySelectorAll('img'));
            await Promise.all(cloneImgsToLoad.map(async (cimg) => {
              try {
                if (!cimg.complete) await new Promise(r => { cimg.onload = r; cimg.onerror = r; });
                if (typeof cimg.decode === 'function') await cimg.decode();
              } catch (e) { }
            }));

            forceSharpContext();
            const segmentCanvas = await html2canvas(elClone, {
              scale: BAKE_SCALE,
              logging: false,
              backgroundColor: null,
              scrollX: 0,
              scrollY: 0,
              useCORS: true,
              allowTaint: true
            });
            restoreContext();

            hiddenContainer.remove();

            if (segmentCanvas) {
              applyCanvasEffects(segmentCanvas, obj, BAKE_SCALE);

              let finalSegmentCanvas = segmentCanvas;
              const hasShadows = hasShadow || (glowVal > 0);
              if (hasShadows) {
                finalSegmentCanvas = document.createElement('canvas');
                finalSegmentCanvas.width = segmentCanvas.width;
                finalSegmentCanvas.height = segmentCanvas.height;
                finalSegmentCanvas.style.cssText = 'position:fixed;left:0px;top:0px;visibility:hidden;pointer-events:none;z-index:-9999;';
                document.body.appendChild(finalSegmentCanvas);

                const ctx = finalSegmentCanvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                if (hasShadow) {
                  ctx.save();
                  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
                  ctx.shadowBlur = 0;
                  ctx.shadowOffsetX = 8 * BAKE_SCALE;
                  ctx.shadowOffsetY = 8 * BAKE_SCALE;
                  ctx.drawImage(segmentCanvas, 0, 0);
                  ctx.restore();
                }

                if (glowVal > 0) {
                  ctx.save();
                  ctx.shadowColor = obj.glowColor || '#ffffff';
                  ctx.shadowBlur = glowVal * BAKE_SCALE;
                  ctx.shadowOffsetX = 0;
                  ctx.shadowOffsetY = 0;
                  ctx.drawImage(segmentCanvas, 0, 0);
                  ctx.restore();
                }

                ctx.drawImage(segmentCanvas, 0, 0);
                finalSegmentCanvas.remove();
              }

              obj._bakedSegments.push({
                segmentIndex: sIdx,
                bakedPng: finalSegmentCanvas.toDataURL('image/png'),
                bakedPadding: pad
              });
            }
          }
        } else if (obj.type === 'text') {
          // ─── Canvas-based multiline text rendering ───
          // html2canvas cannot render background-clip:text (gradient) or flex
          // centering, so we draw text directly via Canvas 2D API instead.
          const baseW = obj.width || 300;
          const baseH = obj.height || 300;
          const pad = filterPadding || 0;

          const cW = (baseW + pad * 2) * BAKE_SCALE;
          const cH = (baseH + pad * 2) * BAKE_SCALE;

          elementCanvas = document.createElement('canvas');
          elementCanvas.width = cW;
          elementCanvas.height = cH;
          const tctx = elementCanvas.getContext('2d');

          const fSize = (obj.fontSize || 56) * BAKE_SCALE;
          const fFamily = obj.fontFamily || "'Century Gothic', sans-serif";
          const fStyle = obj.italic ? 'italic ' : '';
          const fontStr = fStyle + 'bold ' + fSize + 'px ' + fFamily;

          let displayText = obj.text || '';
          const tt = obj.textTransform || 'none';
          if (tt === 'uppercase') displayText = displayText.toUpperCase();
          else if (tt === 'lowercase') displayText = displayText.toLowerCase();
          else if (tt === 'capitalize') displayText = displayText.replace(/\b\w/g, c => c.toUpperCase());

          tctx.font = fontStr;
          tctx.textAlign = 'center';
          tctx.textBaseline = 'middle';

          // Wrap text into lines based on maximum width (baseW minus 20px padding)
          const maxTextWidth = baseW - 20;
          const lines = [];
          const explicitParagraphs = displayText.split('\n');
          
          explicitParagraphs.forEach(para => {
            if (!para.trim()) {
              lines.push('');
              return;
            }
            const words = para.split(' ');
            let line = '';
            for (let n = 0; n < words.length; n++) {
              let testLine = line + (line ? ' ' : '') + words[n];
              tctx.font = fontStr;
              let metrics = tctx.measureText(testLine);
              let testWidth = metrics.width;
              if ('letterSpacing' in tctx) {
                const spacing = (obj.letterSpacing || 0) * BAKE_SCALE;
                testWidth += (testLine.length - 1) * spacing;
              }
              if (testWidth > maxTextWidth * BAKE_SCALE && n > 0) {
                lines.push(line);
                line = words[n];
              } else {
                line = testLine;
              }
            }
            lines.push(line);
          });

          if ('letterSpacing' in tctx) {
            tctx.letterSpacing = (obj.letterSpacing || 0) * BAKE_SCALE + 'px';
          }

          const cx = cW / 2;
          const cy = cH / 2;
          const olSize = (obj.outlineSize || 0) * BAKE_SCALE;
          const olColor = obj.outlineColor || '#000000';

          // 1. Drop shadow (drawn first, behind everything)
          if (obj.shadowSize > 0) {
            tctx.save();
            tctx.shadowColor = 'rgba(0,0,0,0.45)';
            tctx.shadowBlur = obj.shadowSize * BAKE_SCALE;
            tctx.shadowOffsetX = (obj.shadowX || 4) * BAKE_SCALE;
            tctx.shadowOffsetY = (obj.shadowY || 4) * BAKE_SCALE;
            tctx.fillStyle = 'rgba(0,0,0,0.45)';
            lines.forEach((line, i) => {
              if (!line) return;
              const ly = cy + (i - (lines.length - 1) / 2) * (fSize * 1.2);
              tctx.fillText(line, cx, ly);
            });
            tctx.restore();
          }

          // 2. Neon glow (drawn behind outline/stroke/fill)
          if (obj.neonGlow > 0) {
            const nc = obj.glowColor || obj.color || '#ffffff';
            [obj.neonGlow * 0.5, obj.neonGlow, obj.neonGlow * 2].forEach(r => {
              tctx.save();
              tctx.fillStyle = nc;
              tctx.shadowColor = nc;
              tctx.shadowBlur = r * BAKE_SCALE;
              tctx.shadowOffsetX = 0;
              tctx.shadowOffsetY = 0;
              lines.forEach((line, i) => {
                if (!line) return;
                const ly = cy + (i - (lines.length - 1) / 2) * (fSize * 1.2);
                tctx.fillText(line, cx, ly);
              });
              tctx.restore();
            });
          }

          // 3. Emboss (diagonal shadow offsets in outline color)
          if (obj.emboss) {
            tctx.fillStyle = olColor;
            for (let ei = 1; ei <= 6; ei++) {
              lines.forEach((line, i) => {
                if (!line) return;
                const ly = cy + (i - (lines.length - 1) / 2) * (fSize * 1.2);
                tctx.fillText(line, cx + ei * BAKE_SCALE, ly + ei * BAKE_SCALE);
              });
            }
          }

          // 4. Outline (4 diagonal offsets in outline color)
          if (olSize > 0) {
            tctx.fillStyle = olColor;
            lines.forEach((line, i) => {
              if (!line) return;
              const ly = cy + (i - (lines.length - 1) / 2) * (fSize * 1.2);
              tctx.fillText(line, cx + olSize, ly + olSize);
              tctx.fillText(line, cx - olSize, ly + olSize);
              tctx.fillText(line, cx + olSize, ly - olSize);
              tctx.fillText(line, cx - olSize, ly - olSize);
            });
          }

          // 5. Text stroke (drawn on top of outline/emboss, behind fill)
          if (obj.textStroke > 0) {
            tctx.save();
            tctx.strokeStyle = obj.textStrokeColor || '#000000';
            tctx.lineWidth = obj.textStroke * BAKE_SCALE * 2;
            tctx.lineJoin = 'round';
            lines.forEach((line, i) => {
              if (!line) return;
              const ly = cy + (i - (lines.length - 1) / 2) * (fSize * 1.2);
              tctx.strokeText(line, cx, ly);
            });
            tctx.restore();
          }

          // 6. Main fill — gradient or solid color with optional vignette (drawn on top of everything)
          const fillCanvas = document.createElement('canvas');
          fillCanvas.width = cW;
          fillCanvas.height = cH;
          const fctx = fillCanvas.getContext('2d');
          fctx.imageSmoothingEnabled = false;

          fctx.font = fontStr;
          fctx.textAlign = 'center';
          fctx.textBaseline = 'middle';
          if ('letterSpacing' in fctx) fctx.letterSpacing = (obj.letterSpacing || 0) * BAKE_SCALE + 'px';

          if (obj.gradient) {
            const angleDeg = obj.gradientAngle || 135;
            const angleRad = (angleDeg - 90) * Math.PI / 180;
            const diagLen = Math.sqrt(cW * cW + cH * cH);
            const cosA = Math.cos(angleRad);
            const sinA = Math.sin(angleRad);
            const grad = fctx.createLinearGradient(
              cx - cosA * diagLen / 2, cy - sinA * diagLen / 2,
              cx + cosA * diagLen / 2, cy + sinA * diagLen / 2
            );
            grad.addColorStop(0, obj.gradientColor1 || '#ffffff');
            grad.addColorStop(1, obj.gradientColor2 || '#00b4d8');
            fctx.fillStyle = grad;
          } else {
            fctx.fillStyle = obj.color || '#ffffff';
          }

          lines.forEach((line, i) => {
            if (!line) return;
            const ly = cy + (i - (lines.length - 1) / 2) * (fSize * 1.2);
            fctx.fillText(line, cx, ly);
          });

          if (obj.vignetteEnabled) {
            const vigI = obj.vignetteIntensity !== undefined ? obj.vignetteIntensity : 0.55;
            const vM = 0, v1 = 0.45 * vigI, v2 = 0.95 * vigI;
            const vigBg = fctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cW, cH) / 2);
            vigBg.addColorStop(0.28, 'rgba(0,0,0,' + vM + ')');
            vigBg.addColorStop(0.50, 'rgba(0,0,0,' + vM + ')');
            vigBg.addColorStop(0.80, 'rgba(0,0,0,' + v1 + ')');
            vigBg.addColorStop(1.00, 'rgba(0,0,0,' + v2 + ')');

            fctx.save();
            fctx.globalCompositeOperation = 'source-atop';
            fctx.fillStyle = vigBg;
            fctx.fillRect(0, 0, cW, cH);
            fctx.restore();
          }

          tctx.drawImage(fillCanvas, 0, 0);
        } else {
          const visualEl = obj.el.querySelector('.tm-object-content') || obj.el;
          const img = visualEl.querySelector('img');
          if (img) {
            const w = obj.width || img.naturalWidth;
            const h = obj.height || img.naturalHeight;
            elementCanvas = document.createElement('canvas');

            const padX = needsPadding ? filterPadding * 2 : 0;
            const padY = needsPadding ? filterPadding * 2 : 0;

            elementCanvas.width = (w + padX) * BAKE_SCALE;
            elementCanvas.height = (h + padY) * BAKE_SCALE;
            const ictx = elementCanvas.getContext('2d');
            ictx.imageSmoothingEnabled = false;

            const fitMode = img.style.objectFit || 'contain';
            const natW = img.naturalWidth || img.width;
            const natH = img.naturalHeight || img.height;
            const canvasW = w * BAKE_SCALE;
            const canvasH = h * BAKE_SCALE;
            const imgAspect = natW / natH;
            const boxAspect = canvasW / canvasH;
            let drawW, drawH, drawX, drawY;

            if (fitMode === 'cover') {
              if (imgAspect > boxAspect) {
                drawH = canvasH; drawW = canvasH * imgAspect;
                drawX = (canvasW - drawW) / 2; drawY = 0;
              } else {
                drawW = canvasW; drawH = canvasW / imgAspect;
                drawX = 0; drawY = (canvasH - drawH) / 2;
              }
            } else {
              if (imgAspect > boxAspect) {
                drawW = canvasW; drawH = canvasW / imgAspect;
                drawX = 0; drawY = (canvasH - drawH) / 2;
              } else {
                drawH = canvasH; drawW = canvasH * imgAspect;
                drawX = (canvasW - drawW) / 2; drawY = 0;
              }
            }
            const drawOffset = needsPadding ? filterPadding * BAKE_SCALE : 0;
            ictx.drawImage(img, drawX + drawOffset, drawY + drawOffset, drawW, drawH);
          }
        }

        if (!elementCanvas) continue;

        // Apply blur and color adjustments directly to elementCanvas using manual pixel processing.
        // This is 100% reliable across all mobile browsers including iOS Safari.
        applyCanvasEffects(elementCanvas, obj, BAKE_SCALE);

        const hasShadows = hasShadow || (glowVal > 0);
        if (!hasShadows) {
          obj._bakedPng = elementCanvas.toDataURL('image/png');
          obj._bakedPadding = filterPadding;
        } else {
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = elementCanvas.width;
          finalCanvas.height = elementCanvas.height;

          finalCanvas.style.cssText = 'position:fixed;left:0px;top:0px;visibility:hidden;pointer-events:none;z-index:-9999;';
          document.body.appendChild(finalCanvas);

          const ctx = finalCanvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;

          // 1. Draw Shadow first (if enabled) using native shadow properties.
          if (hasShadow) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 8 * BAKE_SCALE;
            ctx.shadowOffsetY = 8 * BAKE_SCALE;
            ctx.drawImage(elementCanvas, 0, 0);
            ctx.restore();
          }

          // 2. Draw Glow next (if enabled) using native shadow properties.
          if (glowVal > 0) {
            ctx.save();
            ctx.shadowColor = obj.glowColor || '#ffffff';
            ctx.shadowBlur = glowVal * BAKE_SCALE;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.drawImage(elementCanvas, 0, 0);
            ctx.restore();
          }

          // 3. Draw the actual element (already filtered) on top.
          ctx.drawImage(elementCanvas, 0, 0);

          finalCanvas.remove();

          obj._bakedPng = finalCanvas.toDataURL('image/png');
          obj._bakedPadding = filterPadding;
        }
      }

      if (onProgress) onProgress("Capturing workspace...", 60);

      // Perform live DOM swapping right before final workspace capture.
      tmState.objects.forEach(obj => {
        if (obj._bakedPng || (obj._bakedSegments && obj._bakedSegments.length > 0)) {
          const liveEl = document.querySelector(`[data-id="${obj.id}"]`);
          if (liveEl) {
            const targetContent = liveEl.querySelector('.tm-object-content') || liveEl;
            const originalFilter = targetContent.style.filter;
            const originalOutline = targetContent.style.outline;
            const originalOverflow = targetContent.style.overflow;
            const originalElOverflow = liveEl.style.overflow;

            // Save all original children in their exact original order for 100% accurate DOM restoration
            const originalChildren = Array.from(targetContent.childNodes);

            originalContents.push({
              targetContent,
              liveEl,
              originalFilter,
              originalOutline,
              originalOverflow,
              originalElOverflow,
              originalChildren
            });

            // Clear CSS filter during capture so it doesn't double-apply with baked image
            targetContent.style.filter = 'none';
            targetContent.style.outline = 'none';

            // Prevent clipping of rotated/transformed elements
            targetContent.style.setProperty('overflow', 'visible', 'important');
            liveEl.style.setProperty('overflow', 'visible', 'important');

            if (obj._bakedSegments && obj._bakedSegments.length > 0) {
              // Character segment baking swap: replace each segment element with its baked image in-place
              const segments = Array.from(targetContent.querySelectorAll('.tm-char-wrapper'));
              segments.forEach((child, sIdx) => {
                const segmentBake = obj._bakedSegments.find(s => s.segmentIndex === sIdx);
                if (segmentBake) {
                  const bakedImg = document.createElement('img');
                  bakedImg.className = 'tm-baked-temp-img';
                  bakedImg.src = segmentBake.bakedPng;

                  const objBlur = parseFloat(obj.blur) || 0;
                  if (objBlur === 0) {
                    bakedImg.style.imageRendering = 'pixelated';
                  } else {
                    bakedImg.style.imageRendering = 'auto';
                  }

                  const pad = segmentBake.bakedPadding || 0;
                  bakedImg.style.setProperty('position', 'absolute', 'important');
                  bakedImg.style.setProperty('pointer-events', 'none', 'important');
                  bakedImg.style.setProperty('left', `-${pad}px`, 'important');
                  bakedImg.style.setProperty('top', `-${pad}px`, 'important');
                  bakedImg.style.setProperty('width', (obj.width + pad * 2) + 'px', 'important');
                  bakedImg.style.setProperty('height', (obj.height + pad * 2) + 'px', 'important');
                  bakedImg.style.setProperty('display', 'block', 'important');

                  // Preserve the z-index from the original segment wrapper so interleaved
                  // nested items maintain their correct visual stacking order
                  if (child.style.zIndex) {
                    bakedImg.style.zIndex = child.style.zIndex;
                  }

                  targetContent.replaceChild(bakedImg, child);
                }
              });
            } else if (obj._bakedPng) {
              // Non-character or text baking swap
              const nestedItems = [];
              const savedChildren = [];
              originalChildren.forEach(child => {
                if (child.nodeType === 1 && child.classList && child.classList.contains('tm-object')) {
                  nestedItems.push(child);
                } else {
                  savedChildren.push(child);
                }
              });

              savedChildren.forEach(child => {
                if (child.parentNode === targetContent) {
                  targetContent.removeChild(child);
                }
              });

              const bakedImg = document.createElement('img');
              bakedImg.className = 'tm-baked-temp-img';
              bakedImg.src = obj._bakedPng;

              const objBlur = parseFloat(obj.blur) || 0;
              if (objBlur === 0) {
                bakedImg.style.imageRendering = 'pixelated';
              } else {
                bakedImg.style.imageRendering = 'auto';
              }

              const pad = obj._bakedPadding || 0;
              bakedImg.style.setProperty('position', 'absolute', 'important');
              bakedImg.style.setProperty('pointer-events', 'none', 'important');
              bakedImg.style.setProperty('left', `-${pad}px`, 'important');
              bakedImg.style.setProperty('top', `-${pad}px`, 'important');
              bakedImg.style.setProperty('width', (obj.width + pad * 2) + 'px', 'important');
              bakedImg.style.setProperty('height', (obj.height + pad * 2) + 'px', 'important');
              bakedImg.style.setProperty('display', 'block', 'important');

              if (nestedItems.length > 0) {
                targetContent.insertBefore(bakedImg, nestedItems[0]);
              } else {
                targetContent.appendChild(bakedImg);
              }
            }
          }
        }
      });

      // Compute bounding box of all visible objects to prevent export clipping
      let contentMinX = 0, contentMinY = 0, contentMaxX = wsWidth, contentMaxY = wsHeight;
      tmState.objects.forEach(obj => {
        if (obj.isTheme || obj.parentId) return;
        const s = obj.scale || 1;
        const sx = s * (obj.stretchX !== undefined ? obj.stretchX : 1);
        const sy = s * (obj.stretchY !== undefined ? obj.stretchY : 1);
        const sw = (obj.width || 0) * sx;
        const sh = (obj.height || 0) * sy;
        const rot = (obj.rotation || 0) * Math.PI / 180;
        let cx, cy;
        if (obj.type === 'character') {
          cx = obj.x;
          cy = obj.y;
        } else {
          cx = obj.x + (obj.width || 0) / 2;
          cy = obj.y + (obj.height || 0) / 2;
        }
        const cosR = Math.abs(Math.cos(rot));
        const sinR = Math.abs(Math.sin(rot));
        const bw = sw * cosR + sh * sinR;
        const bh = sw * sinR + sh * cosR;
        contentMinX = Math.min(contentMinX, cx - bw / 2);
        contentMinY = Math.min(contentMinY, cy - bh / 2);
        contentMaxX = Math.max(contentMaxX, cx + bw / 2);
        contentMaxY = Math.max(contentMaxY, cy + bh / 2);
      });
      const overflowPadLeft = 0;
      const overflowPadTop = 0;
      const overflowPadRight = 0;
      const overflowPadBottom = 0;
      const captureWidth = wsWidth;
      const captureHeight = wsHeight;

      const hasTheme = tmState.objects.some(o => o.isTheme);

      // =========================================================================
      //  STEP 2: FINAL WORKSPACE CAPTURE
      //  html2canvas captures the workspace. We pass explicit width/height so
      //  the capture viewport matches the workspace's natural resolution regardless
      //  of any CSS transform scaling applied on mobile. In onclone, we isolate
      //  the workspace under the body and clean up transforms/handles.
      // =========================================================================
      forceSharpContext();
      const finalCanvas = await html2canvas(ws, {
        scale: finalScale,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth + 100,
        windowHeight: captureHeight + 100,
        x: 0,
        y: 0,
        logging: false,
        backgroundColor: null,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: true,
        onclone: (clonedDoc) => {
          const clonedWs = clonedDoc.getElementById('tm-workspace');
          if (clonedWs) {
            // Safely detach workspace, then hide all remaining body children
            const wsParent = clonedWs.parentNode;
            if (wsParent) wsParent.removeChild(clonedWs);
            Array.from(clonedDoc.body.children).forEach(child => {
              child.style.display = 'none';
            });
            clonedDoc.body.appendChild(clonedWs);

            // Set clone body dimensions to the workspace resolution
            clonedDoc.body.style.cssText = `width:${captureWidth}px;height:${captureHeight}px;margin:0;padding:0;position:relative;overflow:visible;background:transparent;`;

            // Clean up workspace viewport scale and absolute layout properties
            clonedWs.style.transform = 'none';
            clonedWs.style.webkitTransform = 'none';
            clonedWs.style.msTransform = 'none';
            clonedWs.style.margin = '0';
            clonedWs.style.position = 'absolute';
            clonedWs.style.left = overflowPadLeft + 'px';
            clonedWs.style.top = overflowPadTop + 'px';
            clonedWs.style.width = wsWidth + 'px';
            clonedWs.style.height = wsHeight + 'px';
            clonedWs.style.setProperty('box-shadow', 'none', 'important');
            clonedWs.style.setProperty('border', 'none', 'important');
            clonedWs.style.overflow = 'hidden';

            // Transparency if no theme
            if (!hasTheme) {
              clonedWs.style.background = 'none';
              clonedWs.style.backgroundColor = 'transparent';
              clonedWs.style.backgroundImage = 'none';
            }

            // Remove selection and UI elements
            clonedWs.querySelectorAll('.selected, .tm-selected').forEach(el => {
              el.classList.remove('selected');
              el.classList.remove('tm-selected');
              el.style.outline = 'none';
            });
            clonedWs.querySelectorAll('.tm-handle, .tm-rotate-handle, .tm-delete-handle, .tm-duplicate-handle, .tm-object-vignette').forEach(h => {
              h.remove();
            });

            // Ensure all objects allow overflow for rotated/transformed content
            // and strip 3D transform properties that break html2canvas positioning
            clonedWs.querySelectorAll('.tm-object, .tm-object-content, .tm-char-wrapper').forEach(el => {
              el.style.overflow = 'visible';
              el.style.transformStyle = 'flat';
              el.style.backfaceVisibility = 'visible';
              el.style.perspective = 'none';
            });
            clonedWs.style.transformStyle = 'flat';
            clonedWs.style.backfaceVisibility = 'visible';
            clonedWs.style.perspective = 'none';
          }
        }
      });
      restoreContext();

      // Global vignette rendering is disabled because vignette is now a per-layer setting.
      return finalCanvas;
    } finally {
      restoreContext();

      if (vignetteEl) {
        vignetteEl.style.display = savedVignetteDisplay;
      }

      // Restore CSS transform and margins back to live workspace instantly
      ws.style.transform = savedTransform;
      ws.style.margin = savedMargin;
      ws.style.transformOrigin = savedTransformOrigin;
      void ws.offsetWidth;

      // Restore selections and visual handles
      if (prevSelected && getObj(prevSelected.id)) {
        prevSelected.el.classList.add('tm-selected');
        prevSelected.el.classList.add('selected');
        if (!prevSelected.isLocked && !prevSelected.isTheme) {
          addHandles(prevSelected.el, prevSelected);
        }
        applyTransform(prevSelected);
      }
      hiddenHandles.forEach(h => {
        h.style.display = '';
      });

      // Restore live DOM element child contents back from baked screenshots
      originalContents.forEach(entry => {
        // Clear everything inside targetContent
        entry.targetContent.innerHTML = '';

        // Re-append all original children in their exact original order
        entry.originalChildren.forEach(child => {
          entry.targetContent.appendChild(child);
        });

        // Restore styles
        entry.targetContent.style.filter = entry.originalFilter;
        entry.targetContent.style.outline = entry.originalOutline;
        entry.targetContent.style.overflow = entry.originalOverflow;
        entry.liveEl.style.overflow = entry.originalElOverflow;
      });

      // Clear cached baked strings to release GPU memory
      tmState.objects.forEach(obj => {
        delete obj._bakedPng;
        delete obj._bakedPadding;
        delete obj._bakedSegments;
        delete obj._overflowPadding;
      });

      // Restore workspace to high-quality internal resolution
      ws.style.width = savedQualityWidth;
      ws.style.height = savedQualityHeight;
      ws.style.backgroundSize = savedQualityBgSize;
      ws.style.backgroundPosition = savedQualityBgPos;
      tmState.objects.forEach(o => { if (o.el) applyTransform(o, TM_QUALITY); });
      if (window.tmResizeWorkspace) window.tmResizeWorkspace();
    }
  }

  window.tmExport = async function () {
    const ws = document.getElementById('tm-workspace');
    if (!ws) return;

    // Show custom high-end loading overlay
    let loader = document.getElementById('tm-export-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'tm-export-loader';
      loader.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 10, 20, 0.9); backdrop-filter: blur(15px);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        z-index: 999999; color: #fff; font-family: 'Century Gothic', sans-serif;
      `;
      loader.innerHTML = `
        <div style="border: 4px solid rgba(168, 218, 220, 0.1); border-top: 4px solid #a8dadc; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
        <div style="font-size: 16px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #a8dadc;">Baking high-fidelity layers...</div>
        <div id="tm-export-progress" style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 8px;">0% complete</div>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      `;
      document.body.appendChild(loader);
    } else {
      loader.style.display = 'flex';
    }

    const progressDiv = document.getElementById('tm-export-progress');
    const wasSelected = tmState.selectedId;
    tmDeselect();

    try {
      const finalCanvas = await tmGenerateBakedCanvas(2, (step, percent) => {
        if (progressDiv) progressDiv.textContent = `${step} (${percent}%)`;
      });

      if (finalCanvas) {
        const url = finalCanvas.toDataURL('image/png');
        await window.downloadFile(url, `thumbnail_${Date.now()}.png`, 'image/png');
      }
    } catch (e) {
      console.error("Export process failed:", e);
      alert("An error occurred during export. Please try again.");
    } finally {
      if (wasSelected) tmSelectObject(wasSelected);
      if (loader) loader.style.display = 'none';
    }
  };

  function tmGetSkinType(obj) {
    if (!obj || obj.type !== 'character') return 'normal';
    let type = obj.skinType || 'normal';

    // Check in obj.data if available
    const data = obj.data;
    if (data) {
      if (data.skinType === 'invisible' || data.skinType === 'jester' || data.skinType === 'skeleton' || data.skinType === 'golden_skeleton') {
        type = data.skinType;
      }
      if (data.overlayState) {
        try {
          const stateObj = typeof data.overlayState === 'string' ? JSON.parse(data.overlayState) : data.overlayState;
          if (stateObj.darkJesterActive || stateObj.normalJesterActive) return 'jester';
          if (stateObj.draculaActive) return 'dracula';
          if (stateObj.equippedItems) {
            for (const key in stateObj.equippedItems) {
              const item = stateObj.equippedItems[key];
              if (item && item.src) {
                if (item.src.includes('gsc/head.png')) return 'golden_skeleton';
                if (item.src.includes('sc/head.png')) return 'skeleton';
                if (key === 'head' && (item.src.includes('invisibleskin') || item.src.includes('pupil.png'))) return 'invisible';
              }
            }
          }
        } catch (e) { }
      }
    }
    return type;
  }

  const tmExpressions = [
    { num: 2, name: 'Happy / Smile' },
    { num: 3, name: 'Blink / Wink' },
    { num: 6, name: 'Angry' },
    { num: 7, name: 'Sad / Crying' },
    { num: 8, name: 'Surprised / Shocked' },
    { num: 9, name: 'Derp / Silly' },
    { num: 10, name: 'Neutral / Serious' },
    { num: 11, name: 'Content / Warm' }
  ];

  window.tmOpenExpressionsModal = function () {
    const selObj = selected();
    const skinType = tmGetSkinType(selObj);
    if (selObj && selObj.type === 'character' && (['jester', 'skeleton', 'golden_skeleton', 'invisible'].includes(skinType) || selObj.skinColor === 'rainbow')) {
      alert("Expressions cannot be applied to Jester, Skeleton, Invisible, or Rainbow characters.");
      return;
    }
    const m = document.getElementById('tm-expressions-catalog-modal');
    if (m) {
      m.classList.remove('hidden');
      m.style.height = '85vh';
      m.style.maxHeight = '85vh';
      m.style.top = '50%';
      m.style.transform = 'translate(-50%, -50%)';
      tmRenderExpressionsCatalog();
    }
  };

  window.tmCloseExpressionsModal = function () {
    const m = document.getElementById('tm-expressions-catalog-modal');
    if (m) m.classList.add('hidden');
  };

  window.tmRenderExpressionsCatalog = function () {
    const body = document.getElementById('tm-expressions-catalog-body');
    if (!body) return;
    body.innerHTML = '';

    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '20px';
    body.style.padding = '20px';
    body.style.maxHeight = 'calc(85vh - 70px)';
    body.style.overflowY = 'auto';

    const renderSection = (title, folder, prefix) => {
      const heading = document.createElement('h3');
      heading.textContent = title;
      heading.style.margin = '0 0 10px 0';
      heading.style.color = '#a8dadc';
      heading.style.fontSize = '14px';
      heading.style.borderBottom = '1px solid rgba(168, 218, 220, 0.15)';
      heading.style.paddingBottom = '5px';
      body.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'tm-expressions-grid';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(76px, 1fr))';
      grid.style.gap = '12px';
      grid.style.marginBottom = '20px';

      tmExpressions.forEach(expr => {
        const src = `specials/expressions/${folder}/${prefix}_${expr.num}.png`;
        const cell = document.createElement('div');
        cell.className = 'tm-item-catalog-cell';
        cell.style.cursor = 'pointer';
        cell.style.display = 'flex';
        cell.style.flexDirection = 'column';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.style.padding = '6px';
        cell.style.background = 'rgba(255, 255, 255, 0.03)';
        cell.style.borderRadius = '12px';
        cell.style.border = '1px solid rgba(255, 255, 255, 0.05)';
        cell.style.transition = 'all 0.2s';
        cell.style.aspectRatio = '1';
        cell.title = expr.name;

        // Hover styles
        cell.addEventListener('mouseenter', () => {
          cell.style.background = 'rgba(72, 191, 227, 0.1)';
          cell.style.borderColor = 'rgba(72, 191, 227, 0.3)';
        });
        cell.addEventListener('mouseleave', () => {
          cell.style.background = 'rgba(255, 255, 255, 0.03)';
          cell.style.borderColor = 'rgba(255, 255, 255, 0.05)';
        });

        // Preview circle to showcase small facial sprites clearly
        const previewWrapper = document.createElement('div');
        previewWrapper.style.position = 'relative';
        previewWrapper.style.width = '64px';
        previewWrapper.style.height = '64px';
        previewWrapper.style.background = 'rgba(168, 218, 220, 0.15)';
        previewWrapper.style.borderRadius = '50%';
        previewWrapper.style.display = 'flex';
        previewWrapper.style.alignItems = 'center';
        previewWrapper.style.justifyContent = 'center';
        previewWrapper.style.marginBottom = '8px';

        const img = document.createElement('img');
        img.src = src;
        img.alt = expr.name;
        img.style.width = '40px';
        img.style.height = '28px';
        img.style.imageRendering = 'pixelated';
        img.style.objectFit = 'contain';

        previewWrapper.appendChild(img);

        cell.appendChild(previewWrapper);
        // Label removed intentionally per user request

        cell.onclick = () => {
          tmCloseExpressionsModal();
          const selObj = selected();
          if (selObj && selObj.type === 'character') {
            tmApplyExpression(selObj, src);
          } else {
            tmStartSelectCharacterMode(src);
          }
        };

        grid.appendChild(cell);
      });

      body.appendChild(grid);
    };

    renderSection('Boy Expressions', 'expressionboy', 'spr_character_normal_face2');
    renderSection('Girl Expressions', 'expressiongirl', 'spr_character_girl_face2');
  };

  window.tmStartSelectCharacterMode = function (expressionSrc) {
    tmState.selectedExpression = expressionSrc;

    // Show banner
    let banner = document.getElementById('tm-expression-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'tm-expression-banner';
      banner.className = 'tm-expression-banner';
      banner.innerHTML = `
        <span>Click on a character in the workspace to apply this expression</span>
        <button class="tm-expression-cancel-btn" onclick="tmCancelExpressionMode()">Cancel</button>
      `;
      document.body.appendChild(banner);
    }
    banner.classList.remove('hidden');

    // Add selectable visual cues to all characters on canvas
    document.querySelectorAll('.tm-character').forEach(charEl => {
      charEl.classList.add('tm-character-selectable');
    });

    // Add capture event listener to intercept the click instantly
    window.addEventListener('click', tmHandleExpressionCharacterClick, true);
    window.addEventListener('keydown', tmHandleExpressionKeyDown);
  };

  window.tmCancelExpressionMode = function () {
    tmState.selectedExpression = null;

    const banner = document.getElementById('tm-expression-banner');
    if (banner) banner.classList.add('hidden');

    document.querySelectorAll('.tm-character').forEach(charEl => {
      charEl.classList.remove('tm-character-selectable');
    });

    window.removeEventListener('click', tmHandleExpressionCharacterClick, true);
    window.removeEventListener('keydown', tmHandleExpressionKeyDown);
  };

  function tmHandleExpressionKeyDown(e) {
    if (e.key === 'Escape') {
      tmCancelExpressionMode();
    }
  }

  function tmHandleExpressionCharacterClick(e) {
    if (!tmState.selectedExpression) return;

    const charEl = e.target.closest('.tm-character');
    if (charEl) {
      // Prevent standard dragging/selecting click
      e.stopPropagation();
      e.preventDefault();

      const charId = charEl.dataset.id;
      const charObj = getObj(charId);
      if (charObj) {
        tmApplyExpression(charObj, tmState.selectedExpression);
      }
      tmCancelExpressionMode();
    } else {
      if (e.target.id === 'tm-workspace') {
        tmCancelExpressionMode();
      }
    }
  }

  window.tmApplyExpression = function (charObj, src) {
    const skinType = tmGetSkinType(charObj);
    if (['jester', 'skeleton', 'golden_skeleton', 'invisible'].includes(skinType) || charObj.skinColor === 'rainbow') {
      // Clear out any existing overlays if skin was changed to one of these
      const targetParent = charObj.el.querySelector('.tm-head-group') || charObj.el;
      targetParent.querySelectorAll('.tm-expression-overlay, .tm-expression-base-head').forEach(el => el.remove());
      charObj.expression = null;

      alert("Expressions cannot be applied to Jester, Skeleton, Invisible, or Rainbow characters.");
      tmCancelExpressionMode();
      return;
    }
    const targetParent = charObj.el.querySelector('.tm-head-group') || charObj.el;

    // Clear out old expressions and old blank heads
    targetParent.querySelectorAll('.tm-expression-overlay, .tm-expression-base-head').forEach(el => el.remove());

    // Hide original head base if it exists (with fallback to any non-expression head image)
    const headBase = targetParent.querySelector('.tm-head-base') || targetParent.querySelector('img:not(.tm-expression-overlay):not(.tm-expression-base-head)');
    if (headBase) {
      headBase.style.display = 'none';
      headBase.style.zIndex = '1';
    }

    // ===================================================
    // UNIFIED BLANK HEAD & EXPRESSION SETTINGS
    // Edit these variables to manually reposition and scale the new blank head
    // and expression overlays globally across all characters.
    // ===================================================

    // --- 1. NEW BLANK HEAD SETTINGS ---
    const headOffsetX = 37;    // Move head base horizontally: Positive = RIGHT, Negative = LEFT
    const headOffsetY = 37;    // Move head base vertically: Positive = DOWN, Negative = UP
    const headScaleX = 0.635;   // Horizontal scale of the blank head base (1.0 = normal)
    const headScaleY = 0.635;   // Vertical scale of the blank head base (1.0 = normal)

    // --- 2. EXPRESSION OVERLAY SETTINGS ---
    let exprOffsetX = 114;    // Move expression face horizontally: Positive = RIGHT, Negative = LEFT
    let exprOffsetY = 31;    // Move expression face vertically: Positive = DOWN, Negative = UP
    let exprScaleX = 0.4;   // Horizontal scale of the expression overlay (1.0 = normal)
    let exprScaleY = 0.4;   // Vertical scale of the expression overlay (1.0 = normal)

    // ===================================================
    // MANUALLY ADJUST EXPRESSIONS INDIVIDUALLY HERE
    // You can customize offsets for Boy and Girl face folders separately below!
    // ===================================================
    if (src.includes('expressiongirl') || src.includes('girl_face2')) {
      // --- GIRL EXPRESSIONS CALIBRATION ---
      exprOffsetX = 112.5; // Edit this to offset the girl face horizontally (Positive = right, Negative = left)
      exprOffsetY = 75;  // Edit this to offset the girl face vertically (Positive = down, Negative = up)
      exprScaleX = 0.6;  // Edit this to scale girl face horizontally (1.0 = normal)
      exprScaleY = 0.6;  // Edit this to scale girl face vertically (1.0 = normal)
    } else {
      // --- BOY EXPRESSIONS CALIBRATION ---
      exprOffsetX = 112.5; // Edit this to offset the boy face horizontally (Positive = right, Negative = left)
      exprOffsetY = 75;  // Edit this to offset the boy face vertically (Positive = down, Negative = up)
      exprScaleX = 0.6;  // Edit this to scale boy face horizontally (1.0 = normal)
      exprScaleY = 0.6;  // Edit this to scale boy face vertically (1.0 = normal)
    }
    // ===================================================

    const headX = (charObj.pivots && charObj.pivots.headX !== undefined) ? charObj.pivots.headX : 474;
    const headY = (charObj.pivots && charObj.pivots.headY !== undefined) ? charObj.pivots.headY : 440;

    // Append new blank head based on skin type
    const blankHeadImg = document.createElement('img');
    blankHeadImg.className = 'tm-expression-base-head';
    blankHeadImg.style.position = 'absolute';
    blankHeadImg.style.zIndex = '2';
    blankHeadImg.style.left = (headX - 474 + headOffsetX * 4) + 'px';
    blankHeadImg.style.top = (headY - 472 + headOffsetY * 4) + 'px';
    blankHeadImg.style.width = (948 * headScaleX) + 'px';
    blankHeadImg.style.height = (472 * headScaleY) + 'px';
    blankHeadImg.style.objectFit = 'contain';
    blankHeadImg.style.imageRendering = 'auto';
    blankHeadImg.draggable = false;

    const match = src.match(/_(\d+)\.png$/);
    const expNum = match ? parseInt(match[1]) : null;
    const isAltHead = [2, 3, 10].includes(expNum);

    if (expNum === 10) {
      // --- NEUTRAL / SERIOUS INDEPENDENT CALIBRATION ---
      const neutralOffsetX = 2;  // Adjust horizontally: Positive = RIGHT, Negative = LEFT
      const neutralOffsetY = 1;  // Adjust vertically: Positive = DOWN, Negative = UP
      const neutralScaleX = 1.0;   // Scale horizontal multiplier (e.g. 1.1 to make it larger)
      const neutralScaleY = 1.0;   // Scale vertical multiplier (e.g. 1.1 to make it larger)

      exprOffsetX += neutralOffsetX;
      exprOffsetY += neutralOffsetY;
      exprScaleX *= neutralScaleX;
      exprScaleY *= neutralScaleY;
    }

    const baseNormal = isAltHead ? 'specials/expressions/2ndcharacter.png' : 'specials/expressions/character.png';
    const baseRobot = isAltHead ? 'specials/expressions/2ndrobot.png' : 'specials/expressions/robotskin.png';
    const baseSrc = (skinType === 'robot') ? baseRobot : baseNormal;

    if (skinType !== 'robot' && charObj.skinColor && charObj.skinColor !== 'rainbow' && charObj.skinColor !== 'none') {
      const tempImg = new Image();
      tempImg.onload = () => {
        blankHeadImg.src = tmTintImage(tempImg, charObj.skinColor);
      };
      tempImg.src = baseSrc;
    } else {
      blankHeadImg.src = baseSrc;
    }

    // Insert new expression overlay
    const exprImg = document.createElement('img');
    exprImg.className = 'tm-expression-overlay';
    exprImg.src = src;
    exprImg.style.position = 'absolute';
    exprImg.style.zIndex = '3';
    exprImg.style.left = (headX - 474 + exprOffsetX * 4) + 'px';
    exprImg.style.top = (headY - 472 + exprOffsetY * 4) + 'px';
    exprImg.style.width = (948 * exprScaleX) + 'px';
    exprImg.style.height = (472 * exprScaleY) + 'px';
    exprImg.style.objectFit = 'contain';
    exprImg.style.imageRendering = 'auto';
    exprImg.draggable = false;

    // Insert before accessories so accessories sit on top
    const accessories = targetParent.querySelector('.tm-head-accessories');
    if (accessories) {
      accessories.style.zIndex = '4';
      targetParent.insertBefore(blankHeadImg, accessories);
      targetParent.insertBefore(exprImg, accessories);
    } else {
      targetParent.appendChild(blankHeadImg);
      targetParent.appendChild(exprImg);
    }

    charObj.expression = src;

    // Re-select character to update properties panel and show Remove Face button
    tmSelectObject(charObj.id);
  };

  window.tmRemoveExpressionForSelected = function () {
    const obj = selected();
    if (!obj || obj.type !== 'character') return;

    const targetParent = obj.el.querySelector('.tm-head-group') || obj.el;
    targetParent.querySelectorAll('.tm-expression-overlay, .tm-expression-base-head').forEach(el => el.remove());

    const headBase = targetParent.querySelector('.tm-head-base') || targetParent.querySelector('img:not(.tm-expression-overlay):not(.tm-expression-base-head)');
    if (headBase) headBase.style.display = ''; // restore visibility

    obj.expression = null;
    tmSelectObject(obj.id);
  };

  window.tmResetWorkspace = function () {
    if (confirm("Are you sure you want to start over? This will completely clear your workspace!")) {
      if (window.tmPushHistoryState) window.tmPushHistoryState();

      tmDeselect();

      tmState.objects.forEach(obj => {
        if (obj.el) obj.el.remove();
      });
      tmState.objects = [];
      tmState.selectedId = null;
      window.tmCurrentWorkspaceThemeId = null;

      const ws = document.getElementById('tm-workspace');
      if (ws) {
        ws.className = 'tm-workspace';
      }

      tmAutoSaveWorkspace();
      tmRenderLayersPanel();
      updateUndoRedoUI();
    }
  };
})();
