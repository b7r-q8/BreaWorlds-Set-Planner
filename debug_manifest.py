import json

with open(r'c:\BreaWorlds Set Planner\worldplanner\blocks_manifest.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

targets = ['spr_fg_xmas_dj_box', 'spr_fg_gem_machine']
found = [b for b in data['blocks'] if b.get('id') in targets]

with open('debug_blocks.json', 'w', encoding='utf-8') as f:
    json.dump(found, f, indent=2)
