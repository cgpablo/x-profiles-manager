import type { PlatformAPI } from '@xpm/core';

declare global {
  interface Window {
    platformAPI: PlatformAPI;
  }
}
