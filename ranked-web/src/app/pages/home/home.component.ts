import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LeagueService } from '../../services/league.service';
import { collection, collectionData, Firestore, limit, orderBy, query } from '@angular/fire/firestore';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { LeagueMatch } from '../../models/LeagueMatch';
import { League } from '../../models/League';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  private authService = inject(AuthService);
  private leagueService = inject(LeagueService);
  private firestore = inject(Firestore);
  private platformId = inject(PLATFORM_ID);

  userLeagues$ = new Observable<LeagueParticipant[]>();
  /** Overall stats across all leagues: total wins, total losses, avg ELO */
  overallStats$: Observable<{ totalWins: number; totalLosses: number; avgElo: number; hasAnyLeague: boolean }> = of({ totalWins: 0, totalLosses: 0, avgElo: 1000, hasAnyLeague: false });
  firstLeague$ = new Observable<League | null>();
  participant$ = new Observable<LeagueParticipant | null>();
  recentMatches$ = new Observable<LeagueMatch[]>();
  topPlayers$ = new Observable<any[]>();

  get user() {
    return this.authService.profile();
  }

  get isLoggedIn() {
    return !!this.user;
  }

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const uid = this.user?.uid;
    if (uid) {
      this.userLeagues$ = this.leagueService.listUserLeagues(uid);
      this.overallStats$ = this.userLeagues$.pipe(
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
      this.participant$ = this.userLeagues$.pipe(
        map(participants => participants?.[0] ?? null)
      );
      this.firstLeague$ = this.userLeagues$.pipe(
        switchMap(participants => {
          const first = participants?.[0];
          if (!first?.leagueId) return of(null);
          return this.leagueService.getLeague(first.leagueId);
        })
      );
      this.recentMatches$ = this.userLeagues$.pipe(
        switchMap(participants => {
          const first = participants?.[0];
          if (!first?.leagueId) return of([]);
          return this.leagueService.listUserMatches(first.leagueId, uid).pipe(
            map(matches => (matches || []).slice(0, 5))
          );
        })
      );
    }

    const leaderboardQuery = query(
      collection(this.firestore, 'users'),
      orderBy('rank', 'desc'),
      limit(5)
    );
    this.topPlayers$ = collectionData(leaderboardQuery, { idField: 'id' }) as Observable<any[]>;
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
