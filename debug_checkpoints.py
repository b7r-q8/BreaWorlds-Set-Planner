import json

with open(r'c:\BreaWorlds Set Planner\worldplanner\blocks_manifest.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

found = [b for b in data['blocks'] if 'checkpoint' in b.get('id', '').lower()]

with open('checkpoint_search.json', 'w', encoding='utf-8') as f:
    json.dump(found, f, indent=2)
