import codecs
import re

path = r'c:\BreaWorlds Set Planner\index.html'

with codecs.open(path, 'r', 'utf-8') as f:
    text = f.read()

# 1. Broad pattern for the old button
btn_pattern = re.compile(r'<div class="roadmap-btn selection-roadmap-btn" onclick="openRoadmapModal\(\)">\s*<div class="roadmap-icon-anim roadmap-icon-space"></div> Roadmap\s*</div>', re.DOTALL)
text = btn_pattern.sub('', text)

# 2. Insert the new button after <body>
new_btn = '<div class="roadmap-btn selection-roadmap-btn" id="main-roadmap-btn" onclick="openRoadmapModal()" style="display: none; position: fixed; top: 20px; right: 20px; z-index: 9999; margin: 0;"><div class="roadmap-icon-anim roadmap-icon-space"></div> Roadmap</div>'
text = text.replace('<body>', '<body>\n  ' + new_btn)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(text)

print('Moved Roadmap button!')
