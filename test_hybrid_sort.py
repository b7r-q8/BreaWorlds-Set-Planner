
items = [
    "Golden Knight Helmet",
    "Silver Knight Helmet",
    "Bronze Helmet",
    "Blue Pacifier",
    "Pink Pacifier",
    "Black Rocker Hair",
    "Brown Rocker Hair",
    "Long Brown Hair",
    "Aqua Long Hair",
    "Cyan Long Hair",
    "Dark Spiky Hair",
    "Messy Brown Hair",
    "Lambo Huracan",
    "Lambo Ventador",
    "Pet Golden Reindeer",
    "Pet Shark"
]

def get_sort_key(name):
    original_name = name.strip()
    name = original_name
    
    # 1. Define Prefixes to Strip (Colors, Materials, Qualifiers)
    prefixes = [
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
    ]
    
    # 2. Check for Prefix
    found_prefix = ""
    words = name.split()
    if len(words) > 1 and words[0] in prefixes:
        found_prefix = words.pop(0)
        name = " ".join(words)
        
    # 3. Exceptions (Start with specific words -> Keep order or treat differently)
    # "Lambo" -> Keep as Lambo Huracan
    # "Pet" -> Keep as Pet ...
    start_exceptions = ["Lambo", "Pet", "Wings of", "Hand of", "Eye of", "Mask of"]
    if any(original_name.startswith(exc) for exc in start_exceptions):
         return original_name

    # 4. Identify Base Noun (Last Word)
    words = name.split()
    if len(words) > 1:
        last = words.pop()
        # Key: BaseNoun + RestOfAttributes + Prefix
        return f"{last} {' '.join(words)} {found_prefix}".strip()
    
    # Single word or strict noun
    return f"{name} {found_prefix}".strip()

print("--- SORTED ITEMS (HYBRID) ---")
items.sort(key=lambda x: get_sort_key(x).lower())
for item in items:
    print(f"{item}  [Key: {get_sort_key(item)}]")
