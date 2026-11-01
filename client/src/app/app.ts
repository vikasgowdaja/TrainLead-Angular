import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './app-header/app-header';

@Component({
  imports: [AppHeader, RouterOutlet],
  selector: 'app-root',
  template: '<div class="app-shell app-root-shell" [class.dark-theme]="darkMode()"><app-header [darkMode]="darkMode()" (themeToggle)="toggleTheme()" /><router-outlet /></div>',
  styleUrl: './app.scss',
})
export class App {
  protected readonly darkMode = signal(false);

  protected toggleTheme(): void {
    this.darkMode.update((isDark) => !isDark);
  }
}
