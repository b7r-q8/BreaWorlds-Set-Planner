
import os

file_path = "c:\\BreaWorlds Set Planner\\script.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Expanded logic with comprehensive prefix list
new_logic = """    items.sort((a, b) => {
      // Helper to generate a "Sort Key" (e.g., "Blue Neon Katana" -> "Neon Katana Blue")
      // This groups variants (Blue, Red, Green) under their main item name
      const getSortKey = (item) => {
        let name = item.textContent.trim();
        const prefixes = [
          "Blue", "Green", "Red", "Yellow", "Pink", "Purple", "Orange", 
          "Black", "White", "Dark", "Light", "Golden", "Silver", 
          "Emerald", "Ruby", "Sapphire", "Diamond", "Majestic", "Epic", "Hyper",
          "Neon", "Radioactive", "Flaming", "Frost", "Acid", "Aqua", "Cyan", "Brown", 
          "Grey", "Gray", "Violet", "Indigo", "Magenta", "Lime", "Olive", "Teal", 
          "Navy", "Maroon", "Broken", "Cursed", "Ancient", "Mystic", "Legendary", 
          "Crystal", "Electric", "Shadow", "Ghost", "Tech", "Cyber", "Pixel", 
          "Festive", "Xmas", "Valentine", "Halloween", "Easter", "Summer", "Winter", 
          "Rainbow", "Magma", "Water", "Earth", "Air", "Fire", "Ice", "Vampire", 
          "Zombie", "Alien", "Robot", "Mecha", "Steampunk", "Retro", "Mini"
        ];
        const exclusions = ["Dark Spirit", "Light Spirit"];
        
        // Skip exclusions (keep original name)
        if (exclusions.some(exc => name.includes(exc))) return name;
        
        const words = name.split(' ');
        if (words.length > 1 && prefixes.includes(words[0])) {
          const prefix = words.shift();
          // Move prefix to the end so "Neon Katana Blue" sorts next to "Neon Katana Red"
          return words.join(' ') + ' ' + prefix;
        }
        return name;
      };

      const keyA = getSortKey(a).toLowerCase();
      const keyB = getSortKey(b).toLowerCase();
      
      return keyA.localeCompare(keyB, undefined, { numeric: true, sensitivity: 'base' });
    });"""

# Find the start of the function and the end of it to replace strictly the sorting block
# searching for a generic pattern of the current block
start_marker = "    items.sort((a, b) => {"
end_marker = "    // Re-append items in the new sorted order"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    print(f"Found block at {start_idx} to {end_idx}")
    
    # We need to preserve the whitespace before end_marker usually
    # But end_marker is the start of the next line, so we just replace everything between 
    # start_marker and end_marker with new_logic
    
    # Check if there's any extra content to clean up from previous failed attempts or differences
    # We replace from start_marker (inclusive) to end_marker (exclusive)
    
    # We need to make sure new_logic ends with a newline and closing brace/semicolon if the original did
    # The original loop likely had `});` before `// Re-append`
    
    # Let's inspect what we are actually replacing to be safe
    current_block = content[start_idx:end_idx]
    # print(f"Replacing:\n{current_block}")
    
    # Ensure new_logic has the closing bits
    # new_logic already ends with `    });`, so we just need a newline?
    
    new_content = content[:start_idx] + new_logic + "\n\n" + content[end_idx:]
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced content.")
else:
    print("Could not find the target block.")
    
