import * as fs from 'fs';
import * as path from 'path';
import { AppSettings } from '@xpm/core';

/** Ajustes por defecto de desktop: detecta Chrome/Gecko e inicializa el directorio de perfiles. */
export function buildDesktopDefaultSettings(appDataDir: string): AppSettings {
  // Try to detect browser paths
  let chromePath = '';
  let geckoPath = '';

  if (process.platform === 'win32') {
    const chromePaths = [
      path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(
        process.env['ProgramFiles(x86)'] || '',
        'Google',
        'Chrome',
        'Application',
        'chrome.exe'
      ),
    ];
    chromePath = chromePaths.find((p) => fs.existsSync(p)) || '';

    const geckoPaths = [
      path.join(process.env.ProgramFiles || '', 'Mozilla Firefox', 'firefox.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Mozilla Firefox', 'firefox.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Zen Browser', 'zen.exe'),
    ];
    geckoPath = geckoPaths.find((p) => fs.existsSync(p)) || '';
  } else if (process.platform === 'darwin') {
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    chromePath = chromePaths.find((p) => fs.existsSync(p)) || '';

    const geckoPaths = [
      '/Applications/Firefox.app/Contents/MacOS/firefox',
      '/Applications/Zen Browser.app/Contents/MacOS/zen',
      '/Applications/LibreWolf.app/Contents/MacOS/librewolf',
    ];
    geckoPath = geckoPaths.find((p) => fs.existsSync(p)) || '';
  } else {
    chromePath = '/usr/bin/google-chrome'; // Linux default
    const geckoPaths = ['/usr/bin/firefox', '/usr/bin/zen-browser', '/usr/bin/librewolf'];
    geckoPath = geckoPaths.find((p) => fs.existsSync(p)) || '/usr/bin/firefox';
  }

  const profilesDir = path.join(appDataDir, '..', 'profiles');
  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }

  return {
    browserEngine: 'chromium',
    chromePath,
    geckoPath,
    profilesDir,
    windowLayout: 'floating',
    autoLaunchOnStartup: false,
    backupIcons: false,
  };
}
