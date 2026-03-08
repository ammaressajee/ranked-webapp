import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="onboarding-backdrop" (click)="complete()">
      <div class="onboarding-modal" (click)="$event.stopPropagation()">
        <div class="onboarding-header">
          <h2>Welcome to Ladders!</h2>
          <p>Get started in 3 simple steps</p>
        </div>

        <div class="steps">
          <div class="step" [class.active]="currentStep === 0" [class.done]="currentStep > 0">
            <div class="step-icon">
              <span class="material-symbols-outlined">groups</span>
            </div>
            <div class="step-content">
              <h3>1. Join a League</h3>
              <p>Browse local leagues and join one near you. Leagues are organized by location so you can play in person.</p>
            </div>
          </div>

          <div class="step" [class.active]="currentStep === 1" [class.done]="currentStep > 1">
            <div class="step-icon">
              <span class="material-symbols-outlined">sports_tennis</span>
            </div>
            <div class="step-content">
              <h3>2. Find a Match</h3>
              <p>Hit "Find Match" to get paired with an opponent at your skill level. Accept, coordinate, and play!</p>
            </div>
          </div>

          <div class="step" [class.active]="currentStep === 2">
            <div class="step-icon">
              <span class="material-symbols-outlined">leaderboard</span>
            </div>
            <div class="step-content">
              <h3>3. Climb the Ranks</h3>
              <p>Report your score after each match. Win to gain ELO rating and rise up the leaderboard!</p>
            </div>
          </div>
        </div>

        <div class="onboarding-actions">
          <button *ngIf="currentStep < 2" class="btn-next" (click)="nextStep()">
            Next
          </button>
          <a *ngIf="currentStep === 2" routerLink="/leagues" class="btn-start" (click)="complete()">
            Browse Leagues
          </a>
          <button class="btn-skip" (click)="complete()">
            {{ currentStep === 2 ? 'Close' : 'Skip' }}
          </button>
        </div>

        <div class="step-dots">
          <span *ngFor="let s of [0, 1, 2]" class="dot" [class.active]="currentStep === s" (click)="currentStep = s"></span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .onboarding-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      backdrop-filter: blur(4px);
    }

    .onboarding-modal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      padding: 2rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }

    .onboarding-header {
      text-align: center;
      margin-bottom: 1.5rem;

      h2 {
        font-size: 1.5rem;
        color: var(--text-primary);
        margin: 0 0 0.25rem;
        font-family: var(--font-display);
      }

      p {
        color: var(--text-muted);
        margin: 0;
        font-size: 0.95rem;
      }
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .step {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--bg-elevated);
      opacity: 0.5;
      transition: all 0.3s;

      &.active {
        opacity: 1;
        border-color: var(--accent);
        background: rgba(0, 212, 170, 0.05);
      }

      &.done {
        opacity: 0.7;
      }
    }

    .step-icon {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: var(--accent-muted);
      display: flex;
      align-items: center;
      justify-content: center;

      .material-symbols-outlined {
        font-size: 1.4rem;
        color: var(--accent);
      }
    }

    .step-content {
      h3 {
        font-size: 1rem;
        color: var(--text-primary);
        margin: 0 0 0.25rem;
        font-weight: 600;
      }

      p {
        font-size: 0.85rem;
        color: var(--text-muted);
        margin: 0;
        line-height: 1.4;
      }
    }

    .onboarding-actions {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }

    .btn-next, .btn-start {
      padding: 0.6rem 2rem;
      background: var(--gradient-accent);
      color: #0f0f14;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }

    .btn-skip {
      padding: 0.6rem 1.5rem;
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border);
      border-radius: 10px;
      font-size: 0.9rem;
      cursor: pointer;
    }

    .step-dots {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--border);
      cursor: pointer;
      transition: all 0.2s;

      &.active {
        background: var(--accent);
        transform: scale(1.2);
      }
    }
  `]
})
export class OnboardingComponent {
  @Output() completed = new EventEmitter<void>();
  currentStep = 0;

  nextStep() {
    if (this.currentStep < 2) this.currentStep++;
  }

  complete() {
    localStorage.setItem('onboarding_complete', '1');
    this.completed.emit();
  }
}
