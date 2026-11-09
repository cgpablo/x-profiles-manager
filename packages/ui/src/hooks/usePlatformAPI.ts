/**
 * Hooks para acceder a la API de la plataforma.
 */

import { getPlatformAPI } from '../platform';

export const usePlatformAPI = () => getPlatformAPI();

/** Qué puede hacer la plataforma actual (la UI oculta lo que no aplica). */
export const useCapabilities = () => getPlatformAPI().capabilities;
