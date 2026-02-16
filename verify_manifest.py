import json

with open(r'c:\BreaWorlds Set Planner\worldplanner\blocks_manifest.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

targets = ['spr_fg_xmas_dj_box', 'spr_fg_gem_machine', 'spr_fg_checkpoint', 'spr_fg_candle_checkpoint']
results = {}

for b in data['blocks']:
    if b.get('id') in targets:
        results[b['id']] = b

print(json.dumps(results, indent=2))
