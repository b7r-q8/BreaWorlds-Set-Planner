import codecs
import re

path = r'c:\BreaWorlds Set Planner\script.js'

with codecs.open(path, 'r', 'utf-8') as f:
    text = f.read()

valid_tools = [
    'pencil', 'eraser', 'move', 'wrench', 'select', 'fill', 'undo', 'redo',
    'reset', 'clear', 'grid', 'count', 'reposition', 'save', 'blocks', 'themes'
]
tools_init = ', '.join([f'{t}: null' for t in valid_tools])
inv_init = ', '.join([f'"slot-{i}": null' for i in range(10)])

new_reset = f'''wpHotkeys = {{
      tools: {{ {tools_init} }},
      inventory: {{ {inv_init} }}
    }};'''

text = re.sub(r'wpHotkeys = \{.*?tools: \{.*?\},.*?inventory: \{.*?\}\s*\};', new_reset, text, flags=re.DOTALL)

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(text)

print('Fixed resetWPHotkeys in script.js')
