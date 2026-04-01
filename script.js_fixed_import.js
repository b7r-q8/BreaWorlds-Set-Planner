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
            
            // Collect for multiplayer
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

  // TILING PASS for image import result
  for (let wy = startY - 1; wy <= startY + targetH; wy++) {
    for (let wx = startX - 1; wx <= startX + targetW; wx++) {
      if (wx >= 0 && wx < WORLD_WIDTH && wy >= 0 && wy < WORLD_HEIGHT) {
        wpUpdateTilingAt(wx, wy);
      }
    }
  }

  // BROADCAST TO MULTIPLAYER BEFORE HISTORY SAVE
  if (typeof mpBroadcastBulkAction === 'function' && changedDeltas.length > 0) {
      // Manual broadcast uses 'v' as the next value directly.
      // mpBroadcastBulkAction(deltas, isUndo) logic: changes = deltas.map(d => ({ x: d.x, y: d.y, l: d.l, v: isUndo ? d.prev : d.next }));
      // So I should pass my changedDeltas and set isUndo = false, but I need to make sure property names match.
      // Actually, mpBroadcastBulkAction expects 'next' property!
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
