import json

manifest_path = 'worldplanner/blocks_manifest.json'
with open(manifest_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

updated = []

for block in data['blocks']:
    if block.get('id') == 'spr_fg_xmas_dj_box':
        block['frameCount'] = 10
        updated.append('xmas_dj_box')
    elif block.get('id') == 'spr_fg_icecream_lock':
        block['fps'] = 20
        updated.append('icecream_lock')

if updated:
    with open(manifest_path, 'w', encoding='utf-8', newline='') as f:
        json.dump(data, f, indent=6, ensure_ascii=False)
    print(f"Updated blocks: {', '.join(updated)}")
else:
    print("No blocks found to update.")
