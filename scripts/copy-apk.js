// Copia el APK de release (que Gradle deja en su ruta estándar) a apps/mobile/release, como hace el desktop con su release/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'apps/mobile/android/app/build/outputs/apk/release/app-release.apk');
const { version } = require(path.join(root, 'apps/desktop/package.json'));
const destDir = path.join(root, 'apps/mobile/release');
const dest = path.join(destDir, `X Profiles Manager-${version}.apk`);

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`APK: ${path.relative(root, dest)}`);
