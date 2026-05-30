const fs = require('fs');
const path = require('path');

const wwwDir = path.join(__dirname, 'www');

// Clean www directory
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir);

const foldersToCopy = [
  'backgrounds', 'badges', 'capes', 'cars', 'display', 'downloadset',
  'eyes', 'faces', 'featured', 'floaties', 'fonts', 'hair', 'hands',
  'hats', 'levels', 'lunar', 'pants', 'pets', 'platforms', 'scarfs',
  'specials', 'wings', 'worldplanner', 'libs', 'roadmap', 'shirts',
  'shoes', 'rockerbody', 'js', 'assets'
];

const filesToCopy = [
  'index.html', 'style.css', 'thumbnail.js', 'multiplayer.js',
  'community.css', 'community.html', 'community.js', 'tutorial.css',
  'firebase-config.js', 'new_items.json', 'robots.txt',
  'arm.png', 'base.png', 'baseskate.png', 'body.png', 'facemech.png',
  'feet.png', 'head.png', 'leg.png', 'legskate.png', 'pupil.png',
  'tm_consumables_manifest.js', 'manifest.json', 'sw.js'
];

// Copy files
filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(wwwDir, file));
  }
});

// Copy folders recursively
foldersToCopy.forEach(folder => {
  const src = path.join(__dirname, folder);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(wwwDir, folder), { recursive: true });
  }
});

console.log('Build completed: Web assets collected in www/');
