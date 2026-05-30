$file = "c:\BreaWorlds Set Planner\index.html"
$c = [System.IO.File]::ReadAllText($file)

# Normalize to LF for matching
$cn = $c.Replace("`r`n", "`n")

$oldBlock = @"
    <!-- SETTINGS POPUP -->
    <div id="wp-settings-popup" class="wp-popup hidden" style="width: 450px; max-width: 90vw; z-index: 10001;">
      <div class="wp-popup-header" style="background: rgba(168, 218, 220, 0.05); padding: 15px 20px; border-bottom: 1px solid rgba(168, 218, 220, 0.1);">
        <h3 style="margin: 0; font-size: 18px; color: #a8dadc;">Hotkeys &amp; Settings</h3>
        <button class="wp-popup-close" onclick="toggleWPPopup('wp-settings-popup')">&times;</button>
      </div>
      <div class="wp-settings-content" style="padding: 20px; overflow-y: auto; max-height: 60vh;">
        <div class="wp-settings-section">
          <h4 style="margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: rgba(168, 218, 220, 0.6);">Tool Hotkeys</h4>
          <div id="wp-hotkeys-list" class="wp-hotkeys-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- Dynamic hotkey list -->
          </div>
        </div>
        <div class="wp-settings-section" style="margin-top: 25px;">
          <h4 style="margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: rgba(168, 218, 220, 0.6);">Inventory Hotkeys</h4>
          <div id="wp-inventory-hotkeys-list" class="wp-hotkeys-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- Dynamic hotkey list -->
          </div>
        </div>
      </div>
      <div class="wp-popup-footer" style="padding: 15px 20px; display: flex; gap: 12px; border-top: 1px solid rgba(168, 218, 220, 0.1); background: rgba(168, 218, 220, 0.02);">
        <button class="wp-confirm-btn" onclick="saveWPHotkeys()" style="flex: 1; height: 38px; background: #a8dadc; color: #1d3557; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Confirm and Close</button>
        <button class="wp-reset-btn" onclick="resetWPHotkeys()" style="flex: 1; height: 38px; background: rgba(168, 218, 220, 0.1); color: #a8dadc; border: 1px solid rgba(168, 218, 220, 0.2); border-radius: 8px; font-weight: bold; cursor: pointer;">Reset and Close</button>
      </div>
    </div>
"@

$newBlock = @"
    <!-- SETTINGS POPUP -->
    <div id="wp-settings-popup" class="wp-popup hidden" style="width: 480px; max-width: 92vw; z-index: 10001;">
      <div class="wp-settings-header">
        <h3>Hotkey Settings</h3>
        <button class="wp-popup-close" onclick="toggleWPPopup('wp-settings-popup')">&times;</button>
      </div>
      <div class="wp-settings-body">
        <div class="wp-settings-section">
          <div class="wp-section-title">Tool Hotkeys</div>
          <div class="wp-section-subtitle">Click a key slot to assign, press Escape to cancel</div>
          <div id="wp-hotkeys-list" class="wp-hotkeys-grid">
            <!-- Dynamic hotkey list -->
          </div>
        </div>
        <div class="wp-settings-divider"></div>
        <div class="wp-settings-section">
          <div class="wp-section-title">Inventory Hotkeys</div>
          <div class="wp-section-subtitle">Quickly switch to your recent blocks</div>
          <div id="wp-inventory-hotkeys-list" class="wp-hotkeys-grid">
            <!-- Dynamic hotkey list -->
          </div>
        </div>
      </div>
      <div class="wp-settings-footer">
        <button class="wp-settings-save-btn" onclick="saveWPHotkeys()">Save Changes</button>
        <button class="wp-settings-reset-btn" onclick="resetWPHotkeys()">Reset All</button>
      </div>
    </div>
"@

# Normalize both to LF for matching
$oldNorm = $oldBlock.Replace("`r`n", "`n")
$newNorm = $newBlock.Replace("`r`n", "`n")

if ($cn.Contains($oldNorm)) {
    $cn = $cn.Replace($oldNorm, $newNorm)
    # Convert back to CRLF
    $result = $cn.Replace("`n", "`r`n")
    [System.IO.File]::WriteAllText($file, $result)
    Write-Host "SUCCESS: Settings popup replaced"
} else {
    Write-Host "ERROR: Old block not found after normalization"
    $idx = $cn.IndexOf('<!-- SETTINGS POPUP -->')
    if ($idx -ge 0) {
        $snippet = $cn.Substring($idx, [Math]::Min(300, $cn.Length - $idx))
        Write-Host "Actual content:"
        Write-Host $snippet
    }
}
