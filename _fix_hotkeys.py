import codecs
path = r'c:\BreaWorlds Set Planner\script.js'
with codecs.open(path, 'r', 'utf-8') as f:
    text = f.read()

old_func = """function renderHotkeySettings() {
  const toolsList = document.getElementById("wp-hotkeys-list");
  const invList = document.getElementById("wp-inventory-hotkeys-list");
  if (!toolsList || !invList) return;

  toolsList.innerHTML = "";
  invList.innerHTML = "";

  // Tools
  Object.keys(wpHotkeys.tools).forEach(tool => {
    const key = wpHotkeys.tools[tool];
    const item = document.createElement("div");
    item.className = "wp-hotkey-item";
    item.innerHTML = `
      <span class="wp-hotkey-label">${tool}</span>
      <div style="display: flex; gap: 8px;">
        <button class="wp-key-cap" data-type="tools" data-id="${tool}" onclick="startHotkeyCapture(this)">${key || ""}</button>
        <button class="wp-key-clear" onclick="clearHotkey('tools', '${tool}')" style="background: none; border: none; color: #e63946; font-size: 10px; cursor: pointer; opacity: 0.6;">X</button>
      </div>
    `;
    toolsList.appendChild(item);
  });

  // Inventory
  for (let i = 0; i < 10; i++) {
    const slotId = `slot-${i}`;
    const key = wpHotkeys.inventory[slotId];
    const item = document.createElement("div");
    item.className = "wp-hotkey-item";
    item.innerHTML = `
      <span class="wp-hotkey-label">Slot ${i + 1}</span>
      <div style="display: flex; gap: 8px;">
        <button class="wp-key-cap" data-type="inventory" data-id="${slotId}" onclick="startHotkeyCapture(this)">${key || ""}</button>
        <button class="wp-key-clear" onclick="clearHotkey('inventory', '${slotId}')" style="background: none; border: none; color: #e63946; font-size: 10px; cursor: pointer; opacity: 0.6;">X</button>
      </div>
    `;
    invList.appendChild(item);
  }
}"""

new_func = """function renderHotkeySettings() {
  const toolsList = document.getElementById("wp-hotkeys-list");
  const invList = document.getElementById("wp-inventory-hotkeys-list");
  if (!toolsList || !invList) return;

  toolsList.innerHTML = "";
  invList.innerHTML = "";

  const createHotkeyItem = (type, id, label) => {
    const key = wpHotkeys[type][id];
    const item = document.createElement("div");
    item.className = "wp-hotkey-item";
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${key ? '#4caf50' : 'rgba(255,255,255,0.2)'}; box-shadow: 0 0 5px ${key ? 'rgba(76,175,80,0.5)' : 'transparent'};"></div>
        <span class="wp-hotkey-label">${label}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button class="wp-key-cap ${!key ? 'empty' : ''}" data-type="${type}" data-id="${id}" onclick="startHotkeyCapture(this)" title="Click to assign key">${key ? key.toUpperCase() : "NONE"}</button>
        <button class="wp-key-clear" onclick="clearHotkey('${type}', '${id}')" title="Clear Hotkey" style="background: rgba(230, 57, 70, 0.1); border: 1px solid rgba(230, 57, 70, 0.2); color: #e63946; border-radius: 4px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; cursor: pointer; transition: all 0.2s;">&times;</button>
      </div>
    `;
    return item;
  };

  // Tools
  const toolLabels = {
    pencil: "Place", eraser: "Erase", picker: "Pick Block", bucket: "Fill Area",
    selection: "Select Box", move: "Move Box", flip: "Flip Box", fill: "Fill Box",
    delete: "Delete Box", undo: "Undo", redo: "Redo"
  };
  
  Object.keys(wpHotkeys.tools).forEach(tool => {
    toolsList.appendChild(createHotkeyItem('tools', tool, toolLabels[tool] || tool));
  });

  // Inventory
  for (let i = 0; i < 10; i++) {
    invList.appendChild(createHotkeyItem('inventory', `slot-${i}`, `Slot ${i + 1}`));
  }
}"""

old_norm = old_func.replace('\r\n', '\n')
new_norm = new_func.replace('\r\n', '\n')
text_norm = text.replace('\r\n', '\n')

if old_norm in text_norm:
    text_norm = text_norm.replace(old_norm, new_norm)
    with codecs.open(path, 'w', 'utf-8') as f:
        f.write(text_norm.replace('\n', '\r\n'))
    print('Replaced')
else:
    print('Not found')
