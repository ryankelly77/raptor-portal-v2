const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, outputPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Orange background
  ctx.fillStyle = '#FF580F';
  ctx.fillRect(0, 0, size, size);

  // White text "RV"
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${size * 0.4}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RV', size / 2, size / 2);

  // Save to file
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath}`);
}

const publicDir = path.join(__dirname, '..', 'public');

generateIcon(192, path.join(publicDir, 'icon-192.png'));
generateIcon(512, path.join(publicDir, 'icon-512.png'));

console.log('Icons generated successfully!');
