import codecs
import re

with codecs.open(r'c:\BreaWorlds Set Planner\script.js', 'r', 'utf-8') as f:
    text = f.read()

# Fix 1: loadWPHotkeys
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
      if (parsed.tools) {
        for (let k in wpHotkeys.tools) {
          if (parsed.tools[k] !== undefined) wpHotkeys.tools[k] = parsed.tools[k];
        }
      }
      if (parsed.inventory) {
        for (let k in wpHotkeys.inventory) {
          if (parsed.inventory[k] !== undefined) wpHotkeys.inventory[k] = parsed.inventory[k];
        }
      }
    } catch (e) {
      console.error("Failed to parse hotkeys:", e);
    }
  }
}'''

text = text.replace(old_load, new_load)


# Fix 2: Remove PNGs from inventory in renderHotkeySettings
pattern = r'let imgSrc = null;.*?if \(slotBlockId.*?\{.*?\}.*?}'
text = re.sub(pattern, '', text, flags=re.DOTALL)
text = text.replace('${imgSrc ? `<img src="${imgSrc}" class="wp-inventory-icon">` : \'\'}', '')


# Fix 3: Select Tool Flip Duplication Bug
old_flip = '''  if (wasNotCopied && !wpPasteMode) {
    wpDropSelectionBuffer();
    saveWPHistory();
    showWPSelectionMenu();
  }'''

new_flip = '''  if (wasNotCopied && !wpPasteMode) {
    wpDropSelectionBuffer();
    wpCopiedData = null;
    saveWPHistory();
    showWPSelectionMenu();
  }'''

text = text.replace(old_flip, new_flip)

# Fix 5: backToSelection displaying Set Planner ghost items
old_back = '''  if (spUnequipBar) spUnequipBar.style.display = "none";'''
new_back = '''  if (spUnequipBar) spUnequipBar.style.display = "none";
  let bgWrapper = document.querySelector(".background-wrapper");
  if (bgWrapper) bgWrapper.style.display = "none";
  let charDisplay = document.getElementById("characterDisplay");
  if (charDisplay) charDisplay.style.display = "none";
  let nameDisp = document.getElementById("player-name");
  if (nameDisp) nameDisp.style.display = "none";
'''
text = text.replace(old_back, new_back)

# Write script.js
with codecs.open(r'c:\BreaWorlds Set Planner\script.js', 'w', 'utf-8') as f:
    f.write(text)

print('Edited script.js')
