const fs = require('fs');
const file = 'c:\\BreaWorlds Set Planner\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Find lines 660-684 content and replace it
const lines = c.split('\n');
let startIdx = -1;
let endIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<!-- SETTINGS POPUP -->') && lines[i+1] && lines[i+1].includes('wp-settings-popup')) {
    startIdx = i;
  }
  if (startIdx >= 0 && lines[i].includes('Reset and Close</button>') || lines[i].includes('Reset and Close&lt;/button&gt;')) {
    // Next line after this should be </div> then </div>
    // Find the closing </div> for the popup
    for (let j = i + 1; j < lines.length && j < i + 5; j++) {
      if (lines[j].trim() === '</div>' || lines[j].trim() === '</div>\r') {
        endIdx = j;
        break;
      }
    }
    break;
  }
}

console.log('Start line:', startIdx, 'End line:', endIdx);
if (startIdx >= 0 && endIdx >= 0) {
  console.log('First line:', JSON.stringify(lines[startIdx]));
  console.log('Last line:', JSON.stringify(lines[endIdx]));
}
