/**
 * Hook personalizado para acceder a la API de Electron
 * Maneja casos donde window.electronAPI podría no estar disponible
 */

export const useElectronAPI = () => {
  if (typeof window === 'undefined') {
    throw new Error('useElectronAPI must be used in the browser');
  }

  if (!window.electronAPI) {
    throw new Error(
      'window.electronAPI is not available. Make sure Electron is loading the application correctly.'
    );
  }

  return window.electronAPI;
};
