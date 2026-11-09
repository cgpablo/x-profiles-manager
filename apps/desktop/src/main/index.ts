/**
 * Main Process - Electron app entry point
 */

import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import isDev from 'electron-is-dev';
import { setupIpcHandlers } from './ipc';
import { chromeLauncher } from './launcher';

// Handle Squirrel events on Windows
if (process.platform === 'win32') {
  const squirrelStartup = require('electron-squirrel-startup');
  if (squirrelStartup) {
    app.quit();
  }
}

// Must be called BEFORE app.ready.
// Prevents Chromium from setting navigator.webdriver = true (the main bot-detection tell).
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
// Disable caBLE (cloud-assisted BLE for FIDO/passkeys) — not needed and causes macOS errors
// when the app is launched from terminal instead of Finder.
app.commandLine.appendSwitch('disable-features', 'WebAuthenticationCable');

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../renderer/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Intercept window.open / target="_blank" links — open in the OS default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && url !== 'about:blank' && !url.startsWith('devtools://')) {
      shell.openExternal(url).catch(console.error);
    }
    return { action: 'deny' };
  });

  // Also intercept top-level navigation away from the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url).catch(console.error);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Define ALL event listeners BEFORE checking single instance lock
app.on('ready', () => {
  setupIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  // Close all Chrome profiles before quitting
  chromeLauncher.closeAllProfiles();
  
  // On Windows, give time for taskkill to complete
  if (process.platform === 'win32') {
    setTimeout(() => {
      app.quit();
    }, 1000);
  } else if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Safety check: ensure all Chrome profiles are closed
  chromeLauncher.closeAllProfiles();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Prevent multiple app instances - AFTER all listeners are defined
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
