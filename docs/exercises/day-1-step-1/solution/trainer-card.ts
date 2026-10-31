import { Component, input } from '@angular/core';

interface Trainer {
  name: string;
  city: string;
  skills: string[];
}

@Component({
  selector: 'app-trainer-card',
  template: `
    <article>
      <h2>{{ trainer().name }}</h2>
      <p>{{ trainer().city }}</p>
      @if (trainer().skills.length > 0) {
        <p>{{ trainer().skills[0] }}</p>
      }
    </article>
  `,
})
export class TrainerCard {
  readonly trainer = input.required<Trainer>();
}