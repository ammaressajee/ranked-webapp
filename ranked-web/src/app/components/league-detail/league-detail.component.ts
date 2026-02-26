import { Component, inject, signal } from '@angular/core';
import { LeagueService } from '../../services/league.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Observable } from 'rxjs';
import { LeagueParticipant } from '../../models/LeagueParticipant';
import { getAuth } from '@angular/fire/auth';

@Component({
  selector: 'app-league-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './league-detail.component.html',
  styleUrl: './league-detail.component.scss',
})
export class LeagueDetailComponent {
  ls = inject(LeagueService);
  route = inject(ActivatedRoute);
  router = inject(Router);

  leagueId = this.route.snapshot.paramMap.get('id')!;
  league$ = this.ls.getLeague(this.leagueId);
  participants$: Observable<LeagueParticipant[]> = this.ls.listParticipants(this.leagueId);

  findingMatch = false;
  findMatchError: string | null = null;
  findMatchQueued = false;
  private auth = getAuth();
  /** true = in league, false = not in league, null = still loading */
  isInLeague = signal<boolean | null>(null);

  constructor() {
    const user = this.auth.currentUser;
    if (user) {
      this.ls.listUserLeagues(user.uid).subscribe(parts => {
        const inLeague = !!parts?.find(p => p.leagueId === this.leagueId);
        this.isInLeague.set(inLeague);
      });
    } else {
      this.isInLeague.set(false);
    }
  }

  async findMatch() {
    const user = this.auth.currentUser;
    if (!user) {
      this.findMatchError = 'Please sign in first.';
      return;
    }

    this.findMatchError = null;
    this.findMatchQueued = false;
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
        this.findMatchQueued = true;
        this.findMatchError = null;
        this.router.navigate(['/my-matches']);
      } else if (resp?.status === 'matched') {
        this.findMatchError = null;
        this.router.navigate(['/my-matches']);
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
    this.router.navigate(['/my-matches']);
  }

  openLeaderboard() {
    this.router.navigate(['/leagues', this.leagueId, 'leaderboard']);
  }

}