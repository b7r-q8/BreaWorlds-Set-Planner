import json

with open(r'c:\BreaWorlds Set Planner\worldplanner\blocks_manifest.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

targets = ['checkpoint_block']
found = []

for b in data['blocks']:
    if any(t in b.get('id', '').lower() for t in targets):
        found.append(b)

print(json.dumps(found, indent=2))
