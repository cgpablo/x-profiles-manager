import { createContext } from 'react';
import { DEFAULT_SIDEBAR_ORDER, type SidebarItemId } from './sidebarLayout';

/** Navegación disponible para cualquier componente sin pasarla por props (p. ej. el Sidebar). */
export interface NavigationContextValue {
  goToPostHelper: () => void;
}

export const NavigationContext = createContext<NavigationContextValue>({ goToPostHelper: () => {} });

/** Orden guardado de la barra lateral y visibilidad de Post Helper (el resto de visibilidades llegan por props). */
export interface SidebarLayoutContextValue {
  order: SidebarItemId[];
  showPostHelper: boolean;
}

export const SidebarLayoutContext = createContext<SidebarLayoutContextValue>({
  order: DEFAULT_SIDEBAR_ORDER,
  showPostHelper: true,
});
