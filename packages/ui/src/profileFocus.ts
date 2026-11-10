/**
 * Pide a la app mostrar un único perfil, como si se hubiera buscado por él. Lo usa la barra lateral, que está
 * repetida en varias pantallas: un evento evita pasar una propiedad por todas ellas.
 */
const EVENT = 'xpm:show-profile';

export function showProfileOnly(profileId: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: profileId }));
}

export function onShowProfileOnly(handler: (profileId: string) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<string>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
