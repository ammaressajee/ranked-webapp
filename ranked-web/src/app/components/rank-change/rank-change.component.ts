import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-rank-change',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rank-overlay" [class.visible]="visible" (click)="dismiss()">
      <div class="rank-card" [class.win]="rankDelta > 0" [class.loss]="rankDelta < 0" (click)="$event.stopPropagation()">
        <div class="rank-emoji">{{ rankDelta > 0 ? '🎉' : '💪' }}</div>
        <h2>{{ rankDelta > 0 ? 'Rank Up!' : 'Keep Going!' }}</h2>
        <div class="rank-change-display">
          <span class="old-rank">{{ oldRank }}</span>
          <span class="arrow material-symbols-outlined">{{ rankDelta > 0 ? 'arrow_upward' : 'arrow_downward' }}</span>
          <span class="new-rank">{{ newRank }}</span>
        </div>
        <div class="rank-delta" [class.positive]="rankDelta > 0" [class.negative]="rankDelta < 0">
          {{ rankDelta > 0 ? '+' : '' }}{{ rankDelta }} ELO
        </div>
        <p class="rank-message">{{ rankDelta > 0 ? 'Great match! Your rank has improved.' : 'Keep playing to climb back up!' }}</p>
        <button class="btn-dismiss" (click)="dismiss()">Continue</button>
      </div>
    </div>
  `,
  styles: [`
    .rank-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
      backdrop-filter: blur(4px);

      &.visible {
        opacity: 1;
        pointer-events: all;
      }
    }

    .rank-card {
      background: var(--bg-card);
      border: 2px solid var(--border);
      border-radius: 24px;
      padding: 2.5rem 2rem;
      text-align: center;
      max-width: 340px;
      width: 100%;
      animation: rank-pop 0.4s ease-out;

      &.win {
        border-color: var(--accent);
        box-shadow: 0 0 40px rgba(0, 212, 170, 0.15);
      }

      &.loss {
        border-color: #ff6b6b;
      }
    }

    @keyframes rank-pop {
      0% { transform: scale(0.8); opacity: 0; }
      60% { transform: scale(1.05); }
      100% { transform: scale(1); opacity: 1; }
    }

    .rank-emoji {
      font-size: 3rem;
      margin-bottom: 0.5rem;
    }

    h2 {
      font-size: 1.5rem;
      color: var(--text-primary);
      margin: 0 0 1rem;
      font-family: var(--font-display);
    }

    .rank-change-display {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .old-rank {
      font-size: 1.5rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    .arrow {
      font-size: 1.5rem;
    }

    .win .arrow { color: var(--accent); }
    .loss .arrow { color: #ff6b6b; }

    .new-rank {
      font-size: 2rem;
      font-weight: 800;
      color: var(--text-primary);
      font-family: var(--font-display);
    }

    .rank-delta {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.75rem;

      &.positive { color: var(--accent); }
      &.negative { color: #ff6b6b; }
    }

    .rank-message {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin: 0 0 1.25rem;
    }

    .btn-dismiss {
      padding: 0.6rem 2rem;
      background: var(--gradient-accent);
      color: #0f0f14;
      border: none;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
    }
  `]
})
export class RankChangeComponent implements OnInit {
  @Input() oldRank = 1000;
  @Input() newRank = 1000;
  @Output() dismissed = new EventEmitter<void>();

  visible = false;

  get rankDelta(): number {
    return this.newRank - this.oldRank;
  }

  ngOnInit() {
    setTimeout(() => this.visible = true, 100);
  }

  dismiss() {
    this.visible = false;
    setTimeout(() => this.dismissed.emit(), 300);
  }
}
