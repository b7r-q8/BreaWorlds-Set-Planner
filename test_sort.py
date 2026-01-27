
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
    name = name.strip()
    
    # Exceptions: If it starts with certain prefixes, keep order (Noun-Adjective or Brand-Model)
    # or just keep original name if "Noun" is at start.
    start_exceptions = ["Lambo", "Pet", "Wings of", "Hand of", "Eye of", "Mask of"]
    if any(name.startswith(exc) for exc in start_exceptions):
         return name
         
    words = name.split()
    if len(words) > 1:
        # Move last word to front
        last = words.pop()
        return last + " " + " ".join(words)
    return name

print("--- SORTED ITEMS ---")
items.sort(key=lambda x: get_sort_key(x).lower())
for item in items:
    print(f"{item}  (Key: {get_sort_key(item)})")
