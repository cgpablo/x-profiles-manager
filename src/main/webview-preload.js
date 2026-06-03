/**
 * Webview Preload Script
 * Runs inside the webview before any page scripts.
 * Comprehensive Electron fingerprint removal so X.com doesn't detect Electron.
 */
'use strict';

// ── 1. navigator.webdriver ─────────────────────────────────────────────────
// Must be removed from the prototype so all accesses return undefined.
try {
  delete navigator.__proto__.webdriver;
} catch (e) {}
try {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });
} catch (e) {}

// ── 2. Remove Electron / Node globals ─────────────────────────────────────
const _remove = (obj, key) => {
  try { delete obj[key]; } catch (e) {}
};

_remove(window, 'require');
_remove(window, 'module');
_remove(window, 'exports');
_remove(window, '__electron_preload');
_remove(window, 'electron');

// Remove process or strip electron version info
try {
  if (window.process && window.process.versions && window.process.versions.electron) {
    _remove(window, 'process');
  }
} catch (e) {}

// ── 3. window.chrome — must look like a real Chrome extension runtime ──────
try {
  if (!window.chrome || !window.chrome.runtime) {
    const chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      },
      runtime: {
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        connect: () => {},
        sendMessage: () => {},
      },
      csi: () => {},
      loadTimes: () => ({
        requestTime: Date.now() / 1000 - Math.random(),
        startLoadTime: Date.now() / 1000 - Math.random() * 0.5,
        commitLoadTime: Date.now() / 1000 - Math.random() * 0.3,
        finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 0.1,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: 0,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
        npnNegotiatedProtocol: 'http/1.1',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'http/1.1',
      }),
    };
    try {
      Object.defineProperty(window, 'chrome', { value: chrome, writable: false, configurable: false });
    } catch (e) {
      window.chrome = chrome;
    }
  }
} catch (e) {}

// ── 4. navigator.plugins — Electron has none; spoof a minimal list ─────────
try {
  if (navigator.plugins.length === 0) {
    const fakePlugin = { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 0 };
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [fakePlugin];
        arr.item = (i) => arr[i];
        arr.namedItem = (name) => arr.find(p => p.name === name);
        arr.refresh = () => {};
        return arr;
      },
      configurable: true,
    });
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const arr = [];
        arr.item = () => null;
        arr.namedItem = () => null;
        return arr;
      },
      configurable: true,
    });
  }
} catch (e) {}

// ── 5. navigator.languages ─────────────────────────────────────────────────
try {
  if (!navigator.languages || navigator.languages.length === 0) {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true,
    });
  }
} catch (e) {}

// ── 6. Permissions API — make it behave like a real browser ───────────────
try {
  const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
} catch (e) {}

// ── 7. WebGL vendor/renderer — Electron may expose llvmpipe or SwiftShader ─
try {
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return 'Intel Inc.';         // UNMASKED_VENDOR_WEBGL
    if (parameter === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
    return getParameter.call(this, parameter);
  };
} catch (e) {}
