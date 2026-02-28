import { Component, inject, signal } from '@angular/core';
import { LeagueService } from '../../services/league.service';
import { AdminService } from '../../services/admin.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { Auth, authState } from '@angular/fire/auth';

@Component({
  selector: 'app-league-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './league-detail.component.html',
  styleUrl: './league-detail.component.scss',
})
export class LeagueDetailComponent {
  ls = inject(LeagueService);
  adminService = inject(AdminService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private auth = inject(Auth);

  leagueId = this.route.snapshot.paramMap.get('id')!;
  league$ = this.ls.getLeague(this.leagueId);
  participants$: Observable<LeagueParticipant[]> = this.ls.listParticipants(this.leagueId);

  findingMatch = false;
  findMatchError: string | null = null;
  /** After a successful find: 'queued' | 'matched'. Cleared when user navigates or dismisses. */
  findMatchResult: 'queued' | 'matched' | null = null;
  /** When matched, opponent uid for optional display. */
  findMatchOpponentUid: string | null = null;
  leaving = false;
  deleting = false;
  /** true = in league, false = not in league, null = still loading */
  isInLeague = signal<boolean | null>(null);
  isAdmin$ = this.adminService.isAdmin$;
  /** True when user is in the matchmaking queue for this league (so we don't allow Find Match again). */
  isSeekingInLeague$: Observable<boolean> = authState(this.auth).pipe(
    switchMap(user => !user ? of(false) : this.ls.getSearchRequest(this.leagueId, user.uid).pipe(map(r => r?.seeking ?? false)))
  );

  constructor() {
    authState(this.auth).subscribe(user => {
      if (user) {
        this.ls.listUserLeagues(user.uid).subscribe(parts => {
          const inLeague = !!parts?.find(p => p.leagueId === this.leagueId);
          this.isInLeague.set(inLeague);
        });
      } else {
        this.isInLeague.set(false);
      }
    });
    // Fallback: if user appears in standings, they're in the league (handles race conditions)
    this.participants$.subscribe(participants => {
      const user = this.auth.currentUser;
      if (user && participants?.some(p => p.userId === user.uid) && this.isInLeague() !== true) {
        this.isInLeague.set(true);
      }
    });
  }

  async findMatch() {
    const user = this.auth.currentUser;
    if (!user) {
      this.findMatchError = 'Please sign in first.';
      return;
    }

    this.findMatchError = null;
    this.findMatchResult = null;
    this.findMatchOpponentUid = null;
    this.findingMatch = true;

    try {
      const participants = await firstValueFrom(this.ls.listUserLeagues(user.uid));
      const part = participants?.find(p => p.leagueId === this.leagueId);
      if (!part) {
        this.findMatchError = 'Join this league first to find a match.';
        return;
      }
      const rank = part.currentRank ?? 1000;

      const resp = await this.ls.findMatchOnDemand(this.leagueId, user.uid, rank, '');

      if (resp?.status === 'queued') {
        this.findMatchResult = 'queued';
        this.findMatchError = null;
        // Stay on page so user sees the message; they can click "Go to My Matches"
      } else if (resp?.status === 'matched') {
        this.findMatchResult = 'matched';
        this.findMatchOpponentUid = resp?.opponentUid ?? null;
        this.findMatchError = null;
        // Stay on page so user sees the message; they can click "Go to My Matches"
      } else {
        this.findMatchError = 'Something went wrong. Try again.';
      }
    } catch (err: any) {
      const msg = err?.error?.error || err?.error?.detail || err?.message ||
        (err?.status === 0 ? 'Network error. Check your connection and try again.' : 'Could not find match.');
      this.findMatchError = msg;
      console.error('Find match error:', err);
    } finally {
      this.findingMatch = false;
    }
  }

  openMatches() {
    this.findMatchResult = null;
    this.findMatchOpponentUid = null;
    this.router.navigate(['/my-matches'], { queryParams: { league: this.leagueId } });
  }

  openLeaderboard() {
    this.router.navigate(['/leagues', this.leagueId, 'leaderboard']);
  }

  async leaveLeague() {
    const user = this.auth.currentUser;
    if (!user || this.leaving) return;
    if (!confirm('Leave this league? Your wins and rank in this league will no longer be tracked here.')) return;
    this.leaving = true;
    try {
      await this.ls.leaveLeague(this.leagueId, user.uid);
      this.isInLeague.set(false);
      this.router.navigate(['/leagues']);
    } catch (err) {
      console.error(err);
      alert('Could not leave league. Please try again.');
    } finally {
      this.leaving = false;
    }
  }

  async deleteLeague() {
    if (this.deleting) return;
    const name = (await firstValueFrom(this.league$))?.name || this.leagueId;
    if (!confirm(`Permanently delete the league "${name}"? All members and matches will be removed. This cannot be undone.`)) return;
    this.deleting = true;
    try {
      await this.ls.deleteLeague(this.leagueId);
      this.router.navigate(['/leagues']);
    } catch (err) {
      console.error(err);
      alert('Could not delete league. Please try again.');
    } finally {
      this.deleting = false;
    }
  }

}