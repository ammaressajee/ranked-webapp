import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LeagueService } from '../../services/league.service';
import { UserContactPreferences } from '../../models/UserContactPreferences';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-player-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './player-profile.component.html',
  styleUrl: './player-profile.component.scss',
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  auth = inject(Auth);
  private leagueService = inject(LeagueService);

  player = signal<any>(null);
  /** Profile uid (from route or current user) - used for isWinner etc */
  profileUid = signal<string | null>(null);
  /** Overall stats across all leagues: total wins, total losses, average ELO */
  overallStats = signal<{ totalWins: number; totalLosses: number; avgElo: number; leagueCount: number } | null>(null);
  recentMatches = signal<any[]>([]);

  /** Contact preferences for own profile edit */
  contactPrefs = signal<Partial<UserContactPreferences>>({});
  contactSaving = signal(false);
  contactSaved = signal(false);
  isOwnProfile = computed(() => {
    const uid = this.profileUid();
    const current = this.auth.currentUser?.uid;
    return !!(uid && current && uid === current);
  });

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

    // Load contact preferences when viewing own profile
    if (this.auth.currentUser?.uid === uid) {
      this.leagueService.getUserContactPreferences(uid).subscribe(prefs => {
        this.contactPrefs.set(prefs ?? {});
      });
    }
  }

  updateContactPref<K extends keyof UserContactPreferences>(key: K, value: UserContactPreferences[K]) {
    this.contactPrefs.update(p => ({ ...p, [key]: value }));
  }

  async saveContactPreferences() {
    const uid = this.profileUid();
    if (!uid || uid !== this.auth.currentUser?.uid) return;
    this.contactSaving.set(true);
    this.contactSaved.set(false);
    try {
      await this.leagueService.updateUserContactPreferences(uid, this.contactPrefs());
      this.contactSaved.set(true);
      setTimeout(() => this.contactSaved.set(false), 3000);
    } finally {
      this.contactSaving.set(false);
    }
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

  /** Label for match in list: Won/Lost only when completed; otherwise status (Pending, Awaiting confirmation, Cancelled). */
  getMatchResultLabel(match: any): string {
    if (!match) return '—';
    const status = match.status;
    if (status === 'completed') {
      return this.isWinner(match, this.profileUid()) ? 'Won' : 'Lost';
    }
    switch (status) {
      case 'pending_acceptance': return 'Pending';
      case 'pending': return 'Pending';
      case 'reported':
      case 'pendingConfirm': return 'Awaiting confirmation';
      case 'cancelled': return 'Cancelled';
      default: return status || 'Pending';
    }
  }

  /** True only when match is completed (so we can show win/loss styling). */
  isMatchCompleted(match: any): boolean {
    return match?.status === 'completed';
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
