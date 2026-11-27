/**
 * Etiquetas de perfil (activo / inactivo) y qué etiquetas se muestran.
 * Los perfiles inactivos se ocultan por defecto de la barra lateral y de la vista de carpetas.
 */

import { createContext } from 'react';
import type { BrowserProfile, ProfileLabel } from '@xpm/core';

export const PROFILE_LABELS: Array<{ id: ProfileLabel; name: string }> = [
  { id: 'active', name: 'Active' },
  { id: 'inactive', name: 'Inactive' },
];

/** Carita que representa cada etiqueta */
export const LABEL_FACE: Record<ProfileLabel, string> = { active: ':)', inactive: ':(' };

export const DEFAULT_VISIBLE_LABELS: ProfileLabel[] = ['active'];

/** Un perfil sin etiqueta cuenta como activo. */
export const labelOf = (profile: Pick<BrowserProfile, 'label'>): ProfileLabel => profile.label ?? 'active';

export const isProfileVisible = (profile: Pick<BrowserProfile, 'label'>, visible: ReadonlySet<ProfileLabel>): boolean =>
  visible.has(labelOf(profile));

export interface ProfileLabelFilter {
  visibleLabels: ReadonlySet<ProfileLabel>;
  setVisibleLabels: (labels: ReadonlySet<ProfileLabel>) => void;
}

export const ProfileLabelFilterContext = createContext<ProfileLabelFilter>({
  visibleLabels: new Set(DEFAULT_VISIBLE_LABELS),
  setVisibleLabels: () => {},
});
