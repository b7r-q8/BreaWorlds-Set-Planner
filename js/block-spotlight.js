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

