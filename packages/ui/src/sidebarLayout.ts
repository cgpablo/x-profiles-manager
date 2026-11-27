/**
 * Elementos de la barra lateral y su orden. Lo que va antes de `folders` se pinta encima del árbol de carpetas
 * y lo que va después, abajo (pegado al final).
 */

export type SidebarItemId =
  | 'dashboard'
  | 'folders'
  | 'post-helper'
  | 'password-manager'
  | 'mail-manager'
  | 'character-hub'
  | 'freedcamp'
  | 'settings';

export interface SidebarItemInfo {
  id: SidebarItemId;
  label: string;
  /** false = siempre visible (sin casilla) */
  hideable: boolean;
}

export const SIDEBAR_ITEMS: SidebarItemInfo[] = [
  { id: 'dashboard', label: 'Dashboard', hideable: true },
  { id: 'folders', label: 'Folders', hideable: false },
  { id: 'post-helper', label: 'Post Helper', hideable: true },
  { id: 'password-manager', label: 'Password Manager', hideable: true },
  { id: 'mail-manager', label: 'Mail Manager', hideable: true },
  { id: 'character-hub', label: 'Character Hub', hideable: true },
  { id: 'freedcamp', label: 'Freedcamp', hideable: true },
  { id: 'settings', label: 'Settings', hideable: false },
];

export const DEFAULT_SIDEBAR_ORDER: SidebarItemId[] = SIDEBAR_ITEMS.map((item) => item.id);

/** Descarta ids desconocidos o repetidos y añade al final los que falten (p. ej. un elemento nuevo en una versión posterior). */
export function normalizeSidebarOrder(saved?: string[] | null): SidebarItemId[] {
  const known = new Set<string>(DEFAULT_SIDEBAR_ORDER);
  const seen = new Set<string>();
  const order: SidebarItemId[] = [];
  for (const id of saved ?? []) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id as SidebarItemId);
    }
  }
  for (const id of DEFAULT_SIDEBAR_ORDER) if (!seen.has(id)) order.push(id);
  return order;
}
