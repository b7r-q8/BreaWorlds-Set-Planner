import codecs
import re

path = r'c:\BreaWorlds Set Planner\script.js'

with codecs.open(path, 'r', 'utf-8') as f:
    text = f.read()

# 1. Update wpHotkeys initialization
old_init = r'let wpHotkeys = \{.*?inventory: \{.*?slot-4: null\s*\}\s*\}'
valid_tools = [
    'pencil', 'eraser', 'move', 'wrench', 'select', 'fill', 'undo', 'redo',
    'reset', 'clear', 'grid', 'count', 'reposition', 'save', 'blocks', 'themes'
]
new_init = 'let wpHotkeys = {\n  tools: {\n' + ',\n'.join([f'    {t}: null' for t in valid_tools]) + '\n  },\n  inventory: {\n' + ',\n'.join([f'    "slot-{i}": null' for i in range(10)]) + '\n  }\n}'

# Use a simpler match for the initialization if regex fails
text = re.sub(r'let wpHotkeys = \{.*?pencil: null,.*?eraser: null,.*?slot-4: null\s*\}\s*\}', new_init, text, flags=re.DOTALL)

# 2. Update loadWPHotkeys for strict filtering
old_load = '''function loadWPHotkeys() {
  const saved = localStorage.getItem("wp_custom_hotkeys");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.tools && parsed.inventory) {
        wpHotkeys = parsed;
      }
    } catch (e) {
      console.error("Failed to parse hotkeys:", e);
    }
  }
}'''

new_load = '''function loadWPHotkeys() {
  const saved = localStorage.getItem("wp_custom_hotkeys");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Strict filtering of tools to avoid "Undefined" slots
      if (parsed.tools) {
        Object.keys(wpHotkeys.tools).forEach(tool => {
          if (parsed.tools[tool]) wpHotkeys.tools[tool] = parsed.tools[tool];
        });
      }
      if (parsed.inventory) {
        Object.keys(wpHotkeys.inventory).forEach(slot => {
          if (parsed.inventory[slot]) wpHotkeys.inventory[slot] = parsed.inventory[slot];
        });
      }
    } catch (e) {
      console.error("Failed to parse hotkeys:", e);
    }
  }
}'''
text = text.replace(old_load, new_load)

# 3. Update renderHotkeySettings to remove PNGs
# Find the loop that renders inventory slots
text = re.sub(r'let iconSrc = null;.*?if \(blockId\).*?iconSrc = block.src;.*?\}', 'let iconSrc = null;', text, flags=re.DOTALL)
text = text.replace('createHotkeyItem(\'inventory\', `slot-${i}`, `Slot ${i + 1}`, false, iconSrc)', 'createHotkeyItem(\'inventory\', `slot-${i}`, `Slot ${i + 1}`, false, null)')

# 4. Fix wpFlipSelection duplication bug
# Currently it drops the buffer back to world immediately after flipping.
# If wasNotCopied is true, it means we just selected and flipped.
# We should keep it as wpCopiedData but NOT drop it yet if the user wants to move it?
# Or if it's dropped, we must ensure it's not duplicated when moved next.
# The user wants to "take the chunk out of the blocks". 
# wpCopySelectionToDragBuffer(true) successfully clears the world.
# But then dropping it puts it back.
# I'll modify wpFlipSelection to leave it in wpCopiedData (floating) for the select tool.

old_flip_end = '''  if (wasNotCopied && !wpPasteMode) {
    wpDropSelectionBuffer();
    saveWPHistory();
    showWPSelectionMenu();
  }'''

# If it's a select tool flip, we keep it floating (wpCopiedData active)
# so the user can then drag it.
new_flip_end = '''  if (wasNotCopied && !wpPasteMode) {
    // Keep it in buffer so user can drag the flipped chunk without duplication
    saveWPHistory();
    showWPSelectionMenu();
  }'''
text = text.replace(old_flip_end, new_flip_end)

# 5. Fix backToSelection ghosting
old_back = '''  if (spUnequipBar) spUnequipBar.style.display = "none";'''
new_back = '''  if (spUnequipBar) spUnequipBar.style.display = "none";
  // Fix Set Planner ghost items
  const bgWrapper = document.querySelector(".background-wrapper");
  if (bgWrapper) bgWrapper.style.display = "none";
  const charDisplay = document.getElementById("characterDisplay");
  if (charDisplay) charDisplay.style.display = "none";
  const playerNameDiv = document.getElementById("player-name");
  if (playerNameDiv) playerNameDiv.style.display = "none";
'''
text = text.replace(old_back, new_back)

# 6. Global Roadmap Button Logic
# Update the roadmap button visibility in selectPlanner
text = text.replace('if (roadmapBtn) roadmapBtn.style.display = "none";', 'const rmBtn = document.getElementById("main-roadmap-btn"); if (rmBtn) rmBtn.style.display = "none";')
text = text.replace('if (roadmapBtn) roadmapBtn.style.display = "flex";', 'const rmBtn = document.getElementById("main-roadmap-btn"); if (rmBtn) rmBtn.style.display = "flex";')

# Initial show
text = text.replace('if (loadingSelection) loadingSelection.style.display = "flex";', 'if (loadingSelection) loadingSelection.style.display = "flex";\n    const rmBtn = document.getElementById("main-roadmap-btn"); if (rmBtn) rmBtn.style.display = "flex";')

# Write back
with codecs.open(path, 'w', 'utf-8') as f:
    f.write(text)

print('Updated script.js')
