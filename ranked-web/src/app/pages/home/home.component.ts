import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { LeagueService } from '../../services/league.service';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { LeagueMatch } from '../../models/LeagueMatch';
import { League } from '../../models/League';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  private authService = inject(AuthService);
  private leagueService = inject(LeagueService);

  /** Reactive to profile so league data appears after auth restores on reload. */
  userLeagues$: Observable<LeagueParticipant[]> = toObservable(this.authService.profile).pipe(
    switchMap(p => p?.uid ? this.leagueService.listUserLeagues(p.uid) : of([]))
  );

  /** Overall stats across all leagues: total wins, total losses, avg ELO */
  overallStats$: Observable<{ totalWins: number; totalLosses: number; avgElo: number; hasAnyLeague: boolean }> = this.userLeagues$.pipe(
    map(participants => {
      const list = participants ?? [];
      if (!list.length) return { totalWins: 0, totalLosses: 0, avgElo: 1000, hasAnyLeague: false };
      const totalWins = list.reduce((s, p) => s + (p.wins ?? 0), 0);
      const totalLosses = list.reduce((s, p) => s + (p.losses ?? 0), 0);
      const sumRank = list.reduce((s, p) => s + (p.currentRank ?? 1000), 0);
      const avgElo = Math.round(sumRank / list.length);
      return { totalWins, totalLosses, avgElo, hasAnyLeague: true };
    })
  );

  participant$: Observable<LeagueParticipant | null> = this.userLeagues$.pipe(
    map(participants => participants?.[0] ?? null)
  );

  firstLeague$: Observable<League | null> = this.userLeagues$.pipe(
    switchMap(participants => {
      const first = participants?.[0];
      if (!first?.leagueId) return of(null);
      return this.leagueService.getLeague(first.leagueId);
    })
  );

  recentMatches$: Observable<LeagueMatch[]> = combineLatest([
    this.userLeagues$,
    toObservable(this.authService.profile)
  ]).pipe(
    switchMap(([participants, profile]) => {
      const first = participants?.[0];
      if (!first?.leagueId || !profile?.uid) return of([]);
      return this.leagueService.listUserMatches(first.leagueId, profile.uid).pipe(
        map(matches => (matches || []).slice(0, 5))
      );
    })
  );

  topPlayers$: Observable<LeagueParticipant[]> = this.leagueService.getTopParticipantsGlobally(50).pipe(
    map(participants => {
      const byUser = new Map<string, LeagueParticipant>();
      for (const p of participants ?? []) {
        const existing = byUser.get(p.userId);
        if (!existing || (p.currentRank ?? 0) > (existing.currentRank ?? 0))
          byUser.set(p.userId, p);
      }
      return Array.from(byUser.values())
        .sort((a, b) => (b.currentRank ?? 0) - (a.currentRank ?? 0))
        .slice(0, 5);
    })
  );

  get user() {
    return this.authService.profile();
  }

  get isAuthReady() {
    return this.authService.isAuthReady();
  }

  /** Use auth service auth state so we don't show logged-out view while profile is still loading after reload. */
  get isLoggedIn() {
    return this.authService.isLoggedIn();
  }

  getTier(rank: number): string {
    if (rank >= 2200) return 'Champion';
    if (rank >= 1900) return 'Diamond';
    if (rank >= 1600) return 'Platinum';
    if (rank >= 1300) return 'Gold';
    if (rank >= 1000) return 'Silver';
    return 'Bronze';
  }

  getMatchStatus(match: LeagueMatch): string {
    switch (match.status) {
      case 'pending_acceptance': return 'Pending';
      case 'pending': return 'Ready';
      case 'reported':
      case 'pendingConfirm': return 'Awaiting confirm';
      case 'completed': return 'Done';
      case 'cancelled': return 'Cancelled';
      default: return match.status || '—';
    }
  }
}
