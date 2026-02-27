import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeagueService } from '../../services/league.service';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-leaderboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
})
export class LeaderboardComponent {
  private ls = inject(LeagueService);
  private platformId = inject(PLATFORM_ID);
  players = signal<LeagueParticipant[]>([]);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.ls.getTopParticipantsGlobally(100).pipe(
        map(participants => {
          const byUser = new Map<string, LeagueParticipant>();
          for (const p of participants ?? []) {
            const existing = byUser.get(p.userId);
            if (!existing || (p.currentRank ?? 0) > (existing.currentRank ?? 0))
              byUser.set(p.userId, p);
          }
          return Array.from(byUser.values())
            .sort((a, b) => (b.currentRank ?? 0) - (a.currentRank ?? 0))
            .slice(0, 10);
        })
      ).subscribe(data => this.players.set(data));
    }
  }

  getTier(rank: number): string {
  if (rank >= 2200) return 'Champion 👑';
  if (rank >= 1900) return 'Diamond 🔷';
  if (rank >= 1600) return 'Platinum 💎';
  if (rank >= 1300) return 'Gold 🥇';
  if (rank >= 1000) return 'Silver 🥈';
  return 'Bronze 🥉';
}

}
