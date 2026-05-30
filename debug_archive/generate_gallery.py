import os
from glob import glob

base_dir = r'c:\BreaWorlds Set Planner\worldplanner\new'
html_path = r'c:\BreaWorlds Set Planner\sprites_gallery.html'

html = '''
<!DOCTYPE html>
<html>
<head>
<title>BreaWorlds Sprites Gallery</title>
<style>
  body { font-family: sans-serif; background: #222; color: #fff; margin: 20px; }
  .control-panel { position: sticky; top: 0; background: #333; padding: 15px; z-index: 100; border-bottom: 2px solid #555; }
  input[type="text"] { padding: 8px; width: 300px; font-size: 16px; margin-right: 10px; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
  .card { border: 1px solid #444; padding: 5px; text-align: center; width: 140px; word-wrap: break-word; background: #333; border-radius: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  img { max-width: 80px; max-height: 80px; image-rendering: pixelated; margin-bottom: 10px; }
  .name { font-size: 11px; }
</style>
<script>
function filterSprites() {
    let input = document.getElementById('search').value.toLowerCase();
    let cards = document.getElementsByClassName('card');
    for (let i = 0; i < cards.length; i++) {
        let name = cards[i].getAttribute('data-name').toLowerCase();
        if (name.includes(input)) {
            cards[i].style.display = 'flex';
        } else {
            cards[i].style.display = 'none';
        }
    }
}
</script>
</head>
<body>

<div class="control-panel">
  <h1>BreaWorlds Sprites Gallery</h1>
  <p>Use the search to find the token or NPC you are looking for.</p>
  <input type="text" id="search" onkeyup="filterSprites()" placeholder="Search spr_ name (e.g. token, npc, mine)">
</div>

<div class="grid">
'''

dirs = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
dirs.sort()

for d in dirs:
    pngs = glob(os.path.join(base_dir, d, '*.png'))
    if pngs:
        pngs.sort()
        # Get first png frame
        rel_path = 'worldplanner/new/' + d + '/' + os.path.basename(pngs[0])
        html += f'<div class="card" data-name="{d}"><img src="{rel_path}" loading="lazy"><span class="name">{d}</span></div>\n'

html += '''
</div>
</body>
</html>
'''

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print('Gallery successfully generated at', html_path)
