import json

manifest_path = 'worldplanner/blocks_manifest.json'
with open(manifest_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

for block in data['blocks']:
    if block.get('id') == 'spr_fg_xmas_dj_box':
        block['frameCount'] = 10
        print("Updated Xmas DJ Box frameCount to 10")
    elif block.get('id') == 'spr_fg_icecream_lock':
        # Current FPS should be 10 (after previous update), let's make it 20.
        block['fps'] = 20
        print("Updated Icecream Lock fps to 20")

with open(manifest_path, 'w', encoding='utf-8', newline='') as f:
    # Match the existing indentation (6 spaces)
    json.dump(data, f, indent=6, ensure_ascii=False)
    # Ensure CRLF if needed (though json.dump uses \n, and windows usually handles it)
