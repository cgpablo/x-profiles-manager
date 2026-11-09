/**
 * Botón Atrás de Android: la app nativa llama a `window.__xpmBack()`. Devuelve `true` si cerró algo
 * (menú contextual o modal); si devuelve `false`, la app nativa minimiza.
 */
const CLOSE_LABEL = /^(cancel|close|no|back|×|x)$/i;

export function installBackButton(): void {
  (window as unknown as { __xpmBack: () => boolean }).__xpmBack = () => {
    if (document.querySelector('.profile-context-menu')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return true;
    }
    const overlays = document.querySelectorAll<HTMLElement>(
      '.modal-overlay, .char-info-overlay, .color-modal-overlay, .delete-confirm-overlay'
    );
    const top = overlays[overlays.length - 1];
    if (!top) return false;
    const closer =
      Array.from(top.querySelectorAll<HTMLElement>('button')).find(
        (b) =>
          CLOSE_LABEL.test((b.textContent || '').trim()) ||
          /close|cancel/i.test(b.className) ||
          /close|cancel/i.test(b.getAttribute('aria-label') || '')
      ) ?? top;
    closer.click();
    return true;
  };
}
