#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PKG_PATH = path.join(__dirname, '..', 'package.json');
const SETTINGS_PATH = path.join(__dirname, '..', 'src', 'renderer', 'components', 'Settings.tsx');

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const current = pkg.version;
const [major, minor, fix] = current.split('.').map(Number);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`\nCurrent version: ${current}`);
console.log('Bump type:');
console.log('  [1] major  →  ' + (major + 1) + '.0.0');
console.log('  [2] minor  →  ' + major + '.' + (minor + 1) + '.0');
console.log('  [3] fix    →  ' + major + '.' + minor + '.' + (fix + 1));
console.log('  [q] quit');

rl.question('\nChoice: ', (answer) => {
  rl.close();

  let next;
  if (answer === '1' || answer.toLowerCase() === 'major') {
    next = `${major + 1}.0.0`;
  } else if (answer === '2' || answer.toLowerCase() === 'minor') {
    next = `${major}.${minor + 1}.0`;
  } else if (answer === '3' || answer.toLowerCase() === 'fix') {
    next = `${major}.${minor}.${fix + 1}`;
  } else {
    console.log('Aborted.');
    process.exit(0);
  }

  // Update package.json
  pkg.version = next;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');

  // Update Settings.tsx
  let settings = fs.readFileSync(SETTINGS_PATH, 'utf8');
  settings = settings.replace(current, next);
  fs.writeFileSync(SETTINGS_PATH, settings);

  console.log(`\nVersion bumped: ${current} → ${next}`);
});
