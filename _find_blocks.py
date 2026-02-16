import json

data = json.load(open('worldplanner/blocks_manifest.json'))
targets = ['treasure', 'amethyst_chest', 'bait_box', 'gem_machine', 'entrance',
           'candle_checkpoint', 'checkpoint_block', 'dice_block', 'garment',
           'guild_block', 'guild_flag', 'guild_podium']

for i, b in enumerate(data['blocks']):
    bid = b.get('id', '')
    if any(t in bid for t in targets):
        print(f"idx={i} | id={bid} | name={b.get('name')} | fc={b.get('frameCount','N/A')} | fps={b.get('fps','N/A')} | wrench={b.get('wrench',False)}")
