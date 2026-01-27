// INVENTORY FIX - Replace renderInventory() in script.js with this version

// Add this global variable near the top of script.js (after inventory declaration)
let inventoryClickDebounce = false;

// Replace the renderInventory function with this:
function renderInventory() {
  const slots = document.querySelectorAll(".inventory .inventory-slot.slot");

  slots.forEach((slot, index) => {
    slot.innerHTML = "";

    const item = inventory[index];
    if (!item) return;

    const img = document.createElement("img");
    img.src = item.icon;
    img.style.cursor = 'pointer';
    img.dataset.inventoryIndex = index;
    img.dataset.itemType = item.type;

    slot.appendChild(img);
  });
}

// Add this event delegation handler inside the DOMContentLoaded event (around line 1254):
window.addEventListener('DOMContentLoaded', () => {
  loadState();

  // ... existing code ...

  // Add inventory click delegation
  const inventoryContainer = document.querySelector('.inventory');
  if (inventoryContainer) {
    inventoryContainer.addEventListener('click', (e) => {
      const img = e.target;
      if (!img.dataset || !img.dataset.inventoryIndex) return;
      
      // Prevent rapid duplicate clicks
      if (inventoryClickDebounce) return;
      inventoryClickDebounce = true;
      setTimeout(() => { inventoryClickDebounce = false; }, 150);
      
      const index = parseInt(img.dataset.inventoryIndex, 10);
      const item = inventory[index];
      if (!item || !item.menuElement) return;
      
      if (item.type === "hat") {
        equipHat(item.src, item.menuElement);
      } else {
        equipItem(item.menuElement);
      }
    });
  }
});
