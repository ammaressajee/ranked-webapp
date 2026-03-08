import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="not-found-page">
      <span class="error-code">404</span>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist or has been moved.</p>
      <div class="actions">
        <a routerLink="/" class="btn-primary">Go Home</a>
        <a routerLink="/leagues" class="btn-secondary">Browse Leagues</a>
      </div>
    </div>
  `,
  styles: [`
    .not-found-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;
      padding: 2rem 1rem;
    }

    .error-code {
      font-size: 5rem;
      font-weight: 800;
      color: var(--accent);
      line-height: 1;
      margin-bottom: 0.5rem;
      font-family: var(--font-display);
    }

    h1 {
      font-size: 1.5rem;
      color: var(--text-primary);
      margin: 0 0 0.5rem;
    }

    p {
      color: var(--text-muted);
      margin: 0 0 2rem;
      font-size: 1rem;
    }

    .actions {
      display: flex;
      gap: 0.75rem;
    }

    .btn-primary {
      padding: 0.6rem 1.5rem;
      background: var(--gradient-accent);
      color: #0f0f14;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
    }

    .btn-secondary {
      padding: 0.6rem 1.5rem;
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 10px;
      text-decoration: none;
      font-weight: 500;
      font-size: 0.95rem;
    }
  `]
})
export class NotFoundComponent {}
