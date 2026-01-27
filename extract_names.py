
import re

with open("index.html", "r", encoding="utf-8") as f:
    content = f.read()

# Regex to find text after <img ... class="item-icon">
matches = re.findall(r'<img[^>]*class="item-icon"[^>]*>\s*(.*?)\s*</li>', content, re.IGNORECASE | re.DOTALL)

print(f"Found {len(matches)} items.")
for m in matches:
    print(m.strip())
