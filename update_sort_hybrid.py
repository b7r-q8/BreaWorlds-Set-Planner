
import os

file_path = "c:\\BreaWorlds Set Planner\\script.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# New "Hybrid" sorting logic (Prefix + Base Noun)
new_logic = """    items.sort((a, b) => {
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
    });"""

# Find the start of the function and the end of it to replace strictly the sorting block
start_marker = "    items.sort((a, b) => {"
# The end marker in the file from previous update ends with '});' then the next line is usually '    // Re-append' or similar
# Let's search for the start marker and simply replace everything until the 'Re-append' comment again
end_marker = "    // Re-append items in the new sorted order"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    print(f"Found block at {start_idx} to {end_idx}")
    
    new_content = content[:start_idx] + new_logic + "\n\n" + content[end_idx:]
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced content.")
else:
    print("Could not find the target block.")
    print(f"Start marker found: {start_idx}")
    print(f"End marker found: {end_idx}")
