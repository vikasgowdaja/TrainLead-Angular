import { Component, input } from '@angular/core';

interface Trainer {
  name: string;
  city: string;
  skills: string[];
}

@Component({
  selector: 'app-trainer-card',
  template: `<!-- Render name, city, and first skill here -->`,
})
export class TrainerCard {
  readonly trainer = input.required<Trainer>();
}