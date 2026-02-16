import json

with open('worldplanner/blocks_manifest.json', 'r', encoding='utf-8') as f:
    raw = f.read()
    
data = json.loads(raw)
blocks = data['blocks']

changes = []

for b in blocks:
    bid = b.get('id', '')
    name = b.get('name', '')
    
    # 1. Treasure Chest, Amethyst Chest
    if bid in ['spr_fg_treasure_chest', 'spr_fg_amethyst_chest']:
        b['wrench'] = True
        b['defaultState'] = 0
        changes.append(f"SET wrench: {bid} ({name})")
    
    # 2. Bait Box
    if bid == 'spr_fg_bait_box':
        b['wrench'] = True
        b['defaultState'] = 0
        changes.append(f"SET wrench: {bid} ({name})")
    
    # 3. Gem Machine
    if bid == 'spr_fg_gem_machine':
        b['wrench'] = True
        b['defaultState'] = 0
        changes.append(f"SET wrench: {bid} ({name})")
    
    # 4. All entrances (containing 'entrance' but NOT exactly 'spr_fg_entrance')
    if 'entrance' in bid and bid != 'spr_fg_entrance':
        fc = b.get('frameCount', 1)
        if fc >= 2:
            b['wrench'] = True
            b['defaultState'] = 0
            changes.append(f"SET wrench: {bid} ({name}) fc={fc}")
    
    # 5. Candle Checkpoint Block: remove last frame
    if bid == 'spr_fg_candle_checkpoint_block':
        old_fc = b.get('frameCount', 1)
        if old_fc > 1:
            b['frameCount'] = old_fc - 1
            changes.append(f"REDUCE frame: {bid} {old_fc} -> {old_fc - 1}")
    
    # 6. Checkpoint Block: remove last frame
    if bid == 'spr_fg_checkpoint_block':
        old_fc = b.get('frameCount', 1)
        if old_fc > 1:
            b['frameCount'] = old_fc - 1
            changes.append(f"REDUCE frame: {bid} {old_fc} -> {old_fc - 1}")
    
    # 7. Dice Block
    if bid == 'spr_fg_dice_block':
        b['wrench'] = True
        b['defaultState'] = 0
        changes.append(f"SET wrench: {bid} ({name}) fc={b.get('frameCount')}")
    
    # 8. Garment Suitcase
    if 'garment' in bid:
        b['wrench'] = True
        b['defaultState'] = 0
        changes.append(f"SET wrench: {bid} ({name})")
    
    # 9. Guild Block, Guild Flag, Guild Podium
    if bid in ['spr_fg_guild_block', 'spr_fg_guild_flag', 'spr_fg_guild_podium_block']:
        b['wrench'] = True
        b['defaultState'] = 0
        changes.append(f"SET wrench: {bid} ({name}) fc={b.get('frameCount')}")

# Write back preserving formatting style
output = json.dumps(data, indent=6, ensure_ascii=False)
# Convert to CRLF
output = output.replace('\n', '\r\n')

with open('worldplanner/blocks_manifest.json', 'w', encoding='utf-8', newline='') as f:
    f.write(output)

for c in changes:
    print(c)
print(f"\nTotal changes: {len(changes)}")
print("File saved successfully.")
