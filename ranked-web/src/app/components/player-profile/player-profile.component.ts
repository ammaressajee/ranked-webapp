import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
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
  /** Overall stats across all leagues: total wins, total losses, average ELO */
  overallStats = signal<{ totalWins: number; totalLosses: number; avgElo: number; leagueCount: number } | null>(null);
  recentMatches = signal<any[]>([]);

  async ngOnInit() {
    const uid = this.route.snapshot.paramMap.get('uid') || this.auth.currentUser?.uid;
    if (!uid) return;
    this.profileUid.set(uid);

    // Load player info from users (display name, photo fallback)
    const userRef = doc(this.firestore, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      this.player.set({ ...userSnap.data(), uid });
    } else {
      this.player.set({ displayName: 'Unknown', rank: 1000, wins: 0, losses: 0, uid });
    }

    // Aggregate across ALL leagues: wait for first emission so stats are set before/during first render
    try {
      const participants = await firstValueFrom(this.leagueService.listUserLeagues(uid));
      const list = participants ?? [];
      if (list.length) {
        const totalWins = list.reduce((s, p) => s + (p.wins ?? 0), 0);
        const totalLosses = list.reduce((s, p) => s + (p.losses ?? 0), 0);
        const sumRank = list.reduce((s, p) => s + (p.currentRank ?? 1000), 0);
        const avgElo = Math.round(sumRank / list.length);
        this.overallStats.set({
          totalWins,
          totalLosses,
          avgElo,
          leagueCount: list.length
        });
        const first = list[0];
        if (!this.player()?.displayName && first?.displayName) {
          this.player.update(prev => ({ ...prev, displayName: first.displayName }));
        }
      } else {
        this.overallStats.set(null);
      }
    } catch (e) {
      this.overallStats.set(null);
    }

    // Load recent league matches
    this.leagueService.listRecentLeagueMatchesForUser(uid, 10).subscribe(data => this.recentMatches.set(data));
  }

  displayRank(p: any): number {
    const os = this.overallStats();
    return os?.avgElo ?? p?.rank ?? 1000;
  }

  displayWins(p: any): number {
    const os = this.overallStats();
    return os?.totalWins ?? p?.wins ?? 0;
  }

  displayLosses(p: any): number {
    const os = this.overallStats();
    return os?.totalLosses ?? p?.losses ?? 0;
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
