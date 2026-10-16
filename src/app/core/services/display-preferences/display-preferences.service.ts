import { Injectable } from '@angular/core';

export type DisplayProfile = 'auto' | '1366x768' | '1440x900' | '1920x1080';
export type ThemePreference = 'claro' | 'oscuro' | 'sistema';

@Injectable({ providedIn: 'root' })
export class DisplayPreferencesService {
  private readonly storageKey = 'saltor.display-profile';
  private readonly themeKey = 'saltor.theme';
  private systemQuery: MediaQueryList | null = null;
  private readonly onSystemChange = () => this.applyTheme('sistema');

  /** Tema guardado en este equipo (claro por defecto). */
  getTheme(): ThemePreference {
    let value: string | null = null;
    try { value = localStorage.getItem(this.themeKey); } catch { /* sin almacenamiento */ }
    return value === 'oscuro' || value === 'sistema' ? value : 'claro';
  }

  /** Aplica el tema: "sistema" sigue el modo claro/oscuro de Windows y cambia solo. */
  applyTheme(theme: ThemePreference): void {
    if (!this.systemQuery && typeof window !== 'undefined' && window.matchMedia) this.systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemQuery?.removeEventListener('change', this.onSystemChange);
    if (theme === 'sistema') this.systemQuery?.addEventListener('change', this.onSystemChange);
    const dark = theme === 'oscuro' || (theme === 'sistema' && !!this.systemQuery?.matches);
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  }

  saveTheme(theme: ThemePreference): void {
    try { localStorage.setItem(this.themeKey, theme); } catch { /* sin almacenamiento */ }
    this.applyTheme(theme);
  }

  getProfile(): DisplayProfile {
    const value = localStorage.getItem(this.storageKey);
    return this.isProfile(value) ? value : 'auto';
  }

  apply(profile: DisplayProfile): void {
    document.documentElement.dataset['displayProfile'] = profile;
  }

  save(profile: DisplayProfile): void {
    localStorage.setItem(this.storageKey, profile);
    this.apply(profile);
  }

  private isProfile(value: string | null): value is DisplayProfile {
    return value === 'auto' || value === '1366x768' || value === '1440x900' || value === '1920x1080';
  }
}
