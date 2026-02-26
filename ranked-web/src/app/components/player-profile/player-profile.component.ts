import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { LeagueService } from '../../services/league.service';

@Component({
  selector: 'app-player-profile',
  imports: [CommonModule],
  templateUrl: './player-profile.component.html',
  styleUrl: './player-profile.component.scss',
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private leagueService = inject(LeagueService);

  player = signal<any>(null);
  /** Profile uid (from route or current user) - used for isWinner etc */
  profileUid = signal<string | null>(null);
  /** Primary league stats (rank, wins, losses) - used when in a league */
  leagueStats = signal<{ rank: number; wins: number; losses: number } | null>(null);
  recentMatches = signal<any[]>([]);

  async ngOnInit() {
    const uid = this.route.snapshot.paramMap.get('uid') || this.auth.currentUser?.uid;
    if (!uid) return;
    this.profileUid.set(uid);

    // Load player info from users (fallback for global stats)
    const userRef = doc(this.firestore, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      this.player.set({ ...userSnap.data(), uid });
    } else {
      this.player.set({ displayName: 'Unknown', rank: 1000, wins: 0, losses: 0, uid });
    }

    // League-based: get primary league participant for rank/wins/losses + displayName fallback
    this.leagueService.listUserLeagues(uid).subscribe(participants => {
      const first = participants?.[0];
      if (first) {
        this.leagueStats.set({
          rank: first.currentRank ?? 1000,
          wins: first.wins ?? 0,
          losses: first.losses ?? 0
        });
        if (!this.player()?.displayName && first.displayName) {
          this.player.update(prev => ({ ...prev, displayName: first.displayName }));
        }
      } else {
        this.leagueStats.set(null);
      }
    });

    // Load recent league matches
    this.leagueService.listRecentLeagueMatchesForUser(uid, 10).subscribe(data => this.recentMatches.set(data));
  }

  displayRank(p: any): number {
    const ls = this.leagueStats();
    return ls?.rank ?? p?.rank ?? 1000;
  }

  displayWins(p: any): number {
    const ls = this.leagueStats();
    return ls?.wins ?? p?.wins ?? 0;
  }

  displayLosses(p: any): number {
    const ls = this.leagueStats();
    return ls?.losses ?? p?.losses ?? 0;
  }

  isWinner(match: any, uid: string | null): boolean {
    return !!(uid && match?.result?.winner === uid);
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
