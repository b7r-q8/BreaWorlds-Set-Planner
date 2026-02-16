import json

with open(r'c:\BreaWorlds Set Planner\worldplanner\blocks_manifest.json', 'r', encoding='utf-8') as f:
    lines = f.readlines()

targets = ['spr_fg_xmas_dj_box', 'spr_fg_gem_machine', 'spr_fg_checkpoint', 'spr_fg_candle_checkpoint', 'spr_fg_icecream_lock']

for i, line in enumerate(lines):
    for t in targets:
        if f'"{t}"' in line:
            print(f"L{i+1}: {line.strip()}")
            # print the next few lines to see frameCount
            for j in range(1, 10):
                if i+j < len(lines):
                    l = lines[i+j].strip()
                    print(f"  L{i+j+1}: {l}")
                    if l.startswith('}'): break
