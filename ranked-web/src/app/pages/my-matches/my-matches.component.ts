import { Component, effect, inject } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { filter, shareReplay } from 'rxjs/operators';
import { LeagueService } from '../../services/league.service';
import { ChatService } from '../../services/chat.service';
import { Auth } from '@angular/fire/auth';
import { LeagueMatch } from '../../models/LeagueMatch';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatchChatComponent } from '../../components/match-chat/match-chat.component';

export interface LeagueParticipantWithName extends LeagueParticipant {
  resolvedLeagueName: string;
}

@Component({
  selector: 'app-my-matches',
  imports: [CommonModule, FormsModule, RouterLink, MatchChatComponent],
  templateUrl: './my-matches.component.html',
  styleUrl: './my-matches.component.scss',
})
export class MyMatchesComponent {
  auth = inject(Auth);
  private authService = inject(AuthService);
  private ls = inject(LeagueService);
  private chatService = inject(ChatService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  userLeagues$!: Observable<LeagueParticipant[]>;
  leaguesWithNames$!: Observable<LeagueParticipantWithName[]>;
  matchesWithNames$!: Observable<{ matches: LeagueMatch[]; nameMap: Record<string, string> }>;

  loading = true;
  error: string | null = null;

  selectedLeagueId: string | null = null;
  private selectedLeagueId$ = new BehaviorSubject<string | null>(null);
  private leaguesList: LeagueParticipantWithName[] = [];
  private sub = new Subscription();
  private nameMapSub = new Subscription();
  private searchRequestSub = new Subscription();

  isSeekingInLeague = false;
  leavingQueue = false;
  queueCount$: Observable<number> = of(0);

  private authInitDone = false;

  // Score dialog
  reportDialogOpen = false;
  dialogMatch: LeagueMatch | null = null;
  dialogWinnerUid: string | null = null;
  dialogScore = '';
  dialogNameMap: Record<string, string> = {};
  submitSuccess = false;

  // Cancel confirmation
  cancelDialogOpen = false;
  cancelDialogMatch: LeagueMatch | null = null;
  cancellingMatchId: string | null = null;

  acceptingMatchId: string | null = null;
  decliningMatchId: string | null = null;
  confirmingMatchId: string | null = null;
  submittingReport = false;
  actionOverlayMessage: string | null = null;

  // Toast
  toastMessage: string | null = null;
  toastType: 'success' | 'error' = 'success';
  private toastTimer: any = null;

  // Score validation
  dialogScoreTouched = false;

  constructor() {
    effect(() => {
      if (this.authInitDone) return;
      if (!this.authService.isAuthReady()) return;
      this.authInitDone = true;
      const profile = this.authService.profile();
      if (!profile?.uid) {
        this.error = 'You must be signed in.';
        this.loading = false;
        return;
      }
      this.initWithUser(profile.uid);
    });
  }

  ngOnInit() {}

  private initWithUser(uid: string) {
    this.userLeagues$ = this.ls.listUserLeagues(uid);
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

    // Reactive pipeline: keep previous matches visible when switching leagues (prevents flicker)
    this.matchesWithNames$ = this.selectedLeagueId$.pipe(
      filter((id): id is string => !!id),
      switchMap(leagueId =>
        combineLatest([
          this.ls.listUserMatches(leagueId, uid),
          this.ls.listParticipants(leagueId)
        ]).pipe(
          map(([matches, participants]) => {
            const nameMap: Record<string, string> = {};
            for (const p of participants) nameMap[p.userId] = p.displayName || 'Unknown';
            const sorted = [...(matches ?? [])].sort((a, b) => this.compareMatchOrder(a, b));
            return { matches: sorted, nameMap };
          })
        )
      ),
      shareReplay(1)
    );

    this.nameMapSub = this.matchesWithNames$.subscribe(vm => { this.dialogNameMap = vm.nameMap; });

    this.sub.add(
      this.leaguesWithNames$.subscribe({
        next: (leagues) => {
          if (!leagues || leagues.length === 0) {
            this.error = 'You are not in any active leagues yet.';
            this.loading = false;
            return;
          }
          this.leaguesList = leagues;
          const leagueFromQuery = this.route.snapshot.queryParamMap.get('league');
          const preferredLeagueId = leagueFromQuery && leagues.some(l => l.leagueId === leagueFromQuery)
            ? leagueFromQuery
            : leagues[0].leagueId;
          this.selectedLeagueId = preferredLeagueId;
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

    this.sub.add(
      this.route.queryParams.subscribe(params => {
        const league = params['league'];
        if (!league || !this.leaguesList?.length) return;
        const valid = this.leaguesList.some(l => l.leagueId === league);
        if (valid && this.selectedLeagueId !== league) {
          this.selectedLeagueId = league;
          this.loadMatches(league);
        }
      })
    );
  }

  loadMatches(leagueId: string) {
    const uid = this.auth.currentUser?.uid ?? this.authService.profile()?.uid;
    if (!uid) return;

    this.selectedLeagueId$.next(leagueId);

    this.searchRequestSub.unsubscribe();
    this.isSeekingInLeague = false;
    this.queueCount$ = this.ls.getQueueCount(leagueId);
    this.searchRequestSub = this.ls.getSearchRequest(leagueId, uid).subscribe(
      r => { this.isSeekingInLeague = r?.seeking ?? false; }
    );
  }

  onLeagueChange() {
    if (!this.selectedLeagueId) return;
    this.loadMatches(this.selectedLeagueId);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { league: this.selectedLeagueId },
      replaceUrl: true
    });
  }

  hasPendingAcceptanceMatch(matches: LeagueMatch[]): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !matches?.length) return false;
    return matches.some(m => m.status === 'pending_acceptance' && m.playerA === uid);
  }

  getOpponentUid(match: LeagueMatch): string | null {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return null;
    return match.playerA === uid ? match.playerB ?? null : match.playerA;
  }

  trackByMatchId(_: number, m: LeagueMatch): string {
    return m.id ?? '';
  }

  /** Active matches first, then completed, then cancelled. Within each group, most recent first. */
  private compareMatchOrder(a: LeagueMatch, b: LeagueMatch): number {
    const priority = (m: LeagueMatch) =>
      ['pending_acceptance', 'pending', 'reported', 'pendingConfirm', 'disputed'].includes(m.status ?? '') ? 0
        : m.status === 'completed' ? 1 : 2;
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    const ts = (m: LeagueMatch) => m.lastActivityAt?.toMillis?.() ?? m.acceptedAt?.toMillis?.() ?? m.createdAt?.toMillis?.() ?? 0;
    return ts(b) - ts(a);
  }

  async leaveQueue() {
    const uid = this.auth.currentUser?.uid ?? this.authService.profile()?.uid;
    if (!this.selectedLeagueId || !uid || this.leavingQueue) return;
    this.leavingQueue = true;
    try {
      await this.ls.leaveMatchQueue(this.selectedLeagueId);
    } catch (err) {
      console.error(err);
    } finally {
      this.leavingQueue = false;
    }
  }

  // ---- Stepper logic ----

  getMatchStep(match: LeagueMatch): number {
    switch (match.status) {
      case 'pending': return 1;
      case 'reported':
      case 'pendingConfirm': return 3;
      case 'completed': return 4;
      default: return 0;
    }
  }

  getDaysLeft(match: LeagueMatch): number | null {
    const deadline = match.matchDeadline;
    if (!deadline) return null;
    const deadlineMs = typeof deadline?.toMillis === 'function' ? deadline.toMillis()
      : typeof deadline === 'number' ? deadline
      : null;
    if (deadlineMs == null) return null;
    const diff = deadlineMs - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  getInactivityDays(match: LeagueMatch): number {
    const lastActivity = match.lastActivityAt ?? match.acceptedAt ?? match.createdAt;
    if (!lastActivity) return 0;
    const ms = typeof lastActivity?.toMillis === 'function' ? lastActivity.toMillis()
      : typeof lastActivity === 'number' ? lastActivity
      : 0;
    if (!ms) return 0;
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  }

  shouldShowNudge(match: LeagueMatch): boolean {
    return match.status === 'pending' && this.getInactivityDays(match) >= 3;
  }

  // ---- Reporting ----

  openReportDialog(match: LeagueMatch) {
    this.dialogMatch = match;
    this.dialogWinnerUid = null;
    this.dialogScore = '';
    this.dialogScoreTouched = false;
    this.reportDialogOpen = true;
  }

  closeReportDialog() {
    this.reportDialogOpen = false;
    this.submittingReport = false;
    this.submitSuccess = false;
  }

  async submitReport() {
    this.dialogScoreTouched = true;
    if (!this.dialogMatch || !this.dialogWinnerUid || !this.dialogScore) {
      this.showToast('Please select a winner and enter the score.', 'error');
      return;
    }
    this.submittingReport = true;
    try {
      await this.reportScore(this.dialogMatch, this.dialogWinnerUid, this.dialogScore);
      this.submitSuccess = true;
      setTimeout(() => {
        this.submitSuccess = false;
        this.closeReportDialog();
      }, 1200);
    } catch {
      this.submittingReport = false;
    }
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

  // ---- Action handlers ----

  async reportScore(match: LeagueMatch, winnerUid: string, score: string) {
    const user = this.auth.currentUser;
    if (!user) { this.showToast('Please sign in first.', 'error'); return; }
    try {
      await this.ls.reportMatchResult(match.id!, match.leagueId!, user.uid, winnerUid, score);
      await this.chatService.sendSystemMessage(match.id!, `Score submitted: ${score}`);
      this.showToast('Score submitted! Your opponent has 48 hours to confirm.');
    } catch (err) {
      console.error(err);
      this.showToast('Failed to submit score. Please try again.', 'error');
    }
  }

  async acceptMatch(match: LeagueMatch) {
    if (!match.id || this.acceptingMatchId) return;
    this.acceptingMatchId = match.id;
    this.actionOverlayMessage = 'Accepting match…';
    try {
      await this.ls.acceptMatch(match.id);
      this.acceptingMatchId = null;
      this.actionOverlayMessage = null;
    } catch (err) {
      console.error(err);
      this.acceptingMatchId = null;
      this.actionOverlayMessage = null;
      this.showToast('Failed to accept match.', 'error');
    }
  }

  async declineMatch(match: LeagueMatch) {
    if (!match.id || this.decliningMatchId) return;
    this.decliningMatchId = match.id;
    this.actionOverlayMessage = 'Declining…';
    try {
      await this.ls.declineMatch(match.id);
      this.decliningMatchId = null;
      this.actionOverlayMessage = null;
    } catch (err) {
      console.error(err);
      this.decliningMatchId = null;
      this.actionOverlayMessage = null;
      this.showToast('Failed to decline match.', 'error');
    }
  }

  // ---- Cancel match ----

  openCancelDialog(match: LeagueMatch) {
    this.cancelDialogMatch = match;
    this.cancelDialogOpen = true;
  }

  closeCancelDialog() {
    this.cancelDialogOpen = false;
    this.cancelDialogMatch = null;
  }

  async confirmCancelMatch() {
    if (!this.cancelDialogMatch?.id) return;
    this.cancellingMatchId = this.cancelDialogMatch.id;
    this.actionOverlayMessage = 'Cancelling match…';
    this.closeCancelDialog();
    try {
      await this.ls.cancelMatch(this.cancelDialogMatch.id);
      this.cancellingMatchId = null;
      this.actionOverlayMessage = null;
    } catch (err) {
      console.error(err);
      this.cancellingMatchId = null;
      this.actionOverlayMessage = null;
      this.showToast('Failed to cancel match.', 'error');
    }
  }

  // ---- Confirm result ----

  async confirmResult(match: LeagueMatch) {
    const user = this.auth.currentUser;
    if (!user) { this.showToast('Please sign in first.', 'error'); return; }
    if (this.confirmingMatchId) return;
    this.confirmingMatchId = match.id!;
    this.actionOverlayMessage = 'Confirming result…';
    try {
      await this.ls.confirmMatchResult(match.id!, user.uid);
      this.confirmingMatchId = null;
      this.actionOverlayMessage = null;
    } catch (err) {
      console.error(err);
      this.confirmingMatchId = null;
      this.actionOverlayMessage = null;
      this.showToast('Failed to confirm result.', 'error');
    }
  }

  // ---- Template helpers ----

  getMatchStatus(match: LeagueMatch): string {
    switch (match.status) {
      case 'pending_acceptance':
        if (!this.hasAccepted(match)) return 'Accept or decline';
        if (!this.opponentHasAccepted(match)) return 'Waiting for opponent';
        return 'Pending';
      case 'pending':
        return 'Ready to play';
      case 'reported':
      case 'pendingConfirm':
        return 'Awaiting confirmation';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return match.status || 'Unknown';
    }
  }

  hasAccepted(match: LeagueMatch, uid?: string): boolean {
    const id = uid ?? this.auth.currentUser?.uid;
    if (!id || !match.acceptances) return false;
    return match.acceptances[id] === true;
  }

  opponentHasAccepted(match: LeagueMatch): boolean {
    const opp = this.getOpponentUid(match);
    return opp ? this.hasAccepted(match, opp) : false;
  }

  waitingForOpponentToAccept(match: LeagueMatch): boolean {
    return match.status === 'pending_acceptance' && this.hasAccepted(match) && !this.opponentHasAccepted(match);
  }

  getConfirmHint(match: LeagueMatch): string | null {
    if (match.status !== 'reported' && match.status !== 'pendingConfirm') return null;
    return 'Your opponent submitted the score. Confirm it\'s correct within 48 hours, or it will be accepted automatically.';
  }

  shouldShowAccept(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    if (match.status !== 'pending_acceptance') return false;
    if (match.playerA !== uid && match.playerB !== uid) return false;
    return !this.hasAccepted(match);
  }

  shouldShowReport(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    return match.status === 'pending' && (match.playerA === uid || match.playerB === uid);
  }

  shouldShowConfirm(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    if (match.status !== 'reported') return false;
    return match.confirmations?.[uid] !== true;
  }

  showToast(message: string, type: 'success' | 'error' = 'success') {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage = message;
    this.toastType = type;
    this.toastTimer = setTimeout(() => this.dismissToast(), 5000);
  }

  dismissToast() {
    this.toastMessage = null;
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
  }

  isScoreFormatValid(score: string): boolean {
    if (!score.trim()) return true;
    return /^\d{1,3}\s*[-–]\s*\d{1,3}(\s*,\s*\d{1,3}\s*[-–]\s*\d{1,3})*$/.test(score.trim());
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.nameMapSub.unsubscribe();
    this.searchRequestSub.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}
