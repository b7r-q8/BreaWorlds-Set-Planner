import codecs

path = r'c:\BreaWorlds Set Planner\index.html'
with codecs.open(path, 'r', 'utf-8') as f:
    lines = f.readlines()

to_move = lines[199:207]
del lines[199:207]

insert_idx = -1
for i, line in enumerate(lines):
    if '<input type="file" id="wp-image-import"' in line:
        insert_idx = i + 2  # After the input tag (which spans 2 lines)
        break

if insert_idx != -1:
    lines[insert_idx:insert_idx] = to_move + ['\n']
    with codecs.open(path, 'w', 'utf-8') as f:
        f.writelines(lines)
    print('Moved Settings!')
else:
    print('Failed to find insert location')
