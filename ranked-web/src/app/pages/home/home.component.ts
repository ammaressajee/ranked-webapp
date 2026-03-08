import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { LeagueService } from '../../services/league.service';
import { combineLatest, filter, forkJoin, from, map, Observable, of, switchMap, take } from 'rxjs';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { LeagueMatch } from '../../models/LeagueMatch';
import { League } from '../../models/League';
import { FormsModule } from '@angular/forms';
import { AdSlotComponent } from '../../components/ad-slot/ad-slot.component';
import { environment } from '../../../environments/environment';
import { NotificationService } from '../../services/notification.service';
import { OnboardingComponent } from '../../components/onboarding/onboarding.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AdSlotComponent, OnboardingComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  private authService = inject(AuthService);
  private leagueService = inject(LeagueService);
  private notificationService = inject(NotificationService);

  /** Reactive to profile so league data appears after auth restores on reload. */
  userLeagues$: Observable<LeagueParticipant[]> = toObservable(this.authService.profile).pipe(
    switchMap(p => p?.uid ? this.leagueService.listUserLeagues(p.uid) : of([]))
  );

  userLeagues = toSignal(this.userLeagues$, { initialValue: [] as LeagueParticipant[] });

  /** User-selected league id; defaults to a league with an alert when possible, else first league. */
  selectedLeagueId = signal<string | null>(null);

  /** League ID to show by default: first league that has an alert, otherwise first league. */
  private preferredLeagueId$ = combineLatest([
    this.userLeagues$,
    toObservable(this.authService.profile)
  ]).pipe(
    filter(([leagues, profile]) => (leagues?.length ?? 0) > 0 && !!profile?.uid),
    take(1),
    switchMap(([leagues, profile]) => {
      const uid = profile!.uid!;
      return forkJoin(
        (leagues ?? []).map(l =>
          this.leagueService.listUserMatches(l.leagueId, uid).pipe(
            take(1),
            map(matches => ({ leagueId: l.leagueId, matches: matches ?? [] }))
          )
        )
      ).pipe(
        map(results => {
          for (const { leagueId, matches } of results) {
            const hasAlert = matches.some(m =>
              (m.status === 'reported' && m.confirmations?.[uid] !== true) ||
              m.status === 'pending' ||
              (m.status === 'pending_acceptance' && m.playerB === uid)
            );
            if (hasAlert) return leagueId;
          }
          return results[0]?.leagueId ?? null;
        })
      );
    })
  );

  constructor() {
    effect(() => {
      const leagues = this.userLeagues();
      if (!leagues?.length) return;
      const cur = this.selectedLeagueId();
      const valid = leagues.some(p => p.leagueId === cur);
      if (!valid) this.selectedLeagueId.set(leagues[0].leagueId);
    });
  }

  ngOnInit() {
    this.preferredLeagueId$.subscribe(leagueId => {
      if (leagueId) this.selectedLeagueId.set(leagueId);
    });
  }

  onLeagueChange(leagueId: string) {
    this.selectedLeagueId.set(leagueId || null);
  }

  /** Effective league id: selected if valid, otherwise first. */
  effectiveLeagueId$ = combineLatest([
    this.userLeagues$,
    toObservable(this.selectedLeagueId)
  ]).pipe(
    map(([leagues, selected]) => {
      if (!leagues?.length) return null;
      if (selected && leagues.some(p => p.leagueId === selected)) return selected;
      return leagues[0].leagueId;
    })
  );

  /** Stats for the selected league only: rank, wins, losses. */
  leagueStats$: Observable<{ rank: number; wins: number; losses: number; hasAnyLeague: boolean }> = combineLatest([
    this.userLeagues$,
    this.effectiveLeagueId$
  ]).pipe(
    map(([participants, leagueId]) => {
      const list = participants ?? [];
      if (!list.length || !leagueId) return { rank: 1000, wins: 0, losses: 0, hasAnyLeague: false };
      const p = list.find(part => part.leagueId === leagueId);
      if (!p) return { rank: 1000, wins: 0, losses: 0, hasAnyLeague: true };
      return {
        rank: p.currentRank ?? 1000,
        wins: p.wins ?? 0,
        losses: p.losses ?? 0,
        hasAnyLeague: true
      };
    })
  );

  /** Participant for the selected league (for Find Match link). */
  selectedParticipant$: Observable<LeagueParticipant | null> = combineLatest([
    this.userLeagues$,
    this.effectiveLeagueId$
  ]).pipe(
    map(([participants, leagueId]) => participants?.find(p => p.leagueId === leagueId) ?? null)
  );

  selectedLeague$: Observable<League | null> = this.effectiveLeagueId$.pipe(
    switchMap(id => id ? this.leagueService.getLeague(id) : of(null))
  );

  /** All matches in the selected league (for banner + recent list). */
  selectedLeagueMatches$: Observable<LeagueMatch[]> = combineLatest([
    this.effectiveLeagueId$,
    toObservable(this.authService.profile)
  ]).pipe(
    switchMap(([leagueId, profile]) => {
      if (!leagueId || !profile?.uid) return of([]);
      return this.leagueService.listUserMatches(leagueId, profile.uid).pipe(
        map(matches => matches || [])
      );
    })
  );

  recentMatches$: Observable<LeagueMatch[]> = this.selectedLeagueMatches$.pipe(
    map(matches => matches.slice(0, 5))
  );

  recentMatchNames$: Observable<Record<string, string>> = combineLatest([
    this.recentMatches$,
    toObservable(this.authService.profile)
  ]).pipe(
    switchMap(([matches, profile]) => {
      const uid = profile?.uid;
      if (!uid || !matches.length) return of({} as Record<string, string>);
      const opponentUids = [...new Set(
        matches.map(m => m.playerA === uid ? m.playerB : m.playerA).filter(Boolean)
      )];
      if (!opponentUids.length) return of({} as Record<string, string>);
      return from(
        Promise.all(opponentUids.map(id => this.leagueService.getDisplayName(id).then(name => [id, name] as const)))
      ).pipe(map(pairs => Object.fromEntries(pairs)));
    })
  );

  /** Alerts for banner: match awaiting confirmation, new match to play, or match request to accept. Includes leagueId so "Go to My Matches" can open the right league. */
  matchAlerts$: Observable<{ messages: string[]; leagueId: string } | null> = combineLatest([
    this.selectedLeagueMatches$,
    this.effectiveLeagueId$,
    toObservable(this.authService.profile)
  ]).pipe(
    map(([matches, leagueId, profile]) => {
      const uid = profile?.uid;
      if (!uid || !leagueId || !matches.length) return null;
      const messages: string[] = [];
      const needsConfirm = matches.some(m => m.status === 'reported' && m.confirmations?.[uid] !== true);
      const hasNewMatchToPlay = matches.some(m => m.status === 'pending');
      const hasMatchToAccept = matches.some(m => m.status === 'pending_acceptance' && m.playerB === uid);
      const waitingForOpponent = matches.some(m => m.status === 'pending_acceptance' && m.playerA === uid);
      if (needsConfirm) messages.push('You have a match awaiting your confirmation.');
      if (hasMatchToAccept) messages.push('You have a new match request — accept to start coordinating!');
      if (hasNewMatchToPlay) messages.push('You have a match ready to play — message your opponent to coordinate.');
      if (waitingForOpponent && !hasNewMatchToPlay && !needsConfirm && !hasMatchToAccept) messages.push('A match is waiting for your opponent to accept.');
      return messages.length ? { messages, leagueId } : null;
    })
  );

  /** Top players in the selected league (for logged-in dashboard). */
  leagueLeaderboard$: Observable<LeagueParticipant[]> = this.effectiveLeagueId$.pipe(
    switchMap(leagueId =>
      leagueId
        ? this.leagueService.listParticipants(leagueId).pipe(map(p => (p ?? []).slice(0, 10)))
        : of([])
    )
  );

  /** Global top players (for logged-out landing). */
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

  adSlotInContent = environment.adSlotInContent;
  get showInContentAd(): boolean {
    return !!environment.adsEnabled && !!environment.adSlotInContent;
  }

  getTier(rank: number): string {
    if (rank >= 2200) return 'Champion';
    if (rank >= 1900) return 'Diamond';
    if (rank >= 1600) return 'Platinum';
    if (rank >= 1300) return 'Gold';
    if (rank >= 1000) return 'Silver';
    return 'Bronze';
  }

  getOpponentName(match: LeagueMatch, nameMap: Record<string, string>): string {
    const uid = this.user?.uid;
    if (!uid) return 'opponent';
    const oppUid = match.playerA === uid ? match.playerB : match.playerA;
    return nameMap[oppUid] || 'opponent';
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

  get showNotificationPrompt(): boolean {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission !== 'default') return false;
    return !localStorage.getItem('notif_prompt_dismissed');
  }

  async enableNotifications() {
    await this.notificationService.requestPermissionAndRegister();
  }

  dismissNotificationPrompt() {
    localStorage.setItem('notif_prompt_dismissed', '1');
  }

  showOnboarding = false;

  private checkOnboarding = effect(() => {
    if (!this.authService.isAuthReady() || !this.authService.isLoggedIn()) return;
    const leagues = this.userLeagues();
    if (leagues === undefined) return;
    if (leagues.length === 0 && !localStorage.getItem('onboarding_complete')) {
      this.showOnboarding = true;
    }
  });

  dismissOnboarding() {
    this.showOnboarding = false;
  }
}
