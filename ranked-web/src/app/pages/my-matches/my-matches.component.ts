import { Component, effect, inject } from '@angular/core';
import { combineLatest, map, Observable, of, Subscription, switchMap } from 'rxjs';
import { LeagueService, ACCEPT_DEADLINE_MINUTES } from '../../services/league.service';
import { Auth } from '@angular/fire/auth';
import { AgreedSlot, AvailabilitySlot, LeagueMatch, PeriodLabel } from '../../models/LeagueMatch';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { SharedContactDisplay } from '../../models/UserContactPreferences';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  private authService = inject(AuthService);
  private ls = inject(LeagueService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  userLeagues$!: Observable<LeagueParticipant[]>;
  /** Participants with league names resolved (fetches from leagues if leagueName missing) */
  leaguesWithNames$!: Observable<LeagueParticipantWithName[]>;
  matches$!: Observable<LeagueMatch[]>;
  participants$!: Observable<LeagueParticipant[]>;
  matchesWithNames$!: Observable<{ matches: LeagueMatch[]; nameMap: Record<string, string> }>;

  loading = true;
  error: string | null = null;

  selectedLeagueId: string | null = null;
  /** Latest leagues list (from leaguesWithNames$) so we can apply query param when it changes. */
  private leaguesList: LeagueParticipantWithName[] = [];
  private sub = new Subscription();
  private nameMapSub = new Subscription();
  private searchRequestSub = new Subscription();

  /** True when user is in the matchmaking queue for the selected league. */
  isSeekingInLeague = false;
  leavingQueue = false;
  /** Queue count for selected league (updated in loadMatches). */
  queueCount$: Observable<number> = of(0);

  /** Ensure we only run init once (effect can run multiple times). */
  private authInitDone = false;

  // Report dialog state
  reportDialogOpen = false;
  dialogMatch: LeagueMatch | null = null;
  dialogWinnerUid: string | null = null;
  dialogScore = '';
  dialogNameMap: Record<string, string> = {};

  /** Loading states to prevent double-clicks and show feedback */
  acceptingMatchId: string | null = null;
  decliningMatchId: string | null = null;
  confirmingMatchId: string | null = null;
  submittingReport = false;
  /** Message for the action overlay (Accepting match... / Declining... / Confirming...) */
  actionOverlayMessage: string | null = null;

  /** Availability grid: next 10 days (YYYY-MM-DD). */
  readonly PERIODS: { id: PeriodLabel; label: string }[] = [
    { id: 'morning', label: 'Morning' },
    { id: 'afternoon', label: 'Afternoon' },
    { id: 'evening', label: 'Evening' }
  ];
  /** Time options per period for exact-time dropdown. */
  readonly TIME_OPTIONS: Record<PeriodLabel, string[]> = {
    morning: ['8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM'],
    afternoon: ['12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'],
    evening: ['5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM']
  };
  /** When user is editing availability, we store their selection here until Save. */
  availabilityDraft: { matchId: string; slots: AvailabilitySlot[] } | null = null;
  savingAvailabilityMatchId: string | null = null;
  confirmingSlotMatchId: string | null = null;
  settingTimeMatchId: string | null = null;

  constructor() {
    // When auth is ready (after reload or on first load), init once
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
    // Step 1 — list leagues and enrich with names
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

    // Step 2 — subscribe to leagues (use leaguesWithNames$ for same leagueIds)
    this.sub.add(
      this.leaguesWithNames$.subscribe({
        next: (leagues) => {
          if (!leagues || leagues.length === 0) {
            this.error = 'You are not in any active leagues yet.';
            this.loading = false;
            return;
          }

          this.leaguesList = leagues;

          // Prefer league from query (e.g. from home page "Go to My Matches" alert or league detail)
          const leagueFromQuery = this.route.snapshot.queryParamMap.get('league');
          const preferredLeagueId = leagueFromQuery && leagues.some(l => l.leagueId === leagueFromQuery)
            ? leagueFromQuery
            : leagues[0].leagueId;
          this.selectedLeagueId = preferredLeagueId;

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

    // React to query param changes (e.g. user clicks "Go to My Matches" from home alert or league detail with ?league=)
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

  // -------------------------------------
  //         LOAD MATCHES FOR LEAGUE
  // -------------------------------------
  loadMatches(leagueId: string) {
    const uid = this.auth.currentUser?.uid ?? this.authService.profile()?.uid;
    if (!uid) return;

    this.opponentContactCache.clear();
    this.matches$ = this.ls.listUserMatches(leagueId, uid);
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

    this.searchRequestSub.unsubscribe();
    this.isSeekingInLeague = false;
    this.queueCount$ = this.ls.getQueueCount(leagueId);
    this.searchRequestSub = this.ls.getSearchRequest(leagueId, uid).subscribe(
      r => { this.isSeekingInLeague = r?.seeking ?? false; }
    );
  }

  // -------------------------------------
  //          LEAGUE CHANGE EVENT
  // -------------------------------------
  onLeagueChange() {
    if (!this.selectedLeagueId) return;
    this.loadMatches(this.selectedLeagueId);
    // Keep URL in sync so refresh or shared link shows this league
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { league: this.selectedLeagueId },
      replaceUrl: true
    });
  }

  /** True if current user has a match in the list waiting for opponent to accept (user is playerA). */
  hasPendingAcceptanceMatch(matches: LeagueMatch[]): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid || !matches?.length) return false;
    return matches.some(m => m.status === 'pending_acceptance' && m.playerA === uid);
  }

  /** Opponent UID for a match (the other player). */
  getOpponentUid(match: LeagueMatch): string | null {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return null;
    return match.playerA === uid ? match.playerB ?? null : match.playerA;
  }

  private opponentContactCache = new Map<string, Observable<SharedContactDisplay | null>>();

  /** Shared contact for the opponent on this match (only visible when they've opted in). Cached per match id. */
  getOpponentContact(match: LeagueMatch): Observable<SharedContactDisplay | null> {
    const id = match.id;
    if (!id) return of(null);
    if (this.opponentContactCache.has(id)) return this.opponentContactCache.get(id)!;
    const uid = this.auth.currentUser?.uid;
    const opp = this.getOpponentUid(match);
    if (!uid || !opp) return of(null);
    const obs = this.ls.getSharedContactForUser(opp, { match, viewerUid: uid });
    this.opponentContactCache.set(id, obs);
    return obs;
  }

  /** True if current user has already shared their contact for this match. */
  hasSharedMyContact(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    return !!((match.playerA === uid && match.sharedContactByPlayerA) || (match.playerB === uid && match.sharedContactByPlayerB));
  }

  sharingContactMatchId: string | null = null;

  async shareMyContactWithOpponent(match: LeagueMatch) {
    if (!match.id) return;
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    this.sharingContactMatchId = match.id;
    try {
      const isPlayerA = match.playerA === uid;
      await this.ls.setMatchSharedContact(match.id, isPlayerA);
    } finally {
      this.sharingContactMatchId = null;
    }
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
    this.submittingReport = true;
    try {
      await this.reportScore(this.dialogMatch, this.dialogWinnerUid, this.dialogScore);
      this.closeReportDialog();
    } finally {
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


  // -------------------------------------
  //            ACTION HANDLERS
  // -------------------------------------
  async reportScore(match: LeagueMatch, winnerUid: string, score: string) {
    const user = this.auth.currentUser;
    if (!user) return alert('Please sign in first.');

    try {
      await this.ls.reportMatchResult(match.id!, match.leagueId!, user.uid, winnerUid, score);
      alert('Score reported! Your opponent has 48 hours to confirm. If they don\'t respond, the score will be accepted automatically.');
    } catch (err) {
      console.error(err);
      alert('Failed to report score.');
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
      alert('Match accepted! Coordinate with your opponent and play.');
    } catch (err) {
      console.error(err);
      this.acceptingMatchId = null;
      this.actionOverlayMessage = null;
      alert('Failed to accept match.');
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
      alert('Match declined.');
    } catch (err) {
      console.error(err);
      this.decliningMatchId = null;
      this.actionOverlayMessage = null;
      alert('Failed to decline match.');
    }
  }

  async confirmResult(match: LeagueMatch) {
    const user = this.auth.currentUser;
    if (!user) return alert('Please sign in first.');
    if (this.confirmingMatchId) return;
    this.confirmingMatchId = match.id!;
    this.actionOverlayMessage = 'Confirming result…';
    try {
      await this.ls.confirmMatchResult(match.id!, user.uid);
      this.confirmingMatchId = null;
      this.actionOverlayMessage = null;
      alert('Result confirmed!');
    } catch (err) {
      console.error(err);
      this.confirmingMatchId = null;
      this.actionOverlayMessage = null;
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
        if (!this.hasAccepted(match)) return 'Accept or decline';
        if (!this.opponentHasAccepted(match)) return 'Waiting for opponent to accept';
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

  /** True if the given user has accepted this pending_acceptance match. */
  hasAccepted(match: LeagueMatch, uid?: string): boolean {
    const id = uid ?? this.auth.currentUser?.uid;
    if (!id || !match.acceptances) return false;
    return match.acceptances[id] === true;
  }

  /** True if the other player has accepted (for pending_acceptance). */
  opponentHasAccepted(match: LeagueMatch): boolean {
    const opp = this.getOpponentUid(match);
    return opp ? this.hasAccepted(match, opp) : false;
  }

  /** True when match is pending_acceptance, current user has accepted, and we're waiting for the other player. */
  waitingForOpponentToAccept(match: LeagueMatch): boolean {
    return match.status === 'pending_acceptance' && this.hasAccepted(match) && !this.opponentHasAccepted(match);
  }

  /** Short hint for reported matches: confirm within 48h. */
  getConfirmHint(match: LeagueMatch): string | null {
    if (match.status !== 'reported' && match.status !== 'pendingConfirm') return null;
    return 'Confirm or contest within 48 hours, or the reported score will stand.';
  }

  /** For pending_acceptance: "Accept by 3:42 PM (8 min left)" or "Offer expired". */
  getAcceptDeadlineText(match: LeagueMatch): string | null {
    if (match.status !== 'pending_acceptance' || !match.createdAt) return null;
    const createdMs = this.getCreatedAtMs(match);
    if (createdMs == null) return null;
    const deadlineMs = createdMs + ACCEPT_DEADLINE_MINUTES * 60 * 1000;
    const now = Date.now();
    if (now >= deadlineMs) return 'Offer expired — you can decline and search again.';
    const deadlineDate = new Date(deadlineMs);
    const timeStr = deadlineDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const minLeft = Math.max(0, Math.ceil((deadlineMs - now) / 60000));
    return `Accept by ${timeStr} (${minLeft} min left)`;
  }

  private getCreatedAtMs(match: LeagueMatch): number | null {
    const v = match.createdAt;
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (v && typeof (v as any).toMillis === 'function') return (v as any).toMillis();
    if (v instanceof Date) return v.getTime();
    return null;
  }

  // ---------- Availability grid (10 days × 3 periods) ----------
  getAvailabilityDays(): string[] {
    const out: string[] = [];
    const d = new Date();
    for (let i = 0; i < 10; i++) {
      const x = new Date(d);
      x.setDate(x.getDate() + i);
      out.push(x.toISOString().slice(0, 10));
    }
    return out;
  }

  getMyAvailability(match: LeagueMatch): AvailabilitySlot[] {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return [];
    if (this.availabilityDraft?.matchId === match.id) return this.availabilityDraft!.slots;
    const arr = match.playerA === uid ? (match.availabilityA ?? []) : (match.availabilityB ?? []);
    return [...arr];
  }

  getOpponentAvailability(match: LeagueMatch): AvailabilitySlot[] {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return [];
    return match.playerA === uid ? (match.availabilityB ?? []) : (match.availabilityA ?? []);
  }

  isSlotInList(slots: AvailabilitySlot[], date: string, period: PeriodLabel): boolean {
    return slots.some(s => s.date === date && s.period === period);
  }

  getOverlappingSlots(match: LeagueMatch): AvailabilitySlot[] {
    const mine = this.getMyAvailability(match);
    const opp = this.getOpponentAvailability(match);
    return mine.filter(m => opp.some(o => o.date === m.date && o.period === m.period));
  }

  startEditingAvailability(match: LeagueMatch) {
    this.availabilityDraft = { matchId: match.id!, slots: this.getMyAvailability(match) };
  }

  cancelEditingAvailability() {
    this.availabilityDraft = null;
  }

  toggleAvailabilitySlot(match: LeagueMatch, date: string, period: PeriodLabel) {
    if (this.availabilityDraft?.matchId !== match.id) {
      this.availabilityDraft = { matchId: match.id!, slots: this.getMyAvailability(match) };
    }
    const d = this.availabilityDraft!;
    const idx = d.slots.findIndex(s => s.date === date && s.period === period);
    if (idx >= 0) d.slots.splice(idx, 1);
    else d.slots.push({ date, period });
    d.slots.sort((a, b) => a.date.localeCompare(b.date) || a.period.localeCompare(b.period));
  }

  async saveMyAvailability(match: LeagueMatch) {
    if (!match.id) return;
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    const isPlayerA = match.playerA === uid;
    const slots = this.availabilityDraft?.matchId === match.id ? this.availabilityDraft.slots : this.getMyAvailability(match);
    this.savingAvailabilityMatchId = match.id;
    try {
      await this.ls.setMatchAvailability(match.id, isPlayerA, slots);
      this.availabilityDraft = null;
    } catch (e) {
      console.error(e);
      alert('Failed to save availability.');
    } finally {
      this.savingAvailabilityMatchId = null;
    }
  }

  async confirmSlot(match: LeagueMatch, date: string, period: PeriodLabel) {
    if (!match.id) return;
    this.confirmingSlotMatchId = match.id;
    try {
      await this.ls.setAgreedSlot(match.id, { date, period });
    } catch (e) {
      console.error(e);
      alert('Failed to confirm slot.');
    } finally {
      this.confirmingSlotMatchId = null;
    }
  }

  async setAgreedTime(match: LeagueMatch, time: string) {
    if (!match.id || !match.agreedSlot) return;
    this.settingTimeMatchId = match.id;
    try {
      await this.ls.setAgreedSlot(match.id, { ...match.agreedSlot, time });
    } catch (e) {
      console.error(e);
      alert('Failed to set time.');
    } finally {
      this.settingTimeMatchId = null;
    }
  }

  formatDayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
  }

  /** Show Accept/Decline when either player and they haven't accepted yet. */
  shouldShowAccept(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    if (match.status !== 'pending_acceptance') return false;
    if (match.playerA !== uid && match.playerB !== uid) return false;
    return !this.hasAccepted(match);
  }

  shouldShowDecline(match: LeagueMatch): boolean {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return false;
    return match.status === 'pending_acceptance' && (match.playerA === uid || match.playerB === uid);
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
    this.searchRequestSub.unsubscribe();
  }
}