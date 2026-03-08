import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  label: string;
  route?: string | string[];
}

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li *ngFor="let item of items; let last = last">
          <a *ngIf="!last && item.route" [routerLink]="item.route">{{ item.label }}</a>
          <span *ngIf="last || !item.route" class="current" [attr.aria-current]="last ? 'page' : null">{{ item.label }}</span>
          <span *ngIf="!last" class="separator" aria-hidden="true">/</span>
        </li>
      </ol>
    </nav>
  `,
  styles: [`
    .breadcrumb {
      padding: 0 0 0.75rem;
    }

    ol {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0;
    }

    li {
      display: flex;
      align-items: center;
      font-size: 0.85rem;
    }

    a {
      color: var(--text-muted);
      text-decoration: none;

      &:hover {
        color: var(--accent);
        text-decoration: underline;
      }
    }

    .current {
      color: var(--text-primary);
      font-weight: 500;
    }

    .separator {
      margin: 0 0.4rem;
      color: var(--text-muted);
      opacity: 0.5;
    }
  `]
})
export class BreadcrumbComponent {
  @Input() items: BreadcrumbItem[] = [];
}
