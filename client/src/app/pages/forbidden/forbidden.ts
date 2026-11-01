import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink],
  template: `
    <main class="app-shell auth-page">
      <section class="auth-card" aria-labelledby="forbidden-title">
        <p class="eyebrow">403</p>
        <h1 id="forbidden-title">You don't have access to this page</h1>
        <p class="auth-subtitle">Your role does not allow this action. Ask an admin if you think this is wrong.</p>
        <a class="primary-button" routerLink="/">Back to requirements</a>
      </section>
    </main>
  `,
})
export class ForbiddenPage {}
