import json

with open('worldplanner/blocks_manifest.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

blocks = data['blocks']
changes = []

# Track and remove duplicate music_box_block (keep first occurrence)
seen_music_box = False
to_remove = []

for i, b in enumerate(blocks):
    bid = b.get('id', '')
    
    # Remove duplicate music_box_block
    if bid == 'spr_fg_music_box_block':
        if seen_music_box:
            to_remove.append(i)
            changes.append(f"REMOVE duplicate: {bid} at index {i}")
        else:
            seen_music_box = True
    
    # 1. Icecream Lock: 2x faster (current fps=5 -> fps=10)
    if bid == 'spr_fg_icecream_lock':
        old_fps = b.get('fps', 10)
        b['fps'] = old_fps * 2
        changes.append(f"SPEED UP: {bid} fps {old_fps} -> {b['fps']}")
    
    # 2. Trap Platform: 5x slower than original 10fps -> fps=2
    # Bear Trap: same
    if bid == 'spr_fg_trap_platform':
        b['fps'] = 0.2
        changes.append(f"SLOW DOWN: {bid} fps -> 0.2 (5 sec per frame)")
    
    if bid == 'spr_fg_bear_trap':
        b['fps'] = 0.2
        changes.append(f"SLOW DOWN: {bid} fps -> 0.2 (5 sec per frame)")
    
    # 3. Valentine Music Box: 2x slower
    if bid == 'spr_fg_valentine_music_box':
        old_fps = b.get('fps', 10)
        b['fps'] = old_fps / 2
        changes.append(f"SLOW DOWN: {bid} fps {old_fps} -> {b['fps']}")
    
    # 4. Xmas DJ Box: Restore frameCount to 9, keep wrench=true
    if bid == 'spr_fg_xmas_dj_box':
        b['frameCount'] = 9
        b['wrench'] = True
        b['defaultState'] = 0
        b['fps'] = 3
        changes.append(f"FIX: {bid} frameCount restored to 9, wrench=true, fps=3")
    
    # 5. Xmas Sack: wrench=true, defaultState=0
    if bid == 'spr_fg_xmas_sack':
        b['wrench'] = True
        b['defaultState'] = 0
        changes.append(f"SET wrench: {bid}")

# Remove duplicates (in reverse order to preserve indices)
for idx in reversed(to_remove):
    blocks.pop(idx)

# Write back
output = json.dumps(data, indent=6, ensure_ascii=False)
output = output.replace('\n', '\r\n')

with open('worldplanner/blocks_manifest.json', 'w', encoding='utf-8', newline='') as f:
    f.write(output)

for c in changes:
    print(c)
print(f"\nTotal changes: {len(changes)}")
print("File saved successfully.")
