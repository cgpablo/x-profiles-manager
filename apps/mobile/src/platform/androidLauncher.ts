import type { BrowserLauncher, BrowserProfile, ProcessInfo } from '@xpm/core';
import { ProfileBrowser } from './profileBrowser';

/**
 * Lanzador de Android: delega en el plugin nativo (GeckoView). Implementa `BrowserLauncher`.
 *
 * El contrato pide `isActive` y `getActive` síncronos, pero hablar con el plugin es asíncrono. Se resuelve con una
 * caché de los perfiles abiertos, que el plugin mantiene al día con el evento `sessionsChanged`, y que se
 * refresca al volver a la pantalla del gestor (mientras el navegador está delante, el WebView está en pausa).
 */
export class AndroidLauncher implements BrowserLauncher {
  private active = new Set<string>();
  private meta = new Map<string, { name: string; color?: string }>();

  /** `exists` consulta la base de datos de perfiles: un perfil que no existe no se puede abrir (como en desktop). */
  constructor(private exists: (profileId: string) => boolean) {
    void ProfileBrowser.addListener('sessionsChanged', (event) => {
      this.active = new Set(event.profileIds);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.refresh();
    });
    void this.refresh();
  }

  /** Nombre y color de los perfiles, para la barra de perfiles abiertos del navegador. */
  loadProfiles(profiles: BrowserProfile[]): void {
    for (const profile of profiles) this.meta.set(profile.id, { name: profile.name, color: profile.color });
  }

  async refresh(): Promise<void> {
    try {
      this.active = new Set((await ProfileBrowser.getActive()).profileIds);
    } catch (error) {
      console.error('Could not refresh active profiles', error);
    }
  }

  private info(profileId: string) {
    const meta = this.meta.get(profileId);
    return { profileId, name: meta?.name, color: meta?.color };
  }

  async launch(profileId: string, url?: string): Promise<ProcessInfo | null> {
    if (!this.exists(profileId)) return null;
    const { startTime } = await ProfileBrowser.launch({ ...this.info(profileId), url });
    this.active.add(profileId);
    return { profileId, pid: 0, startTime };
  }

  close(profileId: string): boolean {
    const wasActive = this.active.delete(profileId);
    void ProfileBrowser.close({ profileId }).catch((error) => console.error('close failed', error));
    return wasActive;
  }

  isActive = (profileId: string) => this.active.has(profileId);
  getActive = () => [...this.active];

  async focusWindow(profileId: string): Promise<boolean> {
    return (await ProfileBrowser.focus({ profileId })).focused;
  }

  async autoLogin(profileId: string, username: string, password: string): Promise<boolean> {
    return (await ProfileBrowser.autoLogin({ ...this.info(profileId), username, password })).value;
  }

  async isLoggedIn(profileId: string): Promise<boolean> {
    return (await ProfileBrowser.isLoggedIn({ profileId })).value;
  }

  async isOnHomeUrl(profileId: string): Promise<boolean> {
    return (await ProfileBrowser.isOnHomeUrl({ profileId })).value;
  }

  async fillPinRecovery(profileId: string, pin: string | null): Promise<boolean> {
    return (await ProfileBrowser.fillPinRecovery({ ...this.info(profileId), pin: pin ?? undefined })).value;
  }

  async openChat(profileId: string): Promise<boolean> {
    if (!this.exists(profileId)) return false;
    return (await ProfileBrowser.openChat(this.info(profileId))).value;
  }

  profileSaved(profile: BrowserProfile): void {
    this.meta.set(profile.id, { name: profile.name, color: profile.color });
    void ProfileBrowser.updateProfile({ profileId: profile.id, name: profile.name, color: profile.color }).catch(() => {});
  }

  profileDeleted(profileId: string): void {
    this.meta.delete(profileId);
  }
}
