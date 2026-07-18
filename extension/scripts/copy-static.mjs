import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');
const distDir = join(__dirname, '..', 'dist');
const iconsDir = join(__dirname, '..', 'icons');

// Copy popup.html
if (existsSync(join(srcDir, 'popup.html'))) {
  copyFileSync(join(srcDir, 'popup.html'), join(distDir, 'popup.html'));
  console.log('✓ Copied popup.html to dist/');
}

// Copy icons
if (existsSync(iconsDir)) {
  mkdirSync(join(distDir, 'icons'), { recursive: true });
  for (const file of readdirSync(iconsDir)) {
    copyFileSync(join(iconsDir, file), join(distDir, 'icons', file));
  }
  console.log('✓ Copied icons to dist/icons/');
}
