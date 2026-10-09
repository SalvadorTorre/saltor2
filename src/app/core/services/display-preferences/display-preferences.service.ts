import { Injectable } from '@angular/core';

export type DisplayProfile = 'auto' | '1366x768' | '1440x900' | '1920x1080';

@Injectable({ providedIn: 'root' })
export class DisplayPreferencesService {
  private readonly storageKey = 'saltor.display-profile';

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
