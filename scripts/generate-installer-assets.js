/**
 * Generate installer assets (sidebar BMP + splash BMP) for NSIS and Portable builds
 */
const fs = require('fs');
const path = require('path');

// BMP file creation (24-bit, bottom-up)
function createBMP(width, height, pixelData) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize);

  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const offset = rowOffset + x * 3;
      buf[offset] = pixelData[idx + 2];     // B
      buf[offset + 1] = pixelData[idx + 1]; // G
      buf[offset + 2] = pixelData[idx];     // R
    }
  }
  return buf;
}

function setPixel(pixels, width, x, y, r, g, b) {
  if (x < 0 || y < 0) return;
  const idx = (y * width + x) * 3;
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
}

function drawRect(pixels, width, height, x0, y0, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (x0 + dx < width && y0 + dy < height) {
        setPixel(pixels, width, x0 + dx, y0 + dy, r, g, b);
      }
    }
  }
}

// Fill with dark gradient
function fillDarkGradient(pixels, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = y / height;
      const grad = Math.sin(t * Math.PI * 0.5);
      let r = Math.round(8 + 8 * grad);
      let g = Math.round(8 + 8 * grad);
      let b = Math.round(12 + 10 * grad);
      // Subtle noise
      const noise = ((x * 7 + y * 13) % 5) - 2;
      r = Math.max(0, Math.min(255, r + noise));
      g = Math.max(0, Math.min(255, g + noise));
      b = Math.max(0, Math.min(255, b + noise));
      setPixel(pixels, width, x, y, r, g, b);
    }
  }
}

const outDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ---- 1. NSIS Sidebar (164x314) ----
{
  const W = 164, H = 314;
  const pixels = Buffer.alloc(W * H * 3);
  fillDarkGradient(pixels, W, H);

  // Left accent bar
  for (let y = 0; y < H; y++) {
    for (let x = 0; x <= 3; x++) {
      const at = Math.sin((y / H) * Math.PI);
      setPixel(pixels, W, x, y,
        Math.round(80 + 60 * at),
        Math.round(40 + 30 * at),
        Math.round(160 + 60 * at));
    }
  }

  // "VI" text
  const lr = 130, lg = 80, lb = 220, ly = 145;
  drawRect(pixels, W, H, 40, ly, 3, 10, lr, lg, lb);
  drawRect(pixels, W, H, 43, ly + 10, 3, 5, lr, lg, lb);
  drawRect(pixels, W, H, 46, ly + 15, 3, 3, lr, lg, lb);
  drawRect(pixels, W, H, 49, ly + 15, 3, 3, lr, lg, lb);
  drawRect(pixels, W, H, 52, ly + 10, 3, 5, lr, lg, lb);
  drawRect(pixels, W, H, 55, ly, 3, 10, lr, lg, lb);
  drawRect(pixels, W, H, 65, ly, 3, 18, lr, lg, lb);

  const bmp = createBMP(W, H, pixels);
  fs.writeFileSync(path.join(outDir, 'installerSidebar.bmp'), bmp);
  console.log('[assets] installerSidebar.bmp created (' + W + 'x' + H + ')');
}

// ---- 2. Portable Splash (480x320) ----
{
  const W = 480, H = 320;
  const pixels = Buffer.alloc(W * H * 3);
  fillDarkGradient(pixels, W, H);

  // Center accent glow
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = W / 2, cy = H / 2 - 20;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const maxDist = 160;
      if (dist < maxDist) {
        const t = 1 - dist / maxDist;
        const glow = t * t * 0.12;
        const idx = (y * W + x) * 3;
        pixels[idx] = Math.min(255, pixels[idx] + Math.round(124 * glow));
        pixels[idx + 1] = Math.min(255, pixels[idx + 1] + Math.round(58 * glow));
        pixels[idx + 2] = Math.min(255, pixels[idx + 2] + Math.round(237 * glow));
      }
    }
  }

  // Draw "VI" in large centered block letters
  const lr = 124, lg = 58, lb = 237;
  const blockW = 4, baseX = 190, baseY = 120;

  // V
  for (let i = 0; i < 14; i++) drawRect(pixels, W, H, baseX + i * 0, baseY + i, blockW, 1, lr, lg, lb);
  drawRect(pixels, W, H, baseX, baseY, blockW, 20, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 4, baseY + 20, blockW, 8, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 8, baseY + 28, blockW, 6, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 12, baseY + 34, blockW + 2, 4, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 18, baseY + 28, blockW, 6, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 22, baseY + 20, blockW, 8, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 26, baseY, blockW, 20, lr, lg, lb);

  // I
  drawRect(pixels, W, H, baseX + 40, baseY, blockW, 38, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 36, baseY, 12, blockW, lr, lg, lb);
  drawRect(pixels, W, H, baseX + 36, baseY + 34, 12, blockW, lr, lg, lb);

  // Loading bar at bottom
  const barY = 230, barH = 4, barX = 140, barW = 200;
  // Bar background
  drawRect(pixels, W, H, barX, barY, barW, barH, 30, 30, 40);
  // Bar fill (animated look - show 40%)
  const fillW = Math.round(barW * 0.4);
  for (let x = barX; x < barX + fillW; x++) {
    const t = (x - barX) / fillW;
    const r = Math.round(91 + 33 * t);
    const g = Math.round(33 + 25 * t);
    const b = Math.round(182 + 55 * t);
    for (let dy = 0; dy < barH; dy++) {
      setPixel(pixels, W, x, barY + dy, r, g, b);
    }
  }

  // "Loading..." text area hint - small dots
  const dotY = 250;
  for (let i = 0; i < 3; i++) {
    drawRect(pixels, W, H, 232 + i * 8, dotY, 3, 3, 80, 80, 100);
  }

  // Bottom text: "VisualIllusion" centered
  // Just brightness pattern as text placeholder
  const textY = 270;
  for (let x = 170; x < 310; x++) {
    const t = Math.sin(((x - 170) / 140) * Math.PI);
    const alpha = t * 0.3;
    setPixel(pixels, W, x, textY, Math.round(60 * alpha + 15), Math.round(60 * alpha + 15), Math.round(80 * alpha + 20));
    setPixel(pixels, W, x, textY + 1, Math.round(40 * alpha + 15), Math.round(40 * alpha + 15), Math.round(60 * alpha + 20));
  }

  const bmp = createBMP(W, H, pixels);
  fs.writeFileSync(path.join(outDir, 'installerSplash.bmp'), bmp);
  console.log('[assets] installerSplash.bmp created (' + W + 'x' + H + ')');
}

console.log('[assets] All installer assets generated.');

