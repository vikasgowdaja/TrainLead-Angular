import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { SkillView } from '@trainlead/shared/domain';
import { MarketplaceService } from '../../core/marketplace.service';
import { AuthService } from '../../core/auth/auth.service';
import { describeHttpError } from '../../core/http-error';

@Component({
  selector: 'app-skills-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './skills.html',
})
export class SkillsPage {
  private readonly api = inject(MarketplaceService);
  protected readonly auth = inject(AuthService);
  protected readonly skills = signal<SkillView[]>([]);
  protected readonly query = signal('');
  protected readonly name = signal('');
  protected readonly domain = signal('');
  protected readonly aliases = signal('');
  protected readonly edits = signal<Record<string, { name: string; domain: string; aliases: string; verified: boolean }>>({});
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.listSkills(this.query()).subscribe({
      next: ({ data }) => {
        this.skills.set(data);
        this.edits.set(Object.fromEntries(data.map((skill) => [skill.id, {
          name: skill.name, domain: skill.domain, aliases: skill.aliases.join(', '), verified: skill.verified,
        }])));
        this.loading.set(false);
      },
      error: (error: unknown) => { this.errorMessage.set(describeHttpError(error)); this.loading.set(false); },
    });
  }

  protected suggest(): void {
    const name = this.name().trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    this.api.suggestSkill({ name, domain: this.domain().trim(), aliases: this.aliases().split(',').map((item) => item.trim()).filter(Boolean) }).subscribe({
      next: ({ data, existing }) => {
        this.name.set(''); this.domain.set(''); this.aliases.set('');
        this.successMessage.set(existing ? `Using existing canonical skill: ${data.name}.` : 'Skill suggestion saved.');
        this.load(); this.saving.set(false);
      },
      error: (error: unknown) => { this.errorMessage.set(describeHttpError(error)); this.saving.set(false); },
    });
  }

  protected setEdit(id: string, key: 'name' | 'domain' | 'aliases' | 'verified', value: string | boolean): void {
    this.edits.update((items) => ({ ...items, [id]: { ...items[id]!, [key]: value } }));
  }

  protected save(skill: SkillView): void {
    const edit = this.edits()[skill.id];
    if (!edit) return;
    if (!this.auth.hasRole('Admin')) {
      this.errorMessage.set('Only an Admin can edit canonical skill metadata. You can still suggest aliases above.');
      return;
    }
    this.api.updateSkill(skill.id, {
      name: edit.name,
      domain: edit.domain,
      aliases: edit.aliases.split(',').map((item) => item.trim()).filter(Boolean),
      verified: edit.verified,
    }).subscribe({
      next: ({ data }) => {
        this.skills.update((items) => items.map((item) => item.id === data.id ? data : item));
        this.successMessage.set(`${data.name} saved.`);
      },
      error: (error: unknown) => this.errorMessage.set(describeHttpError(error)),
    });
  }
}
