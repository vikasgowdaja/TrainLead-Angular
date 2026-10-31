import { Component, signal } from '@angular/core';
import { RequirementCard } from './requirement-card/requirement-card';
import { demoRequirements, inboxPosts } from './requirement.data';

@Component({
  imports: [RequirementCard],
  selector: 'app-root',
  templateUrl: './trainlead-shell.html',
})
export class App {
  protected readonly activeView = signal<'requirements' | 'inbox'>('requirements');
  protected readonly darkMode = signal(false);
  protected readonly requirements = demoRequirements;
  protected readonly posts = inboxPosts;

  protected setView(view: 'requirements' | 'inbox'): void {
    this.activeView.set(view);
  }

  protected toggleTheme(): void {
    this.darkMode.update((isDark) => !isDark);
  }
}
