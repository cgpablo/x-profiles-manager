/**
 * Global type definitions: PlatformAPI on window and Electron-specific DOM elements.
 */

import type { PlatformAPI } from '../types/platform';

// ──────────────────────────────────────────────────────────────────────────────
// <webview> JSX element (Electron-specific)
// ──────────────────────────────────────────────────────────────────────────────

interface WebviewHTMLAttributes extends React.HTMLAttributes<HTMLElement> {
  src?: string;
  partition?: string;
  allowpopups?: string;
  preload?: string;
  httpreferrer?: string;
  useragent?: string;
  disablewebsecurity?: string;
  nodeintegration?: string;
  nodeintegrationinsubframes?: string;
  plugins?: string;
  webpreferences?: string;
  disableblinkfeatures?: string;
  enableblinkfeatures?: string;
}

declare global {
  interface Window {
    platformAPI: PlatformAPI;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: WebviewHTMLAttributes;
    }
  }
}
