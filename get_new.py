import os, json

new_dir = set(os.listdir('worldplanner/new'))
blocks_dir = set(os.listdir('worldplanner/Blocks'))

new_items = new_dir - blocks_dir

wa = [i for i in new_items if i.startswith('spr_wa_')]
wp = [i for i in new_items if not i.startswith('spr_wa_')]

with open('new_items.json', 'w') as f:
    json.dump({'set_planner': sorted(wa), 'world_planner': sorted(wp)}, f, indent=2)
