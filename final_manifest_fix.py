import json

# Fix Manifest
manifest_path = r'c:\BreaWorlds Set Planner\worldplanner\blocks_manifest.json'
with open(manifest_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

manifest_fixes = {
    'spr_fg_xmas_dj_box': {'frameCount': 2, 'fps': 3, 'wrench': True, 'defaultState': 0},
    'spr_fg_gem_machine': {'frameCount': 2, 'fps': 10, 'wrench': True, 'defaultState': 0},
    'spr_fg_candle_checkpoint': {'frameCount': 4},
    'spr_fg_checkpoint': {'frameCount': 5},
    'spr_fg_icecream_lock': {'fps': 30}
}

for b in data['blocks']:
    bid = b.get('id')
    if bid in manifest_fixes:
        for k, v in manifest_fixes[bid].items():
            b[k] = v

with open(manifest_path, 'w', encoding='utf-8', newline='\r\n') as f:
    json.dump(data, f, indent=6, ensure_ascii=False)

print("Manifest updated.")
