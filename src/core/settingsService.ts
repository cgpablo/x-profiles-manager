import { AppSettings } from '../types';
import { CoreDeps } from './ports';

export class SettingsService {
  constructor(private deps: CoreDeps) {}

  get(): AppSettings {
    try {
      const saved = this.deps.documents.read<Partial<AppSettings>>('settings');
      if (saved !== undefined) {
        // Merge with defaults so new fields are always present without overwriting saved values
        return { ...this.deps.defaultSettings(), ...saved };
      }
      // Document doesn't exist yet — create it with defaults
      return this.initDefaults();
    } catch (error) {
      console.error('Error reading settings:', error);
      return this.deps.defaultSettings();
    }
  }

  save(settings: AppSettings): void {
    this.deps.documents.write('settings', settings);
  }

  update(updates: Partial<AppSettings>): AppSettings {
    const updated = { ...this.get(), ...updates };
    this.save(updated);
    return updated;
  }

  /** Writes and returns the platform defaults. */
  initDefaults(): AppSettings {
    const defaults = this.deps.defaultSettings();
    this.save(defaults);
    return defaults;
  }
}
