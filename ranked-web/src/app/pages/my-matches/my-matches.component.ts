import { Component, inject } from '@angular/core';
import { combineLatest, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { LeagueService } from '../../services/league.service';
import { Auth } from '@angular/fire/auth';
import { LeagueMatch } from '../../models/LeagueMatch';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

/** Participant with league name resolved (from league doc if missing on participant) */
export interface LeagueParticipantWithName extends LeagueParticipant {
  resolvedLeagueName: string;
}

@Component({
  selector: 'app-my-matches',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './my-matches.component.html',
  styleUrl: './my-matches.component.scss',
})
export class MyMatchesComponent {
  auth = inject(Auth);
  private ls = inject(LeagueService);

  userLeagues$!: Observable<LeagueParticipant[]>;
  /** Participants with league names resolved (fetches from leagues if leagueName missing) */
  leaguesWithNames$!: Observable<LeagueParticipantWithName[]>;
  matches$!: Observable<LeagueMatch[]>;
  participants$!: Observable<LeagueParticipant[]>;
  matchesWithNames$!: Observable<{ matches: LeagueMatch[]; nameMap: Record<string, string> }>;

  loading = true;
  error: string | null = null;

  selectedLeagueId: string | null = null;
  private sub = new Subscription();
  private nameMapSub = new Subscription();

  // Report dialog state
  reportDialogOpen = false;
  dialogMatch: LeagueMatch | null = null;
  dialogWinnerUid: string | null = null;
  dialogScore = '';
  dialogNameMap: Record<string, string> = {};

  // -------------------------------------
  //                INIT
  // -------------------------------------
  ngOnInit() {
    const user = this.auth.currentUser;
    if (!user) {
      this.error = 'You must be signed in.';
      this.loading = false;
      return;
    }

    // Step 1 — list leagues and enrich with names
    this.userLeagues$ = this.ls.listUserLeagues(user.uid);
    this.leaguesWithNames$ = this.userLeagues$.pipe(
      switchMap(participants => {
        if (!participants?.length) return of([]);
        return combineLatest(
          participants.map(p =>
            this.ls.getLeague(p.leagueId).pipe(
              map(league => ({
                ...p,
                resolvedLeagueName: p.leagueName || league?.name || p.leagueId
              }))
            )
          )
        );
      })
    );

    // Step 2 — subscribe to leagues (use leaguesWithNames$ for same leagueIds)
    this.sub.add(
      this.leaguesWithNames$.subscribe({
        next: (leagues) => {
          if (!leagues || leagues.length === 0) {
            this.error = 'You are not in any active leagues yet.';
            this.loading = false;
            return;
          }

          // Auto-select first league
          this.selectedLeagueId = leagues[0].leagueId;

          // Step 3 — load matches
          this.loadMatches(this.selectedLeagueId!);

          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.error = 'Failed to load leagues.';
          this.loading = false;
        },
      })
    );
  }

  // -------------------------------------
  //         LOAD MATCHES FOR LEAGUE
  // -------------------------------------
  loadMatches(leagueId: string) {
    const user = this.auth.currentUser;
    if (!user) return;

    this.matches$ = this.ls.listUserMatches(leagueId, user.uid);
    this.participants$ = this.ls.listParticipants(leagueId);
    this.matchesWithNames$ = combineLatest([this.matches$, this.participants$]).pipe(
      map(([matches, participants]) => {
        const nameMap: Record<string, string> = {};
        for (const p of participants) nameMap[p.userId] = p.displayName || 'Unknown';
        return { matches, nameMap };
      })
    );
    this.nameMapSub.unsubscribe();
    this.nameMapSub = this.matchesWithNames$.subscribe(vm => { this.dialogNameMap = vm.nameMap; });
  }

  // -------------------------------------
  //          LEAGUE CHANGE EVENT
  // -------------------------------------
  onLeagueChange() {
    if (!this.selectedLeagueId) return;
    this.loadMatches(this.selectedLeagueId);
  }

  // -------------------------------------
  //               REPORTING
  // -------------------------------------
  openReportDialog(match: LeagueMatch) {
    this.dialogMatch = match;
    this.dialogWinnerUid = null;
    this.dialogScore = '';
    this.reportDialogOpen = true;
  }

  closeReportDialog() {
    this.reportDialogOpen = false;
  }

  async submitReport() {
    if (!this.dialogMatch || !this.dialogWinnerUid || !this.dialogScore) {
      alert('Please fill out all fields.');
      return;
    }

    await this.reportScore(this.dialogMatch, this.dialogWinnerUid, this.dialogScore);
    this.closeReportDialog();
  }

  isUser(uid: string | null | undefined): boolean {
    const user = this.auth.currentUser;
    if (!user || !uid) return false;
    return user.uid === uid;
  }

  displayName(uid: string | null | undefined, nameMap: Record<string, string>): string {
    if (!uid) return '—';
    return nameMap[uid] ?? uid;
  }


  // -------------------------------------
  //            ACTION HANDLERS
  // -------------------------------------
  async reportScore(match: LeagueMatch, winnerUid: string, score: string) {
    const user = this.auth.currentUser;
    if (!user) return alert('Please sign in first.');

    try {
      await this.ls.reportMatchResult(match.id!, match.leagueId!, user.uid, winnerUid, score);
      alert('Score reported! Waiting for opponent to confirm.');
    } catch (err) {
      console.error(err);
      alert('Failed to report score.');
    }
  }

  async acceptMatch(match: LeagueMatch) {
    if (!match.id) return;
    try {
      await this.ls.acceptMatch(match.id);
      alert('Match accepted! Coordinate with your opponent and play.');
    } catch (err) {
      console.error(err);
      alert('Failed to accept match.');
    }
  }

  async declineMatch(match: LeagueMatch) {
    if (!match.id) return;
    try {
      await this.ls.declineMatch(match.id);
      alert('Match declined.');
    } catch (err) {
      console.error(err);
      alert('Failed to decline match.');
    }
  }

  async confirmResult(match: LeagueMatch) {
    const user = this.auth.currentUser;
    if (!user) return alert('Please sign in first.');

    try {
      await this.ls.confirmMatchResult(match.id!, user.uid);
      alert('Result confirmed!');
    } catch (err) {
      console.error(err);
      alert('Failed to confirm result.');
    }
  }

  // -------------------------------------
  //        TEMPLATE HELPERS
  // -------------------------------------
  getStatusClass(match: LeagueMatch): string {
    switch (match.status) {
      case 'pending_acceptance':
        return 'status-invite';
      case 'pending':
        return 'status-waiting';
      case 'reported':
      case 'pendingConfirm':
        return 'status-report';
      case 'completed':
        return 'status-final';
      case 'cancelled':
        return 'status-cancelled';
      default:
        return 'status-waiting';
    }
  }

  getMatchStatus(match: LeagueMatch): string {
    switch (match.status) {
      case 'pending_acceptance':
        return this.isUser(match.playerB) ? 'Match request — Accept?' : 'Waiting for opponent to accept';
      case 'pending':
        return 'Ready to play';
      case 'reported':
      case 'pendingConfirm':
        return 'Awaiting your confirmation';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return match.status || 'Unknown';
    }
  }

  shouldShowAccept(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    return match.status === 'pending_acceptance' && match.playerB === uid;
  }

  shouldShowDecline(match: LeagueMatch): boolean {
    return this.shouldShowAccept(match);
  }

  shouldShowReport(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    return match.status === 'pending' && (match.playerA === uid || match.playerB === uid);
  }

  shouldShowConfirm(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    // Opponent reported; you need to attest/confirm
    if (match.status !== 'reported') return false;
    return match.confirmations?.[uid] !== true;
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.nameMapSub.unsubscribe();
  }
}