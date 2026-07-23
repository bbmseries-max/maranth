import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dim' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Signal to track the current theme reactively across the app
  currentTheme = signal<ThemeMode>('light');

  constructor() {
    this.loadTheme();
  }

  setTheme(theme: ThemeMode) {
    this.currentTheme.set(theme);
    localStorage.setItem('pos-theme', theme);
    
    // This applies the data-theme attribute to the body, instantly switching the CSS variables
    document.body.setAttribute('data-theme', theme);
  }

  private loadTheme() {
    const saved = localStorage.getItem('pos-theme') as ThemeMode;
    if (saved) {
      this.setTheme(saved);
    } else {
      this.setTheme('light'); // Default fallback
    }
  }
}