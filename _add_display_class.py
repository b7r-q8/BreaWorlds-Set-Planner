import re

with open(r'c:\BreaWorlds Set Planner\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Add display-icon class to all roadmap-image-icon imgs that reference specials/display/
content = re.sub(
    r'(src="specials/display/[^"]+"\s+class="roadmap-image-icon")',
    r'\1 display-icon"',
    content
)
# Fix the double closing quote
content = content.replace('roadmap-image-icon" display-icon"', 'roadmap-image-icon display-icon"')

with open(r'c:\BreaWorlds Set Planner\index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done - added display-icon class to all specials/display PNGs')
