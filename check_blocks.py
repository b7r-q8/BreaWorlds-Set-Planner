import json

with open('worldplanner/blocks_manifest.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for i, b in enumerate(data['blocks']):
    if b.get('id') in ['spr_fg_xmas_dj_box', 'spr_fg_icecream_lock']:
        print(f"Index {i}: {json.dumps(b, indent=2)}")
