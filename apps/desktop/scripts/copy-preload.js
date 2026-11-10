#!/usr/bin/env node
/**
 * Cross-platform script to copy webview-preload.js
 * Works on Windows, macOS, and Linux
 */

const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'src/main/webview-preload.js');
const destination = path.join(__dirname, '..', 'dist/main/webview-preload.js');

try {
  const data = fs.readFileSync(source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, data);
  console.log(`✓ Copied ${source} to ${destination}`);
} catch (error) {
  console.error('Error copying preload file:', error);
  process.exit(1);
}
