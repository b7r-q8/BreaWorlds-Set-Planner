import json

data = json.load(open('worldplanner/blocks_manifest.json'))
targets = {
    'spr_fg_treasure_chest': 'wrench',
    'spr_fg_amethyst_chest': 'wrench',
    'spr_fg_bait_box': 'wrench',
    'spr_fg_gem_machine': 'wrench',
    'spr_fg_dice_block': 'wrench',
    'spr_fg_guild_block': 'wrench',
    'spr_fg_guild_flag': 'wrench',
    'spr_fg_guild_podium_block': 'wrench',
    'spr_fg_candle_checkpoint_block': 'frameReduce',
    'spr_fg_checkpoint_block': 'frameReduce',
}

for b in data['blocks']:
    bid = b['id']
    if bid in targets:
        w = b.get('wrench', False)
        ds = b.get('defaultState', 'N/A')
        fc = b.get('frameCount', 'N/A')
        print(f"{bid}: wrench={w}, defaultState={ds}, frameCount={fc}")
    elif 'entrance' in bid:
        w = b.get('wrench', False)
        ds = b.get('defaultState', 'N/A')
        fc = b.get('frameCount', 'N/A')
        print(f"{bid}: wrench={w}, defaultState={ds}, frameCount={fc}")
    elif 'garment' in bid:
        w = b.get('wrench', False)
        ds = b.get('defaultState', 'N/A')
        fc = b.get('frameCount', 'N/A')
        print(f"{bid}: wrench={w}, defaultState={ds}, frameCount={fc}")
