import type { ProfileDataPort } from '@xpm/core';

/**
 * En Android no hay directorio de datos por perfil: la identidad del perfil en GeckoView es su `id`
 * (`contextId`), y GeckoView gestiona el almacenamiento. Todo es no-op.
 */
export class NoProfileData implements ProfileDataPort {
  dataDirFor(): string {
    return '';
  }
  exists(): boolean {
    return false;
  }
  ensure(): void {}
  rename(): void {}
  remove(): void {}
}
