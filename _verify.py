import json

data = json.load(open('worldplanner/blocks_manifest.json'))
checks = [
    'spr_fg_treasure_chest', 'spr_fg_amethyst_chest', 'spr_fg_bait_box',
    'spr_fg_gem_machine', 'spr_fg_dice_block', 'spr_fg_guild_block',
    'spr_fg_guild_flag', 'spr_fg_guild_podium_block',
    'spr_fg_candle_checkpoint_block', 'spr_fg_checkpoint_block',
    'spr_fg_black_entrance', 'spr_fg_iron_entrance', 'spr_fg_entrance'
]

for b in data['blocks']:
    if b['id'] in checks or ('entrance' in b['id'] and 'garment' not in b['id']):
        print(f"{b['id']:45s} fc={str(b.get('frameCount','N/A')):4s} wrench={str(b.get('wrench',False)):6s} state={b.get('defaultState','N/A')}")
