import codecs
path = r'c:\BreaWorlds Set Planner\index.html'

with codecs.open(path, 'r', 'utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if '<!-- SETTINGS POPUP -->' in line:
        start = i
    if start != -1 and 'Reset and Close</button>' in line:
        end = i + 3  # Includes the </div> for the popup
        break

new_html = """    <!-- SETTINGS POPUP -->
    <div id="wp-settings-popup" class="wp-popup hidden" style="width: 450px; max-width: 90vw; z-index: 10001; text-align: left;">
      <div class="wp-popup-header" style="background: rgba(168, 218, 220, 0.05); padding: 15px 20px; border-bottom: 1px solid rgba(168, 218, 220, 0.1);">
        <h3 style="margin: 0; font-size: 18px; color: #a8dadc;">Hotkeys & Settings</h3>
        <button class="wp-popup-close" onclick="toggleWPPopup('wp-settings-popup')">&times;</button>
      </div>
      <div class="wp-settings-content" style="padding: 20px; overflow-y: auto; max-height: 60vh;">
        
        <div class="wp-settings-section">
          <h4 style="margin: 0 0 4px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #a8dadc;">Tool Hotkeys</h4>
          <p style="margin: 0 0 16px; font-size: 12px; color: rgba(241, 250, 238, 0.5);">Click a hotkey slot below to assign a key. Press <strong style="color: #e63946;">Escape</strong> to cancel or clear.</p>
          <div id="wp-hotkeys-list" class="wp-hotkeys-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <!-- Dynamic hotkey list -->
          </div>
        </div>

        <div class="wp-settings-section" style="margin-top: 30px;">
          <h4 style="margin: 0 0 4px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #a8dadc;">Inventory Hotkeys</h4>
          <p style="margin: 0 0 16px; font-size: 12px; color: rgba(241, 250, 238, 0.5);">Map keys to the 10 recent blocks in your World Planner inventory.</p>
          <div id="wp-inventory-hotkeys-list" class="wp-hotkeys-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <!-- Dynamic hotkey list -->
          </div>
        </div>

      </div>
      <div class="wp-popup-footer" style="padding: 15px 20px; display: flex; gap: 12px; border-top: 1px solid rgba(168, 218, 220, 0.1); background: rgba(168, 218, 220, 0.02);">
        <button class="wp-confirm-btn" onclick="saveWPHotkeys()" style="flex: 1; height: 38px; background: #a8dadc; color: #1d3557; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Save Settings</button>
        <button class="wp-reset-btn" onclick="resetWPHotkeys()" style="flex: 1; height: 38px; background: rgba(168, 218, 220, 0.1); color: rgba(168, 218, 220, 0.8); border: 1px solid rgba(168, 218, 220, 0.2); border-radius: 8px; font-weight: bold; cursor: pointer;">Reset to Defaults</button>
      </div>
    </div>\n"""

if start != -1 and end != -1:
    lines[start:end] = [new_html]
    with codecs.open(path, 'w', 'utf-8') as f:
        f.writelines(lines)
    print("Replaced!")
else:
    print("Not found", start, end)
