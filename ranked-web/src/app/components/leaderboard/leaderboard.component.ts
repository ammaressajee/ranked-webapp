import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { collection, collectionData, Firestore, limit, orderBy, query } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-leaderboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
})
export class LeaderboardComponent {

  private firestore = inject(Firestore);
  private platformId = inject(PLATFORM_ID);
  players = signal<any[]>([]);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const leaderboardQuery = query(
        collection(this.firestore, 'users'),
        orderBy('rank', 'desc'),
        limit(10)
      );
      collectionData(leaderboardQuery, { idField: 'id' })
        .subscribe(data => this.players.set(data));
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
